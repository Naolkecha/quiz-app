"""Duel schemas for API validation and response serialization."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class DuelChoiceView(BaseModel):
    id: str
    label: str


class DuelQuestionView(BaseModel):
    id: str
    prompt: str
    choices: list[DuelChoiceView]


class DuelAnswerInput(BaseModel):
    question_id: str
    selected_choice_id: str


class CreateDuelRequest(BaseModel):
    stake_etb: Decimal = Field(default=Decimal("0.00"), ge=0, le=1000)
    category: str = Field(default="general", max_length=64)
    invited_username: str | None = Field(default=None, max_length=128)
    invited_usernames: list[str] = Field(default_factory=list)
    is_public: bool = Field(default=False)


class SubmitDuelPlayRequest(BaseModel):
    answers: list[DuelAnswerInput]
    time_seconds: Decimal = Field(ge=0, le=300)


class DuelPlayerView(BaseModel):
    id: UUID
    first_name: str
    username: str | None = None


class DuelView(BaseModel):
    id: UUID
    creator: DuelPlayerView
    opponent: DuelPlayerView | None = None
    winner: DuelPlayerView | None = None
    stake_etb: Decimal
    prize_etb: Decimal
    platform_fee_etb: Decimal
    category: str
    status: str
    invited_username: str | None = None
    invited_usernames: list[str] = Field(default_factory=list)
    is_public: bool = False
    questions: list[DuelQuestionView]
    creator_score: int | None = None
    creator_time_seconds: Decimal | None = None
    opponent_score: int | None = None
    opponent_time_seconds: Decimal | None = None
    is_tie: bool = False
    created_at: datetime
    expires_at: datetime
    settled_at: datetime | None = None
    my_role: str | None = None
    has_played: bool = False
