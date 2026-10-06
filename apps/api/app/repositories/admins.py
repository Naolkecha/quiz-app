from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin import AdminAccount


class AdminRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def by_username(self, username: str) -> AdminAccount | None:
        return await self.session.scalar(
            select(AdminAccount).where(func.lower(AdminAccount.username) == username.lower())
        )

    async def list_all(self) -> Sequence[AdminAccount]:
        return (
            await self.session.scalars(
                select(AdminAccount).order_by(AdminAccount.created_at.asc(), AdminAccount.username)
            )
        ).all()
