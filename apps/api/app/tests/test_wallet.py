import hashlib
import hmac
import json
import time
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import WalletError
from app.integrations.verify_et import StubVerifyEtClient, VerificationOutcome
from app.models.challenge import Challenge, ChallengeStatus
from app.models.user import User
from app.models.wallet import MoneyOrderStatus
from app.services.wallets import WalletService
from app.tests.constants import TEST_BOT_TOKEN
from app.tests.init_data_factory import signed_init_data, telegram_user


async def _login(client: AsyncClient, telegram_id: int = 62001) -> tuple[str, str]:
    init_data = signed_init_data(
        TEST_BOT_TOKEN,
        {
            "auth_date": str(int(time.time())),
            "query_id": f"AAEwallet{telegram_id}",
            "user": telegram_user(
                telegram_id=telegram_id,
                first_name="Mimi",
                last_name="Tesfaye",
                username=f"mimi_wallet_{telegram_id}",
            ),
        },
    )
    response = await client.post("/api/auth/telegram", json={"init_data": init_data})
    assert response.status_code == 200
    return response.json()["session_token"], response.json()["user"]["id"]


async def test_wallet_api_lists_empty_balance_and_accepts_stub_deposit(
    client: AsyncClient,
) -> None:
    token, _ = await _login(client)
    headers = {"Authorization": f"Bearer {token}"}
    wallet = await client.get("/api/wallet", headers=headers)
    assert wallet.status_code == 200
    assert wallet.json()["balance_etb"] == "0.00"
    assert wallet.json()["deposit_mode"] == "local_stub"
    assert wallet.json()["settlement_account_name"] == "Naol Kecha"
    assert wallet.json()["settlement_account"] == "0972900847"
    assert wallet.json()["deposits_enabled"] is True
    assert wallet.json()["withdrawals_enabled"] is True

    deposit = await client.post(
        "/api/wallet/deposits",
        headers=headers,
        json={
            "amount_etb": "100.00",
            "transaction_number": "DET8FJGUJ4",
            "idempotency_key": str(uuid4()),
        },
    )
    assert deposit.status_code == 200
    assert deposit.json()["status"] == "succeeded"
    assert deposit.json()["transaction_number"] == "DET8FJGUJ4"

    wallet = await client.get("/api/wallet", headers=headers)
    assert wallet.json()["balance_etb"] == "100.00"

    too_small = await client.post(
        "/api/wallet/withdrawals",
        headers=headers,
        json={
            "amount_etb": "99.00",
            "phone_number": "0912345678",
            "idempotency_key": str(uuid4()),
        },
    )
    assert too_small.status_code == 422
    assert too_small.json()["detail"]["code"] == "withdrawal_too_small"

    withdrawal = await client.post(
        "/api/wallet/withdrawals",
        headers=headers,
        json={
            "amount_etb": "100.00",
            "phone_number": "0912345678",
            "idempotency_key": str(uuid4()),
        },
    )
    assert withdrawal.status_code == 200
    assert withdrawal.json()["status"] == "pending"
    wallet = await client.get("/api/wallet", headers=headers)
    assert wallet.json()["balance_etb"] == "100.00"
    assert wallet.json()["pending_withdrawals_etb"] == "100.00"
    assert wallet.json()["available_etb"] == "0.00"


async def test_deposit_and_manual_withdrawal_ledger(session: AsyncSession) -> None:
    user = User(
        telegram_id=62002,
        username="wallet_stub",
        first_name="Wallet",
    )
    session.add(user)
    await session.flush()
    settings = get_settings().model_copy(
        update={"app_env": "development", "verify_et_api_key": "", "admin_api_key": "admin-test"}
    )
    service = WalletService(session, settings=settings, verify_client=StubVerifyEtClient())

    deposit_key = uuid4()
    first = await service.deposit(
        user,
        amount=Decimal("250"),
        transaction_number="TELE100001",
        idempotency_key=deposit_key,
    )
    repeated = await service.deposit(
        user,
        amount=Decimal("250"),
        transaction_number="TELE100001",
        idempotency_key=deposit_key,
    )
    assert repeated.id == first.id
    assert first.status == MoneyOrderStatus.SUCCEEDED

    withdrawal_key = uuid4()
    pending = await service.withdraw(
        user,
        amount=Decimal("150"),
        phone_number="+251912345678",
        idempotency_key=withdrawal_key,
    )
    assert pending.status == MoneyOrderStatus.PENDING
    wallet, transactions, orders = await service.summary(user)
    assert wallet.balance_etb == Decimal("250.00")
    assert not any(item.entry_type.value == "withdrawal_hold" for item in transactions)
    assert await service.pending_withdrawals(user) == Decimal("150.00")
    assert len(orders) == 2

    with pytest.raises(WalletError, match="balance is too low"):
        await service.withdraw(
            user,
            amount=Decimal("101"),
            phone_number="+251912345678",
            idempotency_key=uuid4(),
        )

    paid = await service.complete_withdrawal(pending.id)
    assert paid.status == MoneyOrderStatus.SUCCEEDED
    wallet, transactions, _ = await service.summary(user)
    assert wallet.balance_etb == Decimal("100.00")
    assert sum(item.entry_type.value == "withdrawal_hold" for item in transactions) == 1

    again = await service.complete_withdrawal(pending.id)
    assert again.status == MoneyOrderStatus.SUCCEEDED
    wallet, _, _ = await service.summary(user)
    assert wallet.balance_etb == Decimal("100.00")

    with pytest.raises(WalletError, match="already paid"):
        await service.reject_withdrawal(pending.id)


async def test_reject_withdrawal_releases_hold(session: AsyncSession) -> None:
    user = User(telegram_id=62003, username="wallet_reject", first_name="Reject")
    session.add(user)
    await session.flush()
    service = WalletService(
        session,
        settings=get_settings().model_copy(update={"app_env": "test", "verify_et_api_key": ""}),
        verify_client=StubVerifyEtClient(),
    )
    await service.deposit(
        user,
        amount=Decimal("180"),
        transaction_number="TELE800001",
        idempotency_key=uuid4(),
    )
    pending = await service.withdraw(
        user,
        amount=Decimal("100"),
        phone_number="0911223344",
        idempotency_key=uuid4(),
    )
    rejected = await service.reject_withdrawal(pending.id, reason="Wrong number")
    assert rejected.status == MoneyOrderStatus.CANCELLED
    wallet, transactions, _ = await service.summary(user)
    assert wallet.balance_etb == Decimal("180.00")
    assert await service.pending_withdrawals(user) == Decimal("0.00")
    assert not any(item.entry_type.value == "withdrawal_release" for item in transactions)

    with pytest.raises(WalletError, match="already cancelled"):
        await service.complete_withdrawal(pending.id)


async def test_admin_withdrawal_routes_require_key_and_deduct_on_confirm(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ADMIN_API_KEY", "admin-secret-key")
    get_settings.cache_clear()
    try:
        token, _ = await _login(client, telegram_id=62007)
        headers = {"Authorization": f"Bearer {token}"}
        await client.post(
            "/api/wallet/deposits",
            headers=headers,
            json={
                "amount_etb": "120.00",
                "transaction_number": "ADMINTX01",
                "idempotency_key": str(uuid4()),
            },
        )
        request = await client.post(
            "/api/wallet/withdrawals",
            headers=headers,
            json={
                "amount_etb": "100.00",
                "phone_number": "0911223344",
                "idempotency_key": str(uuid4()),
            },
        )
        order_id = request.json()["id"]

        denied = await client.get("/api/wallet/admin/withdrawals")
        assert denied.status_code == 401

        admin = {"X-Admin-Key": "admin-secret-key"}
        listed = await client.get("/api/wallet/admin/withdrawals", headers=admin)
        assert listed.status_code == 200
        row = next(item for item in listed.json() if item["id"] == order_id)
        assert row["balance_etb"] == "120.00"
        assert row["phone_number"] == "+251911223344"

        done = await client.post(
            f"/api/wallet/admin/withdrawals/{order_id}/complete", headers=admin
        )
        assert done.status_code == 200
        assert done.json()["status"] == "succeeded"

        wallet = await client.get("/api/wallet", headers=headers)
        assert wallet.json()["balance_etb"] == "20.00"
        assert wallet.json()["pending_withdrawals_etb"] == "0.00"
    finally:
        get_settings.cache_clear()


async def test_queued_verification_credits_via_webhook_handler(
    session: AsyncSession,
) -> None:
    user = User(telegram_id=62004, username="wallet_queue", first_name="Queue")
    session.add(user)
    await session.flush()

    class QueuedClient:
        async def submit_telebirr(self, **_kwargs: object) -> VerificationOutcome:
            return VerificationOutcome(
                request_id="req-queued-1",
                processing_status="queued",
                status="pending",
                verified=False,
                completed=False,
            )

    service = WalletService(session, verify_client=QueuedClient())
    order = await service.deposit(
        user,
        amount=Decimal("75"),
        transaction_number="DETQUEUE01",
        idempotency_key=uuid4(),
    )
    assert order.status == MoneyOrderStatus.PENDING
    assert order.verify_request_id == "req-queued-1"

    outcome = VerificationOutcome(
        request_id="req-queued-1",
        processing_status="completed",
        status="success",
        verified=True,
        amount=Decimal("75"),
        currency="ETB",
        completed=True,
    )
    updated = await service.apply_verify_et_result(request_id="req-queued-1", outcome=outcome)
    assert updated is not None
    assert updated.status == MoneyOrderStatus.SUCCEEDED
    wallet, _, _ = await service.summary(user)
    assert wallet.balance_etb == Decimal("75.00")


async def test_verify_et_webhook_signature(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "whsec_test_secret"
    monkeypatch.setenv("VERIFY_ET_WEBHOOK_SECRET", secret)
    get_settings.cache_clear()

    payload = {
        "id": str(uuid4()),
        "event": "verification.completed",
        "requestId": "missing-order",
        "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "data": {
            "processingStatus": "completed",
            "status": "success",
            "verified": True,
            "amount": "10",
        },
    }
    raw = json.dumps(payload).encode()
    timestamp = payload["timestamp"]
    signature = hmac.new(
        secret.encode(),
        f"{timestamp}.".encode() + raw,
        hashlib.sha256,
    ).hexdigest()

    ok = await client.post(
        "/api/webhooks/verify-et",
        content=raw,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Timestamp": timestamp,
            "X-Webhook-Signature": f"sha256={signature}",
            "X-Webhook-Event": "verification.completed",
            "X-Webhook-Event-Id": payload["id"],
        },
    )
    assert ok.status_code == 204

    bad = await client.post(
        "/api/webhooks/verify-et",
        content=raw,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Timestamp": timestamp,
            "X-Webhook-Signature": "sha256=deadbeef",
            "X-Webhook-Event": "verification.completed",
        },
    )
    assert bad.status_code == 401
    get_settings.cache_clear()


async def test_not_found_payment_is_not_saved(session: AsyncSession) -> None:
    user = User(telegram_id=62006, username="wallet_missing", first_name="Missing")
    session.add(user)
    await session.commit()

    class MissingPayment:
        async def submit_telebirr(self, **_kwargs: object) -> VerificationOutcome:
            return VerificationOutcome(
                request_id="req-missing",
                processing_status="completed",
                status="not_found",
                verified=False,
                completed=True,
            )

    service = WalletService(session, verify_client=MissingPayment())
    with pytest.raises(WalletError) as caught:
        await service.deposit(
            user,
            amount=Decimal("300"),
            transaction_number="4440HRHTERW",
            idempotency_key=uuid4(),
        )
    assert caught.value.code == "payment_not_found"
    wallet, transactions, orders = await service.summary(user)
    assert wallet.balance_etb == Decimal("0.00")
    assert orders == []
    assert transactions == []

    retried = await WalletService(session, verify_client=StubVerifyEtClient()).deposit(
        user,
        amount=Decimal("300"),
        transaction_number="4440HRHTERW",
        idempotency_key=uuid4(),
    )
    assert retried.status == MoneyOrderStatus.SUCCEEDED


async def test_joining_charges_entry_fee_and_records_it(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    challenge = Challenge(
        title="Fee round",
        description="Entry fee test.",
        question_count=1,
        duration_seconds=30,
        status=ChallengeStatus.LIVE,
        starts_at=datetime.now(UTC),
        entry_fee_etb=Decimal("20"),
    )
    session.add(challenge)
    await session.commit()

    token, _ = await _login(client, telegram_id=62008)
    headers = {"Authorization": f"Bearer {token}"}
    join_url = f"/api/challenges/{challenge.id}/join"

    broke = await client.post(join_url, headers=headers, json={"accepted_terms": True})
    assert broke.status_code == 402
    assert broke.json()["detail"]["code"] == "entry_fee_insufficient"

    await client.post(
        "/api/wallet/deposits",
        headers=headers,
        json={
            "amount_etb": "50.00",
            "transaction_number": "FEETXN001",
            "idempotency_key": str(uuid4()),
        },
    )
    joined = await client.post(join_url, headers=headers, json={"accepted_terms": True})
    assert joined.status_code == 200
    again = await client.post(join_url, headers=headers, json={"accepted_terms": True})
    assert again.status_code == 200

    wallet = (await client.get("/api/wallet", headers=headers)).json()
    assert wallet["balance_etb"] == "30.00"
    fees = [item for item in wallet["transactions"] if item["entry_type"] == "entry_fee"]
    assert len(fees) == 1
    assert fees[0]["amount_etb"] == "-20.00"
    assert fees[0]["description"] == "Joined Fee round"


async def test_duplicate_transaction_number_rejected(session: AsyncSession) -> None:
    user = User(telegram_id=62005, username="wallet_dup", first_name="Dup")
    session.add(user)
    await session.flush()
    service = WalletService(session, verify_client=StubVerifyEtClient())
    await service.deposit(
        user,
        amount=Decimal("20"),
        transaction_number="SAMETXN01",
        idempotency_key=uuid4(),
    )
    with pytest.raises(WalletError, match="already submitted"):
        await service.deposit(
            user,
            amount=Decimal("20"),
            transaction_number="SAMETXN01",
            idempotency_key=uuid4(),
        )


async def test_admin_can_change_receiving_account(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ADMIN_API_KEY", "admin-secret-key")
    get_settings.cache_clear()
    try:
        token, _ = await _login(client, telegram_id=62009)
        headers = {"Authorization": f"Bearer {token}"}
        admin = {"X-Admin-Key": "admin-secret-key"}

        denied = await client.put(
            "/api/wallet/admin/payment-account",
            json={"holder_name": "Abebe Bekele", "account_number": "0911223344"},
        )
        assert denied.status_code == 401

        updated = await client.put(
            "/api/wallet/admin/payment-account",
            headers=admin,
            json={"holder_name": "  Abebe   Bekele ", "account_number": "+251911223344"},
        )
        assert updated.status_code == 200
        assert updated.json() == {
            "holder_name": "Abebe Bekele",
            "account_number": "0911223344",
        }

        wallet = await client.get("/api/wallet", headers=headers)
        assert wallet.json()["settlement_account_name"] == "Abebe Bekele"
        assert wallet.json()["settlement_account"] == "0911223344"
    finally:
        get_settings.cache_clear()
