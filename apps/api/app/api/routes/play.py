from typing import Any
from uuid import UUID

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import NotFoundError
from app.schemas.entry import ChallengeEntryView, JoinChallengeRequest
from app.schemas.errors import ErrorResponse
from app.schemas.play import AttemptView, FinishRequest, LeaderboardEntry
from app.services.entries import EntryService
from app.services.play import PlayService

router = APIRouter(prefix="/challenges", tags=["play"])

_ERRORS: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse, "description": "Authentication required."},
    404: {"model": ErrorResponse, "description": "No challenge or attempt was found."},
    409: {"model": ErrorResponse, "description": "The challenge cannot be played."},
}


@router.get(
    "/{challenge_id}/entry",
    response_model=ChallengeEntryView,
    summary="Return the signed-in player's challenge entry",
    responses=_ERRORS,
)
async def current_entry(
    challenge_id: UUID,
    user: CurrentUser,
    session: DbSession,
) -> ChallengeEntryView:
    entry = await EntryService(session).current(challenge_id, user)
    if entry is None:
        raise NotFoundError("You have not joined this challenge.")
    return ChallengeEntryView(
        challenge_id=entry.challenge_id,
        terms_version=entry.terms_version,
        joined_at=entry.joined_at,
    )


@router.post(
    "/{challenge_id}/join",
    response_model=ChallengeEntryView,
    summary="Accept the terms and join a challenge",
    description=(
        "Joining is idempotent and does not start the timer. "
        "The timed attempt starts separately on the question page."
    ),
    responses=_ERRORS,
)
async def join(
    challenge_id: UUID,
    body: JoinChallengeRequest,
    user: CurrentUser,
    session: DbSession,
) -> ChallengeEntryView:
    del body  # Pydantic has already enforced accepted_terms=true.
    entry = await EntryService(session).join(challenge_id, user)
    return ChallengeEntryView(
        challenge_id=entry.challenge_id,
        terms_version=entry.terms_version,
        joined_at=entry.joined_at,
    )


@router.get(
    "/{challenge_id}/attempt",
    response_model=AttemptView,
    summary="Return the signed-in player's sitting",
    responses=_ERRORS,
)
async def current_attempt(
    challenge_id: UUID,
    user: CurrentUser,
    session: DbSession,
) -> AttemptView:
    attempt = await PlayService(session).current(challenge_id, user)
    if attempt is None:
        raise NotFoundError("You have not started this challenge.")
    return attempt


@router.post(
    "/{challenge_id}/play",
    response_model=AttemptView,
    summary="Start or resume the current sitting",
    description=(
        "The player must join and accept the terms first. "
        "Questions omit the correct choice. One sitting per player."
    ),
    responses=_ERRORS,
)
async def play(challenge_id: UUID, user: CurrentUser, session: DbSession) -> AttemptView:
    return await PlayService(session).start(challenge_id, user)


@router.post(
    "/{challenge_id}/finish",
    response_model=AttemptView,
    summary="Score the sitting and place it on the leaderboard",
    description=(
        "The server scores answers. A submission after the duration plus a short "
        "grace period is stored as zero. Repeating finish returns the saved result."
    ),
    responses=_ERRORS,
)
async def finish(
    challenge_id: UUID,
    body: FinishRequest,
    user: CurrentUser,
    session: DbSession,
) -> AttemptView:
    return await PlayService(session).finish(challenge_id, user, body.answers)


@router.get(
    "/{challenge_id}/leaderboard",
    response_model=list[LeaderboardEntry],
    summary="Rank finished sittings",
    description="Highest score, then fastest time, then earliest finish.",
    responses={404: {"model": ErrorResponse, "description": "No challenge was found."}},
)
async def leaderboard(challenge_id: UUID, session: DbSession) -> list[LeaderboardEntry]:
    return await PlayService(session).leaderboard(challenge_id)
