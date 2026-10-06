import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, NotFoundError
from app.models.admin import AdminAccount, AdminRole
from app.models.user import User
from app.repositories.admins import AdminRepository
from app.schemas.user import UserPublic

_USERNAME = re.compile(r"^[a-z0-9_]{5,32}$")


class AdminService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.admins = AdminRepository(session)

    async def role_for(self, user: User) -> AdminRole | None:
        if not user.username:
            return None
        row = await self.admins.by_username(user.username.lower())
        return row.role if row is not None else None

    async def is_admin(self, user: User) -> bool:
        return await self.role_for(user) is not None

    async def public_user(self, user: User) -> UserPublic:
        role = await self.role_for(user)
        return UserPublic.model_validate(user).model_copy(
            update={"is_admin": role is not None, "is_owner": role == AdminRole.OWNER}
        )

    async def list_members(self) -> list[AdminAccount]:
        return list(await self.admins.list_all())

    async def add_member(self, username: str) -> AdminAccount:
        handle = _normalize_username(username)
        if await self.admins.by_username(handle) is not None:
            raise AppError(
                code="admin_exists",
                message="That username is already an admin.",
                status_code=409,
            )
        row = AdminAccount(username=handle, role=AdminRole.ADMIN)
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def remove_member(self, username: str) -> None:
        handle = _normalize_username(username)
        row = await self.admins.by_username(handle)
        if row is None:
            raise NotFoundError("That admin was not found.")
        if row.role == AdminRole.OWNER:
            raise AppError(
                code="cannot_remove_owner",
                message="The main admin cannot be removed.",
                status_code=409,
            )
        await self.session.delete(row)
        await self.session.commit()


def _normalize_username(value: str) -> str:
    handle = value.strip().lstrip("@").lower()
    if not _USERNAME.fullmatch(handle):
        raise AppError(
            code="invalid_username",
            message="Enter a Telegram username, like jiillicha.",
            status_code=422,
        )
    return handle
