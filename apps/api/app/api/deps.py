import hmac
from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError, InvalidSessionError, UserBlockedError
from app.core.sessions import read_session
from app.db.session import get_db
from app.models.admin import AdminRole
from app.models.user import User
from app.repositories.users import UserRepository
from app.services.admins import AdminService

bearer_scheme = HTTPBearer(
    auto_error=False,
    description="Session token returned by POST /api/auth/telegram or POST /api/auth/dev.",
)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise InvalidSessionError()
    claims = read_session(credentials.credentials, secret=settings.secret_key)
    user = await UserRepository(session).get(claims.user_id)
    if user is None:
        raise InvalidSessionError()
    if user.is_blocked:
        raise UserBlockedError()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[AsyncSession, Depends(get_db)]


def _admin_only() -> AppError:
    return AppError(
        code="admin_only",
        message="Only Challenge admins can do this.",
        status_code=403,
    )


async def require_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_admin_key: Annotated[str | None, Header()] = None,
) -> AdminRole:
    """Allow an admin's Telegram session, or the server ADMIN_API_KEY for scripts."""
    expected = settings.admin_api_key.strip()
    if expected and x_admin_key and hmac.compare_digest(x_admin_key.strip(), expected):
        return AdminRole.OWNER
    if credentials is None:
        raise AppError(
            code="admin_unauthorized",
            message="Sign in with an admin Telegram account.",
            status_code=401,
        )
    user = await get_current_user(credentials, session, settings)
    role = await AdminService(session).role_for(user)
    if role is None:
        raise _admin_only()
    return role


async def require_owner(role: Annotated[AdminRole, Depends(require_admin)]) -> AdminRole:
    if role != AdminRole.OWNER:
        raise AppError(
            code="owner_only",
            message="Only the main admin can change the admin list.",
            status_code=403,
        )
    return role


AdminAccess = Annotated[AdminRole, Depends(require_admin)]
