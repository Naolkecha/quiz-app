from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserPublic(BaseModel):
    """Account fields the Mini App is allowed to show for the signed-in user."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    telegram_id: int
    username: str | None
    first_name: str
    last_name: str | None
    photo_url: str | None
    created_at: datetime = Field(description="UTC timestamp when the account was created.")
    is_admin: bool = False
    is_owner: bool = False
