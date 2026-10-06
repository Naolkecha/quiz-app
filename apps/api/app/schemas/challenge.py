from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.challenge import ChallengeStatus


class TodayChallenge(BaseModel):
    """The challenge the home card should show.

    current_prize_etb follows the published formula. is_confirmed means the prize
    is guaranteed, which happens at minimum_participants. Players may still join
    and play before that, and finished attempts belong on the leaderboard.
    participant_count is the number of players who accepted the terms and joined.
    """

    id: UUID
    title: str
    description: str
    status: ChallengeStatus
    entry_fee_etb: Decimal = Field(description='Decimal string such as "20.00".')
    minimum_participants: int
    participant_count: int
    current_prize_etb: Decimal = Field(description='Decimal string such as "1000.00".')
    is_confirmed: bool
    starts_at: datetime | None
    question_count: int
    duration_seconds: int
    extra_prize_per_participant_etb: Decimal = Field(
        description='Added to the prize for each player above the minimum, such as "10.00".'
    )
    is_free: bool = False
    max_participants: int | None = None
    spots_left: int | None = None
    winner_name: str | None = None
    category: str | None = None
