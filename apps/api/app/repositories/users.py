"""User persistence. Upsert relies on the telegram_id unique constraint."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dev_user import DEV_FIRST_NAME, DEV_LAST_NAME, DEV_TELEGRAM_ID, DEV_USERNAME
from app.integrations.telegram.init_data import TelegramIdentity
from app.models.user import User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, user_id: uuid.UUID) -> User | None:
        return await self.session.get(User, user_id)

    async def upsert_telegram(self, identity: TelegramIdentity) -> tuple[User, bool]:
        return await self._upsert(
            telegram_id=identity.telegram_id,
            username=identity.username,
            first_name=identity.first_name,
            last_name=identity.last_name,
            photo_url=identity.photo_url,
        )

    async def upsert_development_user(self) -> User:
        user, _ = await self._upsert(
            telegram_id=DEV_TELEGRAM_ID,
            username=DEV_USERNAME,
            first_name=DEV_FIRST_NAME,
            last_name=DEV_LAST_NAME,
            photo_url=None,
        )
        return user

    async def _upsert(
        self,
        *,
        telegram_id: int,
        username: str | None,
        first_name: str,
        last_name: str | None,
        photo_url: str | None,
    ) -> tuple[User, bool]:
        existing = await self.session.scalar(
            select(User).where(User.telegram_id == telegram_id)
        )
        is_new = existing is None

        insert_stmt = pg_insert(User).values(
            id=uuid.uuid4(),
            telegram_id=telegram_id,
            username=username,
            first_name=first_name,
            last_name=last_name,
            photo_url=photo_url,
            is_blocked=False,
        )
        stmt = insert_stmt.on_conflict_do_update(
            index_elements=[User.telegram_id],
            set_={
                "username": insert_stmt.excluded.username,
                "first_name": insert_stmt.excluded.first_name,
                "last_name": insert_stmt.excluded.last_name,
                "photo_url": insert_stmt.excluded.photo_url,
                "updated_at": func.now(),
            },
        ).returning(User)
        result = await self.session.scalars(stmt.execution_options(populate_existing=True))
        return result.one(), is_new
