from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class JoinChallengeRequest(BaseModel):
    accepted_terms: Literal[True]


class ChallengeEntryView(BaseModel):
    challenge_id: UUID
    joined: Literal[True] = True
    terms_version: str
    joined_at: datetime
