"""Build a signed initData string the same way Telegram does, for tests only."""

import hashlib
import hmac
import json
from urllib.parse import urlencode


def telegram_user(
    *,
    telegram_id: int = 424242,
    first_name: str = "Ada",
    last_name: str | None = "Lovelace",
    username: str | None = "ada_lovelace",
) -> str:
    payload: dict[str, object] = {
        "id": telegram_id,
        "first_name": first_name,
    }
    if last_name is not None:
        payload["last_name"] = last_name
    if username is not None:
        payload["username"] = username
    return json.dumps(payload, separators=(",", ":"))


def signed_init_data(bot_token: str, fields: dict[str, str]) -> str:
    """Sign fields with the bot token. `hash` must not already be present."""
    data_check = "\n".join(f"{key}={value}" for key, value in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    digest = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    payload = dict(fields)
    payload["hash"] = digest
    return urlencode(payload)
