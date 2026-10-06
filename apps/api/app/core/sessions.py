"""Signed browser session.

This is one expiring session string, not a refresh-token flow. The Mini App
sends it as a bearer credential. Replace this module when a fuller token
system is needed; callers should depend on issue_session and read_session.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt

from app.core.exceptions import InvalidSessionError

_ALGORITHM = "HS256"
_TOKEN_TYPE = "session"


@dataclass(frozen=True, slots=True)
class SessionClaims:
    user_id: UUID


def issue_session(
    *,
    user_id: UUID,
    secret: str,
    ttl_seconds: int,
    now: datetime | None = None,
) -> str:
    issued_at = now or datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iat": int(issued_at.timestamp()),
        "exp": int((issued_at + timedelta(seconds=ttl_seconds)).timestamp()),
        "typ": _TOKEN_TYPE,
    }
    encoded = jwt.encode(payload, secret, algorithm=_ALGORITHM)
    if isinstance(encoded, bytes):
        return encoded.decode("ascii")
    return encoded


def read_session(token: str, *, secret: str) -> SessionClaims:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[_ALGORITHM],
            options={"require": ["exp", "sub", "iat"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidSessionError from exc
    if payload.get("typ") != _TOKEN_TYPE:
        raise InvalidSessionError
    try:
        user_id = UUID(str(payload["sub"]))
    except (TypeError, ValueError) as exc:
        raise InvalidSessionError from exc
    return SessionClaims(user_id=user_id)
