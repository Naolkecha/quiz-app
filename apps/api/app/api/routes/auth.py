from typing import Any

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import AuthResponse, TelegramAuthRequest
from app.schemas.errors import ErrorResponse, ValidationErrorResponse
from app.schemas.user import UserPublic
from app.services.admins import AdminService
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])
dev_router = APIRouter(prefix="/auth", tags=["auth"])

_AUTH_ERRORS: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse, "description": "The Telegram signature was rejected."},
    403: {"model": ErrorResponse, "description": "The user is blocked."},
    422: {"model": ValidationErrorResponse, "description": "init_data is missing or too large."},
}


@router.post(
    "/telegram",
    response_model=AuthResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in with Telegram Mini App initData",
    description=(
        "Validates the raw initData signature with the bot token, creates or updates "
        "the local user, and returns a backend session. initDataUnsafe is ignored. "
        "No password is involved. Authentication is not required to call this endpoint."
    ),
    responses=_AUTH_ERRORS,
)
async def login_telegram(body: TelegramAuthRequest, session: DbSession) -> AuthResponse:
    result = await AuthService(session).login_telegram(body.init_data)
    return AuthResponse(
        session_token=result.session_token,
        expires_in=result.expires_in,
        user=await AdminService(session).public_user(result.user),
    )


@dev_router.post(
    "/dev",
    response_model=AuthResponse,
    summary="Sign in as the development user",
    description=(
        "Creates or reuses the seeded development user and returns a backend session. "
        "This route is registered only when APP_ENV=development. Production builds "
        "do not expose it. Authentication is not required. There is no request body."
    ),
    responses={
        403: {"model": ErrorResponse, "description": "The development user is blocked."},
    },
)
async def login_development(session: DbSession) -> AuthResponse:
    result = await AuthService(session).login_development()
    return AuthResponse(
        session_token=result.session_token,
        expires_in=result.expires_in,
        user=await AdminService(session).public_user(result.user),
    )


@router.get(
    "/me",
    response_model=UserPublic,
    summary="Return the signed-in user",
    description="Requires a bearer session from /api/auth/telegram or /api/auth/dev.",
    responses={
        401: {"model": ErrorResponse, "description": "The session is missing or expired."},
        403: {"model": ErrorResponse, "description": "The user is blocked."},
    },
)
async def me(user: CurrentUser, session: DbSession) -> UserPublic:
    return await AdminService(session).public_user(user)
