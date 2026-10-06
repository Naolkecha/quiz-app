from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, PlayError
from app.models.challenge import Challenge, ChallengeStatus
from app.models.entry import ChallengeEntry
from app.models.user import User
from app.repositories.challenges import ChallengeRepository
from app.repositories.entries import EntryRepository
from app.services.admins import AdminService
from app.services.wallets import WalletService

CURRENT_TERMS_VERSION = "2026-10-01"


class EntryService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.challenges = ChallengeRepository(session)
        self.entries = EntryRepository(session)

    async def current(self, challenge_id: UUID, user: User) -> ChallengeEntry | None:
        challenge = await self.challenges.get_public(challenge_id)
        if challenge is None:
            raise NotFoundError("No challenge is scheduled.")
        return await self.entries.get(challenge_id, user.id)

    async def join(self, challenge_id: UUID, user: User) -> ChallengeEntry:
        if await AdminService(self.session).is_admin(user):
            raise PlayError(
                "admin_cannot_play",
                "Admin accounts manage Challenge and cannot join challenges.",
                status_code=403,
            )
        challenge = await self.challenges.get_public(challenge_id)
        if challenge is None:
            raise NotFoundError("No challenge is scheduled.")
        if challenge.status == ChallengeStatus.COMPLETED:
            raise PlayError("challenge_closed", "This challenge is closed.")
        existing = await self.entries.get(challenge_id, user.id)
        if existing is not None:
            return existing

        if challenge.max_participants is not None:
            await self.session.scalar(
                select(Challenge.id).where(Challenge.id == challenge.id).with_for_update()
            )
            if await self.entries.count(challenge.id) >= challenge.max_participants:
                await self.session.rollback()
                raise PlayError("challenge_full", "This round is full. Join the next one.")

        await WalletService(self.session).charge_entry_fee(
            user,
            challenge_id=challenge.id,
            challenge_title=challenge.title,
            fee=challenge.entry_fee_etb,
        )
        entry, _created = await self.entries.join(
            challenge_id,
            user.id,
            terms_version=CURRENT_TERMS_VERSION,
        )
        await self.session.commit()
        return entry
