from uuid import UUID

from fastapi import APIRouter

from app.api.deps import DbSession
from app.core.exceptions import NotFoundError
from app.models.challenge import Challenge
from app.models.user import User
from app.repositories.challenges import ChallengeRepository
from app.repositories.entries import EntryRepository
from app.schemas.challenge import TodayChallenge
from app.schemas.errors import ErrorResponse
from app.services.challenges import present_today
from app.services.free_rounds import FreeRoundService

router = APIRouter(prefix="/challenges", tags=["challenges"])


async def _present(session: DbSession, challenge: Challenge) -> TodayChallenge:
    count = await EntryRepository(session).count(challenge.id)
    winner = (
        await session.get(User, challenge.winner_user_id)
        if challenge.winner_user_id is not None
        else None
    )
    return present_today(challenge, participant_count=count, winner=winner)


@router.get(
    "",
    response_model=list[TodayChallenge],
    summary="List challenges players can join",
    description=(
        "Live, ready, and registration challenges, including one open free round per "
        "prize tier. Draft, cancelled, and completed challenges are omitted. "
        "Can be optionally filtered by category."
    ),
)
async def list_challenges(
    session: DbSession,
    category: str | None = None,
) -> list[TodayChallenge]:
    await FreeRoundService(session).ensure_open_rounds()
    challenges = await ChallengeRepository(session).list_open(category=category)
    return [await _present(session, challenge) for challenge in challenges]


@router.get(
    "/today",
    response_model=TodayChallenge,
    summary="Return the challenge shown on the home card",
    description=(
        "Authentication is not required. Prefers a live challenge, then a ready one, "
        "then one in registration. Draft and cancelled challenges are omitted. "
        "The prize uses the challenge economics. The prize is confirmed once "
        "participant_count reaches minimum_participants. Players can play before that."
    ),
    responses={
        404: {
            "model": ErrorResponse,
            "description": "No public challenge is scheduled.",
        }
    },
)
async def today(session: DbSession) -> TodayChallenge:
    challenge = await ChallengeRepository(session).get_today()
    if challenge is None:
        raise NotFoundError("No challenge is scheduled.")
    return await _present(session, challenge)


@router.get(
    "/recent-results",
    response_model=list[TodayChallenge],
    summary="List recently completed challenges with winners and final rankings",
)
async def list_recent_results(session: DbSession) -> list[TodayChallenge]:
    challenges = await ChallengeRepository(session).list_recent_completed(limit=10)
    return [await _present(session, challenge) for challenge in challenges]


@router.get(
    "/{challenge_id}",
    response_model=TodayChallenge,
    summary="Return one public challenge",
    responses={404: {"model": ErrorResponse, "description": "No public challenge was found."}},
)
async def get_challenge(challenge_id: UUID, session: DbSession) -> TodayChallenge:
    challenge = await ChallengeRepository(session).get_public(challenge_id)
    if challenge is None:
        raise NotFoundError("No challenge is scheduled.")
    await FreeRoundService(session).settle_if_ready(challenge)
    return await _present(session, challenge)
