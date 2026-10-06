from uuid import UUID

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.challenge import PUBLIC_STATUSES, Challenge, ChallengeStatus


class ChallengeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_today(self) -> Challenge | None:
        status_rank = case(
            (Challenge.status == ChallengeStatus.LIVE, 0),
            (Challenge.status == ChallengeStatus.READY, 1),
            (Challenge.status == ChallengeStatus.REGISTRATION, 2),
            else_=3,
        )
        stmt = (
            select(Challenge)
            .where(Challenge.status.in_(PUBLIC_STATUSES))
            .order_by(
                status_rank,
                Challenge.starts_at.asc().nulls_last(),
                Challenge.created_at.desc(),
            )
            .limit(1)
        )
        return (await self.session.scalars(stmt)).first()

    async def list_open(self, category: str | None = None) -> list[Challenge]:
        """Challenges a player can still join. Completed challenges stay off this list."""
        status_rank = case(
            (Challenge.status == ChallengeStatus.LIVE, 0),
            (Challenge.status == ChallengeStatus.READY, 1),
            (Challenge.status == ChallengeStatus.REGISTRATION, 2),
            else_=3,
        )
        conditions: list[ColumnElement[bool]] = [
            Challenge.status.in_(
                (
                    ChallengeStatus.LIVE,
                    ChallengeStatus.READY,
                    ChallengeStatus.REGISTRATION,
                )
            )
        ]
        if category:
            conditions.append(Challenge.category == category)
        stmt = (
            select(Challenge)
            .where(*conditions)
            .order_by(
                status_rank,
                Challenge.starts_at.asc().nulls_last(),
                Challenge.created_at.desc(),
            )
        )
        return list((await self.session.scalars(stmt)).all())

    async def get_public(self, challenge_id: UUID) -> Challenge | None:
        challenge = await self.session.get(Challenge, challenge_id)
        if challenge is None or challenge.status not in PUBLIC_STATUSES:
            return None
        return challenge

    async def list_recent_completed(self, limit: int = 10) -> list[Challenge]:
        """Recently completed challenges with settled winners for player results."""
        stmt = (
            select(Challenge)
            .where(Challenge.status == ChallengeStatus.COMPLETED)
            .order_by(Challenge.settled_at.desc().nulls_last(), Challenge.created_at.desc())
            .limit(limit)
        )
        return list((await self.session.scalars(stmt)).all())
