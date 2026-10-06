"""Free rounds: no entry fee, a small cash prize, and a fixed number of seats.

Each tier always has one open round. When a round fills and everyone has played,
the top player is paid into their wallet and the next round of that tier opens.
"""

import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.attempt import Attempt, AttemptStatus
from app.models.challenge import Challenge, ChallengeStatus
from app.models.entry import ChallengeEntry
from app.models.question import Choice, Question
from app.models.user import User
from app.repositories.play import PlayRepository
from app.services.notify import TelegramNotifier
from app.services.wallets import WalletService

FREE_QUESTION_COUNT = 10
FREE_DURATION_SECONDS = 30
# A player who joins but never starts gives up their seat after this long.
START_WINDOW = timedelta(minutes=15)


@dataclass(frozen=True, slots=True)
class FreeTier:
    seats: int
    prize_etb: Decimal

    @property
    def title(self) -> str:
        return f"Free {self.prize_etb:.0f} ETB Round"


FREE_TIERS = (
    FreeTier(seats=10, prize_etb=Decimal("10")),
    FreeTier(seats=20, prize_etb=Decimal("20")),
    FreeTier(seats=50, prize_etb=Decimal("50")),
)


def is_free_round(challenge: Challenge) -> bool:
    return challenge.max_participants is not None and challenge.entry_fee_etb == 0


class FreeRoundService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.plays = PlayRepository(session)

    async def ensure_open_rounds(self) -> None:
        """Open a round for any tier that has none. Needs a challenge with questions to copy."""
        created = False
        for tier in FREE_TIERS:
            if await self._open_round(tier) is None:
                created = await self._create_round(tier) or created
        if created:
            await self.session.commit()

    async def settle_if_ready(self, challenge: Challenge) -> bool:
        if not is_free_round(challenge) or challenge.settled_at is not None:
            return False
        locked = await self.session.scalar(
            select(Challenge).where(Challenge.id == challenge.id).with_for_update()
        )
        if locked is None or locked.settled_at is not None:
            return False
        if not await self._ready(locked):
            return False

        now = datetime.now(UTC)
        winner = await self._winner(locked)
        locked.status = ChallengeStatus.COMPLETED
        locked.settled_at = now
        locked.registration_closes_at = now
        if winner is not None:
            locked.winner_user_id = winner
            await WalletService(self.session).award_prize(
                winner,
                challenge_id=locked.id,
                challenge_title=locked.title,
                amount=locked.base_prize_etb,
            )
        tier = next((item for item in FREE_TIERS if item.seats == locked.max_participants), None)
        if tier is not None:
            await self._create_round(tier, source=locked)
        await self.session.commit()
        if winner is not None:
            player = await self.session.get(User, winner)
            if player is not None:
                await TelegramNotifier(self.session).prize_won(
                    player,
                    title=locked.title,
                    amount=locked.base_prize_etb,
                )
        return True

    async def _ready(self, challenge: Challenge) -> bool:
        seats = challenge.max_participants or 0
        now = datetime.now(UTC)
        await self.plays.close_expired(challenge, now)
        entries = list(
            (
                await self.session.scalars(
                    select(ChallengeEntry).where(ChallengeEntry.challenge_id == challenge.id)
                )
            ).all()
        )
        if len(entries) < seats:
            return False
        attempts = {
            attempt.user_id: attempt
            for attempt in (
                await self.session.scalars(
                    select(Attempt).where(Attempt.challenge_id == challenge.id)
                )
            ).all()
        }
        for entry in entries:
            attempt = attempts.get(entry.user_id)
            if attempt is None:
                if now - entry.joined_at < START_WINDOW:
                    return False
                continue
            if attempt.status != AttemptStatus.FINISHED:
                return False
        return True

    async def _winner(self, challenge: Challenge) -> UUID | None:
        rows = await self.plays.leaderboard(challenge.id)
        if not rows:
            return None
        attempt, _player = rows[0]
        return attempt.user_id

    async def _open_round(self, tier: FreeTier) -> Challenge | None:
        return await self.session.scalar(
            select(Challenge)
            .where(
                Challenge.max_participants == tier.seats,
                Challenge.entry_fee_etb == 0,
                Challenge.settled_at.is_(None),
                Challenge.status == ChallengeStatus.LIVE,
            )
            .limit(1)
        )

    async def _create_round(self, tier: FreeTier, *, source: Challenge | None = None) -> bool:
        bank = await self._question_bank(source)
        if len(bank) < FREE_QUESTION_COUNT:
            return False
        number = await self._next_round_number(tier)
        now = datetime.now(UTC)
        challenge = Challenge(
            title=f"{tier.title} #{number}",
            description=(
                f"Free to join. {tier.seats} players. The top score wins "
                f"{tier.prize_etb:.0f} ETB, paid into your wallet."
            ),
            entry_fee_etb=Decimal("0"),
            minimum_participants=tier.seats,
            max_participants=tier.seats,
            base_prize_etb=tier.prize_etb,
            extra_prize_per_participant_etb=Decimal("0"),
            question_count=FREE_QUESTION_COUNT,
            duration_seconds=FREE_DURATION_SECONDS,
            category="general",
            registration_opens_at=now,
            starts_at=now,
            status=ChallengeStatus.LIVE,
        )
        self.session.add(challenge)
        await self.session.flush()
        for position, question in enumerate(random.sample(bank, FREE_QUESTION_COUNT), start=1):
            copy = Question(challenge_id=challenge.id, position=position, prompt=question.prompt)
            self.session.add(copy)
            await self.session.flush()
            choices = list(question.choices)
            random.shuffle(choices)
            for index, choice in enumerate(choices, start=1):
                self.session.add(
                    Choice(
                        question_id=copy.id,
                        position=index,
                        label=choice.label,
                        is_correct=choice.is_correct,
                    )
                )
        await self.session.flush()
        return True

    async def _question_bank(self, source: Challenge | None) -> list[Question]:
        challenge_id = source.id if source is not None else None
        if challenge_id is None:
            challenge_id = await self.session.scalar(
                select(Question.challenge_id)
                .join(Challenge, Challenge.id == Question.challenge_id)
                .where(Challenge.max_participants.is_(None))
                .group_by(Question.challenge_id)
                .order_by(func.count().desc())
                .limit(1)
            )
        if challenge_id is None:
            return []
        return list(
            (
                await self.session.scalars(
                    select(Question)
                    .where(Question.challenge_id == challenge_id)
                    .options(selectinload(Question.choices))
                )
            ).all()
        )

    async def _next_round_number(self, tier: FreeTier) -> int:
        count = await self.session.scalar(
            select(func.count())
            .select_from(Challenge)
            .where(Challenge.max_participants == tier.seats, Challenge.entry_fee_etb == 0)
        )
        return int(count or 0) + 1
