from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entry import ChallengeEntry


class EntryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, challenge_id: UUID, user_id: UUID) -> ChallengeEntry | None:
        return await self.session.scalar(
            select(ChallengeEntry).where(
                ChallengeEntry.challenge_id == challenge_id,
                ChallengeEntry.user_id == user_id,
            )
        )

    async def join(
        self,
        challenge_id: UUID,
        user_id: UUID,
        *,
        terms_version: str,
    ) -> tuple[ChallengeEntry, bool]:
        stmt = (
            pg_insert(ChallengeEntry)
            .values(
                challenge_id=challenge_id,
                user_id=user_id,
                terms_version=terms_version,
            )
            .on_conflict_do_nothing(
                index_elements=[
                    ChallengeEntry.challenge_id,
                    ChallengeEntry.user_id,
                ]
            )
            .returning(ChallengeEntry)
        )
        created = await self.session.scalar(stmt)
        if created is not None:
            return created, True
        existing = await self.get(challenge_id, user_id)
        if existing is None:
            raise RuntimeError("Challenge entry conflict did not return an existing entry.")
        return existing, False

    async def count(self, challenge_id: UUID) -> int:
        value = await self.session.scalar(
            select(func.count())
            .select_from(ChallengeEntry)
            .where(ChallengeEntry.challenge_id == challenge_id)
        )
        return int(value or 0)
