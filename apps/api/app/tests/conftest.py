"""Test environment. Set before the application is imported."""

import asyncio
import os
from collections.abc import AsyncIterator
from pathlib import Path

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession
from sqlalchemy.pool import NullPool

from app.tests.constants import TEST_BOT_TOKEN, TEST_DATABASE_URL, TEST_SECRET_KEY

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", TEST_DATABASE_URL)
os.environ["VERIFY_ET_API_KEY"] = ""
os.environ["VERIFY_ET_WEBHOOK_SECRET"] = ""
os.environ["TELEBIRR_SETTLEMENT_ACCOUNT"] = ""
os.environ["SECRET_KEY"] = TEST_SECRET_KEY
os.environ["TELEGRAM_BOT_TOKEN"] = TEST_BOT_TOKEN
os.environ["SESSION_TTL_SECONDS"] = "3600"
os.environ["INIT_DATA_MAX_AGE_SECONDS"] = "86400"
os.environ["INIT_DATA_CLOCK_SKEW_SECONDS"] = "30"
os.environ["CORS_ORIGINS"] = "http://localhost:3000"

TEST_DB_URL = os.environ["DATABASE_URL"]


def _safe_db_name(name: str) -> str:
    if not name.replace("_", "").isalnum():
        raise RuntimeError(f"Refusing to create a database named {name!r}")
    return name


async def _ensure_database() -> None:
    from sqlalchemy.engine.url import make_url

    url = make_url(TEST_DB_URL)
    database = _safe_db_name(url.database or "")
    connection = await asyncpg.connect(
        host=url.host or "localhost",
        port=url.port or 5432,
        user=url.username,
        password=url.password,
        database="postgres",
    )
    try:
        exists = await connection.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            database,
        )
        if not exists:
            await connection.execute(f'CREATE DATABASE "{database}"')
    finally:
        await connection.close()


@pytest.fixture(scope="session")
def migrated() -> None:
    try:
        asyncio.run(_ensure_database())
    except (OSError, asyncpg.PostgresConnectionError) as exc:
        pytest.skip(f"PostgreSQL is not available: {exc}. Start it with: docker compose up -d")

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    command.upgrade(cfg, "head")


@pytest.fixture
async def session(migrated: None) -> AsyncIterator[AsyncSession]:
    from app.db.session import engine

    async with engine.connect() as connection:
        transaction = await connection.begin()
        db = AsyncSession(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        try:
            yield db
        finally:
            await db.close()
            await transaction.rollback()


@pytest.fixture
async def client(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    from app.db.session import get_db
    from app.main import app

    async def override_db() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_db] = override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http
    app.dependency_overrides.clear()


@pytest.fixture
async def database_connection(migrated: None) -> AsyncIterator[AsyncConnection]:
    from sqlalchemy.ext.asyncio import create_async_engine

    probe = create_async_engine(TEST_DB_URL, poolclass=NullPool)
    try:
        async with probe.connect() as connection:
            yield connection
    finally:
        await probe.dispose()
