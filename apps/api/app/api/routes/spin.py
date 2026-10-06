"""Endpoints for daily lucky wheel spins."""

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.daily_spin import (
    SpinResultResponse,
    SpinStatusResponse,
    UserSpinHistoryItem,
)
from app.services.daily_spin import DailySpinService

router = APIRouter(prefix="/spin", tags=["daily_spin"])


@router.get(
    "/status",
    response_model=SpinStatusResponse,
    summary="Get user's daily spin availability and active wheel segments",
)
async def spin_status(user: CurrentUser, session: DbSession) -> SpinStatusResponse:
    return await DailySpinService(session).get_status(user)


@router.post(
    "",
    response_model=SpinResultResponse,
    summary="Spin the daily lucky wheel to win cash prizes",
)
async def spin(user: CurrentUser, session: DbSession) -> SpinResultResponse:
    return await DailySpinService(session).spin(user)


@router.get(
    "/history",
    response_model=list[UserSpinHistoryItem],
    summary="Get user's past spin results",
)
async def spin_history(user: CurrentUser, session: DbSession) -> list[UserSpinHistoryItem]:
    return await DailySpinService(session).history(user)
