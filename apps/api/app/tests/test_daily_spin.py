"""Tests for daily spin wheel functionality and admin controls."""

from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.sessions import issue_session
from app.models.user import User
from app.models.wallet import LedgerType, Wallet, WalletTransaction
from app.services.daily_spin import DailySpinService


def _auth_headers(user: User) -> dict[str, str]:
    token = issue_session(user_id=user.id, secret=get_settings().secret_key, ttl_seconds=3600)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_spin_status_and_execution(session: AsyncSession, client: AsyncClient) -> None:
    user = User(
        telegram_id=444333222,
        username="spinner1",
        first_name="Spin",
        last_name="Master",
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    headers = _auth_headers(user)

    # 1. Status check: user can spin
    status_resp = await client.get("/api/spin/status", headers=headers)
    assert status_resp.status_code == 200
    data = status_resp.json()
    assert data["can_spin"] is True
    assert data["is_enabled"] is True
    assert len(data["segments"]) > 0

    # 2. Execute spin
    spin_resp = await client.post("/api/spin", headers=headers)
    assert spin_resp.status_code == 200
    spin_data = spin_resp.json()
    assert "spin_id" in spin_data
    assert "prize_amount_etb" in spin_data
    assert "balance_after_etb" in spin_data

    # 3. Repeat spin immediately: should be blocked by cooldown (429)
    blocked_resp = await client.post("/api/spin", headers=headers)
    assert blocked_resp.status_code == 429
    assert blocked_resp.json()["detail"]["code"] == "already_spun"

    # 4. Status check now shows can_spin == False
    status_resp2 = await client.get("/api/spin/status", headers=headers)
    assert status_resp2.status_code == 200
    assert status_resp2.json()["can_spin"] is False
    assert status_resp2.json()["seconds_remaining"] > 0

    # 5. Spin history
    history_resp = await client.get("/api/spin/history", headers=headers)
    assert history_resp.status_code == 200
    history = history_resp.json()
    assert len(history) == 1
    assert history[0]["segment_label"] == spin_data["segment_label"]


@pytest.mark.asyncio
async def test_admin_spin_controls(session: AsyncSession, client: AsyncClient) -> None:
    admin_user = User(
        telegram_id=64001,
        username="jiillicha",
        first_name="Admin",
        last_name="Boss",
    )
    session.add(admin_user)
    await session.commit()
    await session.refresh(admin_user)

    headers = _auth_headers(admin_user)

    # 1. Admin overview
    overview_resp = await client.get("/api/admin/spin", headers=headers)
    assert overview_resp.status_code == 200
    data = overview_resp.json()
    assert "is_enabled" in data
    assert "cooldown_hours" in data
    assert "segments" in data

    # 2. Update config: change cooldown to 12h and update segments
    new_segments = [
        {"id": 1, "label": "Jackpot 50 ETB", "amount_etb": "50.00", "weight": 5, "color": "#10b981"},
        {"id": 2, "label": "Try Again", "amount_etb": "0.00", "weight": 95, "color": "#6b7280"},
    ]
    update_resp = await client.put(
        "/api/admin/spin",
        headers=headers,
        json={
            "is_enabled": True,
            "cooldown_hours": 12,
            "segments": new_segments,
        },
    )
    assert update_resp.status_code == 200
    updated_data = update_resp.json()
    assert updated_data["cooldown_hours"] == 12
    assert len(updated_data["segments"]) == 2

    # 3. Disable spin
    disable_resp = await client.put(
        "/api/admin/spin",
        headers=headers,
        json={
            "is_enabled": False,
            "cooldown_hours": 12,
            "segments": new_segments,
        },
    )
    assert disable_resp.status_code == 200
    assert disable_resp.json()["is_enabled"] is False

    # 4. User cannot spin when disabled
    regular_user = User(
        telegram_id=888777666,
        username="regular_user",
        first_name="Reg",
        last_name="User",
    )
    session.add(regular_user)
    await session.commit()
    await session.refresh(regular_user)

    reg_headers = _auth_headers(regular_user)
    spin_disabled_resp = await client.post("/api/spin", headers=reg_headers)
    assert spin_disabled_resp.status_code == 400
    assert spin_disabled_resp.json()["detail"]["code"] == "spin_disabled"
