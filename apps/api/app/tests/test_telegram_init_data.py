import json
from datetime import UTC, datetime, timedelta

import pytest

from app.core.exceptions import InitDataError
from app.integrations.telegram.init_data import validate_init_data
from app.tests.constants import TEST_BOT_TOKEN
from app.tests.init_data_factory import signed_init_data, telegram_user

NOW = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)


def _fields(**overrides: str) -> dict[str, str]:
    fields = {
        "auth_date": str(int(NOW.timestamp())),
        "query_id": "AAEtest",
        "user": telegram_user(),
    }
    fields.update(overrides)
    return fields


def _validate(init_data: str, *, now: datetime = NOW) -> None:
    validate_init_data(
        init_data,
        bot_token=TEST_BOT_TOKEN,
        max_age_seconds=3600,
        clock_skew_seconds=30,
        now=now,
    )


def test_valid_init_data_returns_the_telegram_user() -> None:
    identity = validate_init_data(
        signed_init_data(TEST_BOT_TOKEN, _fields()),
        bot_token=TEST_BOT_TOKEN,
        max_age_seconds=3600,
        clock_skew_seconds=30,
        now=NOW,
    )
    assert identity.telegram_id == 424242
    assert identity.username == "ada_lovelace"
    assert identity.first_name == "Ada"
    assert identity.last_name == "Lovelace"


def test_signature_field_stays_inside_the_hmac() -> None:
    fields = _fields(signature="ed25519-placeholder")
    identity = validate_init_data(
        signed_init_data(TEST_BOT_TOKEN, fields),
        bot_token=TEST_BOT_TOKEN,
        max_age_seconds=3600,
        clock_skew_seconds=30,
        now=NOW,
    )
    assert identity.telegram_id == 424242


def test_hash_computed_without_signature_is_rejected() -> None:
    signed = signed_init_data(TEST_BOT_TOKEN, _fields())
    tampered = signed + "&signature=ed25519-placeholder"
    with pytest.raises(InitDataError) as caught:
        _validate(tampered)
    assert caught.value.code == "init_data_invalid"


def test_wrong_bot_token_is_rejected() -> None:
    init_data = signed_init_data("999:OTHER", _fields())
    with pytest.raises(InitDataError) as caught:
        _validate(init_data)
    assert caught.value.code == "init_data_invalid"


def test_tampered_user_is_rejected() -> None:
    init_data = signed_init_data(TEST_BOT_TOKEN, _fields())
    tampered = init_data.replace("Ada", "Eve")
    with pytest.raises(InitDataError):
        _validate(tampered)


def test_missing_hash_is_rejected() -> None:
    with pytest.raises(InitDataError) as caught:
        _validate("auth_date=1&user=%7B%7D")
    assert caught.value.code == "init_data_invalid"


def test_expired_init_data_is_rejected() -> None:
    issued = NOW - timedelta(hours=3)
    init_data = signed_init_data(
        TEST_BOT_TOKEN,
        _fields(auth_date=str(int(issued.timestamp()))),
    )
    with pytest.raises(InitDataError) as caught:
        _validate(init_data)
    assert caught.value.code == "init_data_expired"


def test_future_auth_date_beyond_skew_is_rejected() -> None:
    issued = NOW + timedelta(minutes=5)
    init_data = signed_init_data(
        TEST_BOT_TOKEN,
        _fields(auth_date=str(int(issued.timestamp()))),
    )
    with pytest.raises(InitDataError) as caught:
        _validate(init_data)
    assert caught.value.code == "init_data_invalid"


def test_auth_date_within_clock_skew_is_accepted() -> None:
    issued = NOW + timedelta(seconds=10)
    identity = validate_init_data(
        signed_init_data(TEST_BOT_TOKEN, _fields(auth_date=str(int(issued.timestamp())))),
        bot_token=TEST_BOT_TOKEN,
        max_age_seconds=3600,
        clock_skew_seconds=30,
        now=NOW,
    )
    assert identity.telegram_id == 424242


def test_invalid_user_json_is_rejected() -> None:
    init_data = signed_init_data(TEST_BOT_TOKEN, _fields(user="not-json"))
    with pytest.raises(InitDataError):
        _validate(init_data)


def test_bot_user_is_rejected() -> None:
    user = json.dumps({"id": 7, "first_name": "Bot", "is_bot": True}, separators=(",", ":"))
    init_data = signed_init_data(TEST_BOT_TOKEN, _fields(user=user))
    with pytest.raises(InitDataError):
        _validate(init_data)
