from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.user import UserPublic


class TelegramAuthRequest(BaseModel):
    """Raw Mini App initData. The server validates the signature before trusting any field."""

    init_data: str = Field(
        min_length=1,
        max_length=8192,
        description="The exact Telegram.WebApp.initData query string. Do not send initDataUnsafe.",
        examples=["query_id=AAE&user=%7B%22id%22%3A1%7D&auth_date=1700000000&hash=..."],
    )


class AuthResponse(BaseModel):
    """A backend session for the local user. There is no refresh token in this version."""

    session_token: str = Field(description="Send as Authorization: Bearer on later requests.")
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Session lifetime in seconds.")
    user: UserPublic
