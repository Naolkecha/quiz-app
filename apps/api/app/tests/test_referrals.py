"""Tests for the referral system."""

from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.sessions import issue_session
from app.models.user import User
from app.models.wallet import LedgerType, Wallet, WalletTransaction
from app.repositories.referrals import ReferralRepository
from app.services.referrals import ReferralService


def _auth_headers(user: User) -> dict[str, str]:
    token = issue_session(user_id=user.id, secret=get_settings().secret_key, ttl_seconds=3600)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_referral_code_lookup(session: AsyncSession) -> None:
    user = User(
        telegram_id=987654321,
        username="alembic_hero",
        first_name="Alem",
        last_name="Bic",
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    repo = ReferralRepository(session)

    # By telegram_id (direct or with ref_ prefix)
    by_tg = await repo.get_referrer_by_code("987654321")
    assert by_tg is not None and by_tg.id == user.id

    by_tg_prefix = await repo.get_referrer_by_code("ref_987654321")
    assert by_tg_prefix is not None and by_tg_prefix.id == user.id

    by_r_prefix = await repo.get_referrer_by_code("r_987654321")
    assert by_r_prefix is not None and by_r_prefix.id == user.id

    # By UUID
    by_uuid = await repo.get_referrer_by_code(str(user.id))
    assert by_uuid is not None and by_uuid.id == user.id

    # By username (case-insensitive and with/without @)
    by_user = await repo.get_referrer_by_code("alembic_hero")
    assert by_user is not None and by_user.id == user.id

    by_user_at = await repo.get_referrer_by_code("@ALEMBIC_HERO")
    assert by_user_at is not None and by_user_at.id == user.id

    # Non-existent
    assert await repo.get_referrer_by_code("nonexistent_user_999") is None


@pytest.mark.asyncio
async def test_referral_reward_flow(session: AsyncSession) -> None:
    referrer = User(telegram_id=1111111, first_name="Referrer", username="ref_master")
    referred = User(telegram_id=2222222, first_name="Referred", username="new_player")
    session.add_all([referrer, referred])
    await session.commit()
    await session.refresh(referrer)
    await session.refresh(referred)

    service = ReferralService(session)

    # Self-referral rejected
    self_ref = await service.register_referral(referrer, str(referrer.telegram_id))
    assert self_ref is None

    # Valid referral created (default 1.00 ETB)
    ref = await service.register_referral(referred, f"ref_{referrer.telegram_id}")
    assert ref is not None
    assert ref.referrer_id == referrer.id
    assert ref.referred_id == referred.id
    assert ref.is_rewarded is False
    assert ref.reward_amount_etb == Decimal("1.00")
    await session.commit()

    # Referrer wallet balance before
    ref_wallet = await session.get(Wallet, referrer.id)
    balance_before = ref_wallet.balance_etb if ref_wallet else Decimal("0")

    # Reward referrer when referred player finishes a game
    rewarded = await service.reward_referrer_if_eligible(referred.id)
    assert rewarded is not None
    assert rewarded.is_rewarded is True
    assert rewarded.rewarded_at is not None
    await session.commit()

    # Verify wallet credited with 1.00 ETB
    await session.refresh(referrer)
    from sqlalchemy import select
    tx = await session.scalar(
        select(WalletTransaction).where(
            WalletTransaction.idempotency_key == f"referral:{ref.id}"
        )
    )
    assert tx is not None
    assert tx.entry_type == LedgerType.REFERRAL
    assert tx.amount_etb == Decimal("1.00")
    assert tx.balance_after_etb == balance_before + Decimal("1.00")

    # Calling again does not double-reward
    second_reward = await service.reward_referrer_if_eligible(referred.id)
    assert second_reward is None


@pytest.mark.asyncio
async def test_admin_decides_reward_and_new_unique_rules(session: AsyncSession) -> None:
    service = ReferralService(session)

    # 1. Admin updates reward to 2.50 ETB
    config = await service.referrals.update_reward_amount(Decimal("2.50"))
    assert config.reward_amount_etb == Decimal("2.50")
    assert await service.get_reward_amount() == Decimal("2.50")

    # 2. New referral gets the admin-decided reward
    u1 = User(telegram_id=5555555, first_name="Boss", username="boss_ref")
    u2 = User(telegram_id=6666666, first_name="Newbie", username="newbie_ref")
    session.add_all([u1, u2])
    await session.commit()
    await session.refresh(u1)
    await session.refresh(u2)

    ref = await service.register_referral(u2, f"ref_{u1.telegram_id}")
    assert ref is not None
    assert ref.reward_amount_etb == Decimal("2.50")

    # 3. Circular referral rejected (u1 cannot refer u2 back)
    circular_ref = await service.register_referral(u1, f"ref_{u2.telegram_id}")
    assert circular_ref is None

    # Reset reward back to 1.00 ETB for clean state
    await service.referrals.update_reward_amount(Decimal("1.00"))


@pytest.mark.asyncio
async def test_referral_api(client: AsyncClient, session: AsyncSession) -> None:
    # Create two users
    u1 = User(telegram_id=3333333, first_name="Inviter", username="inviter_boss")
    u2 = User(telegram_id=4444444, first_name="Invited", username="friend_two")
    session.add_all([u1, u2])
    await session.commit()
    await session.refresh(u1)
    await session.refresh(u2)

    headers_u1 = _auth_headers(u1)
    headers_u2 = _auth_headers(u2)

    # 1. Check u1 summary (empty invites)
    res = await client.get("/api/referrals/me", headers=headers_u1)
    assert res.status_code == 200
    data = res.json()
    assert data["referral_code"] == "3333333"
    assert "start=ref_3333333" in data["telegram_bot_url"]
    assert data["total_referrals"] == 0
    assert Decimal(data["total_earned_etb"]) == Decimal("0")
    assert Decimal(data["reward_per_referral_etb"]) == Decimal("1.00")

    # 2. u2 applies u1's referral code
    res_apply = await client.post(
        "/api/referrals/apply",
        json={"code": "3333333"},
        headers=headers_u2,
    )
    assert res_apply.status_code == 200
    assert "Inviter" in res_apply.json()["referrer_name"]

    # 3. u2 cannot apply again
    res_apply_again = await client.post(
        "/api/referrals/apply",
        json={"code": "3333333"},
        headers=headers_u2,
    )
    assert res_apply_again.status_code == 409

    # 4. Check u1 summary now shows 1 referral
    res_u1_updated = await client.get("/api/referrals/me", headers=headers_u1)
    assert res_u1_updated.status_code == 200
    u1_data = res_u1_updated.json()
    assert u1_data["total_referrals"] == 1
    assert u1_data["rewarded_referrals"] == 0
    assert len(u1_data["recent_referrals"]) == 1
    assert u1_data["recent_referrals"][0]["referred_name"] == "Invited"
