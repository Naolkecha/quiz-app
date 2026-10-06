"""Validate Telegram Mini App initData with the bot token.

Telegram documents two checks:

- Bot backend: HMAC-SHA256. The data-check-string includes every field except
  ``hash``. The ``signature`` field stays in that string; it is covered by the
  hash like any other field.
- Third parties: Ed25519 over a different string that excludes both ``hash``
  and ``signature``. This service does not accept that path. Possession of the
  bot token is required.

``initDataUnsafe`` is never consulted. Only the raw query string is accepted.
"""

import hashlib
import hmac
import json
import re
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qsl

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.exceptions import InitDataError

_USERNAME = re.compile(r"^[A-Za-z0-9_]{5,32}$")
_HASH = re.compile(r"^[0-9a-f]{64}$")


class TelegramIdentity(BaseModel):
    model_config = ConfigDict(extra="ignore")

    telegram_id: int = Field(gt=0, le=2**63 - 1)
    username: str | None
    first_name: str
    last_name: str | None
    photo_url: str | None
    auth_date: int
    start_param: str | None
    query_id: str | None


class _TelegramUser(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int = Field(gt=0, le=2**63 - 1)
    first_name: str = Field(min_length=1, max_length=128)
    last_name: str | None = Field(default=None, max_length=128)
    username: str | None = None
    photo_url: str | None = None
    is_bot: bool | None = None


def validate_init_data(
    init_data: str,
    *,
    bot_token: str,
    max_age_seconds: int,
    clock_skew_seconds: int,
    now: datetime | None = None,
) -> TelegramIdentity:
    if not init_data or not init_data.strip():
        raise InitDataError("init_data_missing", "Telegram authentication failed.")

    pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=False)
    hashes = [value for key, value in pairs if key == "hash"]
    fields = [(key, value) for key, value in pairs if key != "hash"]
    if len(hashes) != 1:
        raise InitDataError("init_data_invalid", "Telegram authentication failed.")
    received_hash = hashes[0].lower()
    if not _HASH.fullmatch(received_hash):
        raise InitDataError("init_data_invalid", "Telegram authentication failed.")

    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(fields))
    # HMAC(key="WebAppData", message=bot_token), then HMAC that digest over the pairs.
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calculated, received_hash):
        raise InitDataError("init_data_invalid", "Telegram authentication failed.")

    values = dict(fields)
    if list(values) != [key for key, _ in fields]:
        # Duplicate keys would let a later value hide an earlier one after the signature check.
        raise InitDataError("init_data_invalid", "Telegram authentication failed.")

    identity = _identity_from_values(values)
    _enforce_auth_date(
        identity.auth_date,
        max_age_seconds=max_age_seconds,
        clock_skew_seconds=clock_skew_seconds,
        now=now or datetime.now(UTC),
    )
    return identity


def _identity_from_values(values: dict[str, str]) -> TelegramIdentity:
    raw_user = values.get("user")
    if not raw_user:
        raise InitDataError("init_data_invalid", "Telegram authentication failed.")
    try:
        user = _TelegramUser.model_validate(json.loads(raw_user))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise InitDataError("init_data_invalid", "Telegram authentication failed.") from exc
    if user.is_bot:
        raise InitDataError("init_data_invalid", "Telegram authentication failed.")

    auth_date_raw = values.get("auth_date")
    if auth_date_raw is None or not auth_date_raw.isdigit():
        raise InitDataError("init_data_invalid", "Telegram authentication failed.")

    start_param = values.get("start_param")
    if start_param is not None and len(start_param) > 512:
        start_param = None

    first_name = user.first_name.strip()[:64]
    if not first_name:
        raise InitDataError("init_data_invalid", "Telegram authentication failed.")

    return TelegramIdentity(
        telegram_id=user.id,
        username=_clean_username(user.username),
        first_name=first_name,
        last_name=_clean_name(user.last_name),
        photo_url=_clean_photo(user.photo_url),
        auth_date=int(auth_date_raw),
        start_param=start_param,
        query_id=values.get("query_id"),
    )


def _enforce_auth_date(
    auth_date: int,
    *,
    max_age_seconds: int,
    clock_skew_seconds: int,
    now: datetime,
) -> None:
    try:
        issued = datetime.fromtimestamp(auth_date, tz=UTC)
    except (OverflowError, OSError, ValueError) as exc:
        raise InitDataError("init_data_invalid", "Telegram authentication failed.") from exc

    if issued > now + timedelta(seconds=clock_skew_seconds):
        raise InitDataError("init_data_invalid", "Telegram authentication failed.")
    if now - issued > timedelta(seconds=max_age_seconds):
        raise InitDataError(
            "init_data_expired",
            "Telegram session expired. Close the app and open it again from the bot.",
        )


def _clean_username(username: str | None) -> str | None:
    if username and _USERNAME.fullmatch(username):
        return username
    return None


def _clean_name(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()[:64]
    return cleaned or None


def _clean_photo(url: str | None) -> str | None:
    if url and url.startswith(("https://", "http://")) and len(url) <= 1024:
        return url
    return None
