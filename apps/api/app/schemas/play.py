from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class PlayChoice(BaseModel):
    id: UUID
    label: str


class PlayQuestion(BaseModel):
    """A question the player may answer. The correct choice is not included."""

    id: UUID
    position: int
    prompt: str
    choices: list[PlayChoice]


class AnswerIn(BaseModel):
    question_id: UUID
    choice_id: UUID


class FinishRequest(BaseModel):
    answers: list[AnswerIn] = Field(default_factory=list, max_length=50)


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: UUID
    display_name: str
    score: int
    elapsed_ms: int


class AttemptView(BaseModel):
    """A player's sitting, plus the leaderboard once the sitting is finished."""

    attempt_id: UUID
    status: Literal["in_progress", "finished"]
    started_at: datetime
    server_now: datetime
    duration_seconds: int
    question_count: int
    questions: list[PlayQuestion] | None
    score: int | None
    elapsed_ms: int | None
    rank: int | None
    leaderboard: list[LeaderboardEntry]
