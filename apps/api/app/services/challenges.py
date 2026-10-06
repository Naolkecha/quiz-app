"""Read models for the home card."""

from decimal import Decimal

from app.models.challenge import Challenge
from app.models.user import User
from app.schemas.challenge import TodayChallenge


def calculate_prize(
    participant_count: int,
    *,
    minimum_participants: int,
    base_prize_etb: Decimal,
    extra_prize_per_participant_etb: Decimal,
) -> Decimal:
    """Base prize through the minimum, then extra_prize for each player above it."""
    if participant_count < 0:
        raise ValueError("participant_count must be >= 0")
    if participant_count <= minimum_participants:
        return base_prize_etb
    extra_players = participant_count - minimum_participants
    return base_prize_etb + (Decimal(extra_players) * extra_prize_per_participant_etb)


def present_today(
    challenge: Challenge,
    *,
    participant_count: int,
    winner: User | None = None,
) -> TodayChallenge:
    prize = calculate_prize(
        participant_count,
        minimum_participants=challenge.minimum_participants,
        base_prize_etb=challenge.base_prize_etb,
        extra_prize_per_participant_etb=challenge.extra_prize_per_participant_etb,
    )
    confirmed = challenge.minimum_participants <= participant_count
    seats = challenge.max_participants
    return TodayChallenge(
        id=challenge.id,
        title=challenge.title,
        description=challenge.description,
        status=challenge.status,
        entry_fee_etb=challenge.entry_fee_etb,
        minimum_participants=challenge.minimum_participants,
        participant_count=participant_count,
        current_prize_etb=prize,
        is_confirmed=confirmed,
        starts_at=challenge.starts_at,
        question_count=challenge.question_count,
        duration_seconds=challenge.duration_seconds,
        extra_prize_per_participant_etb=challenge.extra_prize_per_participant_etb,
        is_free=seats is not None and challenge.entry_fee_etb == 0,
        max_participants=seats,
        spots_left=max(seats - participant_count, 0) if seats is not None else None,
        winner_name=winner.first_name if winner is not None else None,
        category=challenge.category,
    )
