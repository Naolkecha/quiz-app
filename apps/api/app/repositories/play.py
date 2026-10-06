"""Stored plays and the questions a player is allowed to see."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.attempt import Attempt, AttemptStatus
from app.models.challenge import Challenge
from app.models.question import Question
from app.models.user import User

# Network slack after the clock hits zero. Answers after this are not scored.
SUBMIT_GRACE_SECONDS = 5


class PlayRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_attempt(self, challenge_id: UUID, user_id: UUID) -> Attempt | None:
        return await self.session.scalar(
            select(Attempt).where(
                Attempt.challenge_id == challenge_id,
                Attempt.user_id == user_id,
            )
        )

    async def lock_attempt(self, challenge_id: UUID, user_id: UUID) -> Attempt | None:
        return await self.session.scalar(
            select(Attempt)
            .where(
                Attempt.challenge_id == challenge_id,
                Attempt.user_id == user_id,
            )
            .with_for_update()
        )

    async def questions(self, challenge_id: UUID) -> list[Question]:
        stmt = (
            select(Question)
            .where(Question.challenge_id == challenge_id)
            .options(selectinload(Question.choices))
            .order_by(Question.position)
        )
        return list((await self.session.scalars(stmt)).all())

    async def close_expired(self, challenge: Challenge, now: datetime) -> int:
        cutoff = now - timedelta(seconds=challenge.duration_seconds + SUBMIT_GRACE_SECONDS)
        rows = list(
            (
                await self.session.scalars(
                    select(Attempt)
                    .where(
                        Attempt.challenge_id == challenge.id,
                        Attempt.status == AttemptStatus.IN_PROGRESS,
                        Attempt.started_at <= cutoff,
                    )
                    .with_for_update()
                )
            ).all()
        )
        for attempt in rows:
            attempt.status = AttemptStatus.FINISHED
            attempt.score = 0
            attempt.elapsed_ms = challenge.duration_seconds * 1000
            attempt.finished_at = attempt.started_at + timedelta(seconds=challenge.duration_seconds)
        return len(rows)

    async def leaderboard(self, challenge_id: UUID) -> list[tuple[Attempt, User]]:
        stmt = (
            select(Attempt, User)
            .join(User, User.id == Attempt.user_id)
            .where(
                Attempt.challenge_id == challenge_id,
                Attempt.status == AttemptStatus.FINISHED,
            )
            .order_by(
                Attempt.score.desc(),
                Attempt.elapsed_ms.asc(),
                Attempt.finished_at.asc(),
            )
        )
        return list((await self.session.execute(stmt)).all())


def utc_now() -> datetime:
    return datetime.now(UTC)
