"""Admins are Telegram usernames. @jiillicha is the main admin."""

import time
from datetime import UTC, datetime
from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.challenge import Challenge, ChallengeStatus
from app.tests.constants import TEST_BOT_TOKEN
from app.tests.init_data_factory import signed_init_data, telegram_user


async def _login(client: AsyncClient, telegram_id: int, username: str) -> dict[str, object]:
    init_data = signed_init_data(
        TEST_BOT_TOKEN,
        {
            "auth_date": str(int(time.time())),
            "query_id": f"AAEadmin{telegram_id}",
            "user": telegram_user(
                telegram_id=telegram_id,
                first_name="Admin",
                last_name="Test",
                username=username,
            ),
        },
    )
    response = await client.post("/api/auth/telegram", json={"init_data": init_data})
    assert response.status_code == 200
    return response.json()


def _auth(body: dict[str, object]) -> dict[str, str]:
    return {"Authorization": f"Bearer {body['session_token']}"}


async def test_main_admin_manages_admins_and_cannot_play(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    owner = await _login(client, 64001, "jiillicha")
    user = owner["user"]
    assert isinstance(user, dict)
    assert user["is_admin"] is True
    assert user["is_owner"] is True

    overview = await client.get("/api/admin/overview", headers=_auth(owner))
    assert overview.status_code == 200
    assert overview.json()["role"] == "owner"

    added = await client.post(
        "/api/admin/admins", headers=_auth(owner), json={"username": "@Helper_One"}
    )
    assert added.status_code == 200
    assert added.json()["username"] == "helper_one"

    helper = await _login(client, 64002, "helper_one")
    helper_user = helper["user"]
    assert isinstance(helper_user, dict)
    assert helper_user["is_admin"] is True
    assert helper_user["is_owner"] is False

    blocked = await client.post(
        "/api/admin/admins", headers=_auth(helper), json={"username": "another_one"}
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "owner_only"

    cash_outs = await client.get("/api/wallet/admin/withdrawals", headers=_auth(helper))
    assert cash_outs.status_code == 200

    challenge = Challenge(
        title="Admin blocked",
        description="Admins manage only.",
        question_count=1,
        duration_seconds=30,
        status=ChallengeStatus.LIVE,
        starts_at=datetime.now(UTC),
    )
    session.add(challenge)
    await session.commit()
    join = await client.post(
        f"/api/challenges/{challenge.id}/join",
        headers=_auth(owner),
        json={"accepted_terms": True},
    )
    assert join.status_code == 403
    assert join.json()["detail"]["code"] == "admin_cannot_play"

    cannot_remove = await client.delete("/api/admin/admins/jiillicha", headers=_auth(owner))
    assert cannot_remove.status_code == 409
    removed = await client.delete("/api/admin/admins/helper_one", headers=_auth(owner))
    assert removed.status_code == 204


async def test_admin_sees_every_players_transactions(client: AsyncClient) -> None:
    owner = await _login(client, 64011, "jiillicha")
    player = await _login(client, 64012, "payer_one")
    deposited = await client.post(
        "/api/wallet/deposits",
        headers=_auth(player),
        json={
            "amount_etb": "40.00",
            "transaction_number": "ADMINSEE01",
            "idempotency_key": str(uuid4()),
        },
    )
    assert deposited.status_code == 200

    denied = await client.get("/api/admin/transactions", headers=_auth(player))
    assert denied.status_code == 403

    listed = await client.get("/api/admin/transactions", headers=_auth(owner))
    assert listed.status_code == 200
    row = next(item for item in listed.json() if item["description"].endswith("ADMINSEE01"))
    assert row["player_name"] == "Admin Test"
    assert row["telegram_username"] == "payer_one"
    assert row["entry_type"] == "deposit"
    assert row["amount_etb"] == "40.00"

    only_prizes = await client.get(
        "/api/admin/transactions?entry_type=prize", headers=_auth(owner)
    )
    assert all(item["entry_type"] == "prize" for item in only_prizes.json())


async def test_players_cannot_open_admin(client: AsyncClient) -> None:
    player = await _login(client, 64003, "plain_player")
    user = player["user"]
    assert isinstance(user, dict)
    assert user["is_admin"] is False
    denied = await client.get("/api/admin/overview", headers=_auth(player))
    assert denied.status_code == 403


async def test_owner_can_create_challenge_with_questions_and_manage_lifecycle(
    client: AsyncClient,
) -> None:
    owner = await _login(client, 64020, "jiillicha")

    # 1. Create challenge with questions directly
    created = await client.post(
        "/api/admin/challenges",
        headers=_auth(owner),
        json={
            "title": "New Quiz with Questions",
            "description": "Created with questions included.",
            "entry_fee_etb": "20.00",
            "minimum_participants": 50,
            "base_prize_etb": "500.00",
            "extra_prize_per_participant_etb": "10.00",
            "question_count": 2,
            "duration_seconds": 30,
            "questions": [
                {
                    "prompt": "What is 2 + 2?",
                    "choices": [
                        {"label": "3", "is_correct": False},
                        {"label": "4", "is_correct": True},
                    ],
                },
                {
                    "prompt": "What color is the sky?",
                    "choices": [
                        {"label": "Blue", "is_correct": True},
                        {"label": "Green", "is_correct": False},
                    ],
                },
            ],
        },
    )
    assert created.status_code == 201
    cid = created.json()["id"]
    assert created.json()["question_count"] == 2

    # 2. Check questions list
    q_list = await client.get(f"/api/admin/challenges/{cid}/questions", headers=_auth(owner))
    assert q_list.status_code == 200
    assert len(q_list.json()) == 2
    assert q_list.json()[0]["prompt"] == "What is 2 + 2?"

    # 3. Transition to registration, then live
    reg = await client.patch(
        f"/api/admin/challenges/{cid}/status",
        headers=_auth(owner),
        json={"status": "registration"},
    )
    assert reg.status_code == 200
    assert reg.json()["status"] == "registration"

    live = await client.patch(
        f"/api/admin/challenges/{cid}/status",
        headers=_auth(owner),
        json={"status": "live"},
    )
    assert live.status_code == 200
    assert live.json()["status"] == "live"

    # 4. Create empty challenge and verify cannot go live without questions
    empty_ch = await client.post(
        "/api/admin/challenges",
        headers=_auth(owner),
        json={
            "title": "Empty Quiz",
            "description": "No questions yet.",
            "entry_fee_etb": "0",
            "minimum_participants": 10,
            "base_prize_etb": "100.00",
            "extra_prize_per_participant_etb": "0",
            "question_count": 5,
            "duration_seconds": 20,
        },
    )
    assert empty_ch.status_code == 201
    empty_id = empty_ch.json()["id"]

    # Move to registration first
    await client.patch(
        f"/api/admin/challenges/{empty_id}/status",
        headers=_auth(owner),
        json={"status": "registration"},
    )

    # Try moving from registration to live without questions
    fail_live = await client.patch(
        f"/api/admin/challenges/{empty_id}/status",
        headers=_auth(owner),
        json={"status": "live"},
    )
    assert fail_live.status_code == 400
    assert fail_live.json()["detail"]["code"] == "no_questions"

    # Cancel it
    await client.patch(
        f"/api/admin/challenges/{empty_id}/status",
        headers=_auth(owner),
        json={"status": "cancelled"},
    )

    # 5. Delete empty challenge
    deleted = await client.delete(f"/api/admin/challenges/{empty_id}", headers=_auth(owner))
    assert deleted.status_code == 204


async def test_admin_finance_summary_adjust_and_deposit_approval(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    from decimal import Decimal

    from app.models.wallet import MoneyOrder, MoneyOrderKind, MoneyOrderStatus

    owner = await _login(client, 64050, "jiillicha")
    player = await _login(client, 64051, "finance_player")
    player_id = player["user"]["id"]

    # 1. Check finance summary
    summary = await client.get("/api/admin/finance/summary", headers=_auth(owner))
    assert summary.status_code == 200
    data = summary.json()
    assert "total_user_balances_etb" in data
    assert "net_platform_profit_etb" in data
    assert "telebirr_account_name" in data

    # 2. Credit player
    credit = await client.post(
        "/api/admin/finance/adjust",
        headers=_auth(owner),
        json={
            "user_id": player_id,
            "amount_etb": "75.00",
            "direction": "credit",
            "reason": "Promotion bonus",
        },
    )
    assert credit.status_code == 200
    assert credit.json()["balance_etb"] == "75.00"
    assert credit.json()["direction"] == "credit"

    # Player checks wallet
    pw = await client.get("/api/wallet", headers=_auth(player))
    assert pw.status_code == 200
    assert pw.json()["balance_etb"] == "75.00"

    # 3. Debit player - too much fails
    fail_debit = await client.post(
        "/api/admin/finance/adjust",
        headers=_auth(owner),
        json={
            "user_id": player_id,
            "amount_etb": "100.00",
            "direction": "debit",
            "reason": "Test clawback",
        },
    )
    assert fail_debit.status_code == 409

    # Debit valid amount
    debit = await client.post(
        "/api/admin/finance/adjust",
        headers=_auth(owner),
        json={
            "user_id": player_id,
            "amount_etb": "25.00",
            "direction": "debit",
            "reason": "Correction fee",
        },
    )
    assert debit.status_code == 200
    assert debit.json()["balance_etb"] == "50.00"

    # 4. Check adjustments in transactions
    txs = await client.get("/api/admin/transactions?entry_type=adjustment", headers=_auth(owner))
    assert txs.status_code == 200
    items = txs.json()
    assert any("Promotion bonus" in it["description"] for it in items)
    assert any("Correction fee" in it["description"] for it in items)

    # 5. Pending deposit manual approval
    pending_order = MoneyOrder(
        user_id=player_id,
        kind=MoneyOrderKind.DEPOSIT,
        status=MoneyOrderStatus.PENDING,
        provider="telebirr",
        amount_etb=Decimal("120.00"),
        phone_number=None,
        transaction_number="MANUALDEP01",
        idempotency_key=uuid4(),
    )
    session.add(pending_order)
    await session.commit()

    deposits_list = await client.get(
        "/api/admin/finance/deposits?status=pending",
        headers=_auth(owner),
    )
    assert deposits_list.status_code == 200
    assert any(d["id"] == str(pending_order.id) for d in deposits_list.json())

    approve = await client.post(
        f"/api/admin/finance/deposits/{pending_order.id}/approve",
        headers=_auth(owner),
    )
    assert approve.status_code == 200
    assert approve.json()["status"] == "succeeded"
    assert approve.json()["amount_etb"] == "120.00"

    # Player balance should now be 50 + 120 = 170
    pw2 = await client.get("/api/wallet", headers=_auth(player))
    assert pw2.json()["balance_etb"] == "170.00"


async def test_admin_challenge_notify_and_creation_status(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    owner = await _login(client, 64001, "jiillicha")

    questions = [
        {
            "prompt": "What is 2+2?",
            "choices": [
                {"label": "4", "is_correct": True},
                {"label": "5", "is_correct": False},
            ],
        }
    ]
    created = await client.post(
        "/api/admin/challenges",
        headers=_auth(owner),
        json={
            "title": "Math Blitz",
            "description": "Quick math test",
            "category": "science",
            "entry_fee_etb": "10.00",
            "minimum_participants": 2,
            "base_prize_etb": "50.00",
            "extra_prize_per_participant_etb": "5.00",
            "question_count": 1,
            "duration_seconds": 30,
            "questions": questions,
            "status": "registration",
            "notify_users": True,
        },
    )
    assert created.status_code == 201
    c_data = created.json()
    assert c_data["title"] == "Math Blitz"
    assert c_data["status"] == "registration"
    c_id = c_data["id"]

    # Transition to live with notify
    moved = await client.patch(
        f"/api/admin/challenges/{c_id}/status",
        headers=_auth(owner),
        json={"status": "live", "notify_users": True},
    )
    assert moved.status_code == 200
    assert moved.json()["status"] == "live"

    # Explicit notify endpoint
    notify_resp = await client.post(
        f"/api/admin/challenges/{c_id}/notify",
        headers=_auth(owner),
    )
    assert notify_resp.status_code == 200
    res = notify_resp.json()
    assert res["challenge_id"] == c_id
    assert "sent" in res
    assert "total" in res



