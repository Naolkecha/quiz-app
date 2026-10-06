import time

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dev_user import DEV_TELEGRAM_ID
from app.main import app
from app.models.user import User
from app.services.auth import AuthService
from app.tests.constants import TEST_BOT_TOKEN
from app.tests.init_data_factory import signed_init_data, telegram_user


def _init_data(*, telegram_id: int, first_name: str, username: str) -> str:
    return signed_init_data(
        TEST_BOT_TOKEN,
        {
            "auth_date": str(int(time.time())),
            "query_id": "AAEuser",
            "user": telegram_user(
                telegram_id=telegram_id,
                first_name=first_name,
                last_name="Bekele",
                username=username,
            ),
        },
    )


def test_development_login_is_not_mounted_outside_development() -> None:
    paths = {getattr(route, "path", "") for route in app.routes}
    assert "/api/auth/dev" not in paths
    assert get_settings().dev_auth_enabled is False


async def test_health_reports_database(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


async def test_telegram_login_creates_user(client: AsyncClient, session: AsyncSession) -> None:
    response = await client.post(
        "/api/auth/telegram",
        json={"init_data": _init_data(telegram_id=51001, first_name="Sara", username="sara_q")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["telegram_id"] == 51001
    assert body["user"]["first_name"] == "Sara"
    assert body["user"]["username"] == "sara_q"

    me = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {body['session_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["id"] == body["user"]["id"]

    count = await session.scalar(
        select(func.count()).select_from(User).where(User.telegram_id == 51001)
    )
    assert count == 1


async def test_duplicate_telegram_user_keeps_the_same_id(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    first = await client.post(
        "/api/auth/telegram",
        json={"init_data": _init_data(telegram_id=51002, first_name="Liya", username="liya_one")},
    )
    second = await client.post(
        "/api/auth/telegram",
        json={"init_data": _init_data(telegram_id=51002, first_name="Liya", username="liya_two")},
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["user"]["id"] == second.json()["user"]["id"]
    assert second.json()["user"]["username"] == "liya_two"

    count = await session.scalar(
        select(func.count()).select_from(User).where(User.telegram_id == 51002)
    )
    assert count == 1


async def test_invalid_signature_does_not_create_a_user(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    init_data = _init_data(telegram_id=51003, first_name="Noor", username="noor_q")
    response = await client.post(
        "/api/auth/telegram",
        json={"init_data": init_data.replace("Noor", "Nora")},
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "init_data_invalid"
    count = await session.scalar(
        select(func.count()).select_from(User).where(User.telegram_id == 51003)
    )
    assert count == 0


async def test_missing_session_is_rejected(client: AsyncClient) -> None:
    response = await client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "session_invalid"


async def test_development_login_creates_one_user(
    session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    get_settings.cache_clear()
    try:
        service = AuthService(session)
        first = await service.login_development()
        second = await service.login_development()
    finally:
        monkeypatch.setenv("APP_ENV", "test")
        get_settings.cache_clear()

    assert first.user.id == second.user.id
    assert first.user.telegram_id == DEV_TELEGRAM_ID
    count = await session.scalar(
        select(func.count()).select_from(User).where(User.telegram_id == DEV_TELEGRAM_ID)
    )
    assert count == 1
