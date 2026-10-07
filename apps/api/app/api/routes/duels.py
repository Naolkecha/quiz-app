"""1v1 Fast Duel API endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.duel import (
    CreateDuelRequest,
    DuelView,
    SubmitDuelPlayRequest,
)
from app.services.duels import DuelService

router = APIRouter(prefix="/duels", tags=["duels"])


@router.post(
    "",
    response_model=DuelView,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new 1v1 Fast Duel",
)
async def create_duel(
    body: CreateDuelRequest,
    current_user: CurrentUser,
    session: DbSession,
) -> DuelView:
    service = DuelService(session)
    duel = await service.create_duel(current_user, body)
    return service.serialize_duel(duel, current_user)


@router.get(
    "",
    response_model=list[DuelView],
    summary="List open 1v1 duels in the public lobby",
)
async def list_open_duels(
    session: DbSession,
    limit: int = 30,
) -> list[DuelView]:
    service = DuelService(session)
    duels = await service.list_open_duels(limit=limit)
    return [service.serialize_duel(d) for d in duels]


@router.get(
    "/my",
    response_model=list[DuelView],
    summary="List my active and completed duels",
)
async def list_my_duels(
    current_user: CurrentUser,
    session: DbSession,
    limit: int = 50,
) -> list[DuelView]:
    service = DuelService(session)
    duels = await service.my_duels(current_user, limit=limit)
    return [service.serialize_duel(d, current_user) for d in duels]


@router.get(
    "/{duel_id}",
    response_model=DuelView,
    summary="Get 1v1 duel details",
)
async def get_duel(
    duel_id: UUID,
    session: DbSession,
    current_user: CurrentUser,
) -> DuelView:
    service = DuelService(session)
    duel = await service.get_duel(duel_id)
    return service.serialize_duel(duel, current_user)


@router.post(
    "/{duel_id}/play-creator",
    response_model=DuelView,
    summary="Submit answers for creator turn",
)
async def submit_creator_turn(
    duel_id: UUID,
    body: SubmitDuelPlayRequest,
    current_user: CurrentUser,
    session: DbSession,
) -> DuelView:
    service = DuelService(session)
    duel = await service.submit_creator_answers(duel_id, current_user, body.answers, body.time_seconds)
    return service.serialize_duel(duel, current_user)


@router.post(
    "/{duel_id}/play-opponent",
    response_model=DuelView,
    summary="Accept duel and submit answers as opponent",
)
async def submit_opponent_turn(
    duel_id: UUID,
    body: SubmitDuelPlayRequest,
    current_user: CurrentUser,
    session: DbSession,
) -> DuelView:
    service = DuelService(session)
    duel = await service.join_and_play(duel_id, current_user, body.answers, body.time_seconds)
    return service.serialize_duel(duel, current_user)
