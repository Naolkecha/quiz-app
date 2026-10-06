from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.exceptions import NotFoundError, WalletError
from app.integrations.verify_et import (
    VerificationOutcome,
    VerifyEtApiError,
    VerifyEtClient,
    build_verify_et_client,
)
from app.models.user import User
from app.models.wallet import (
    LedgerType,
    MoneyOrder,
    MoneyOrderKind,
    MoneyOrderStatus,
    PaymentAccount,
    Wallet,
    WalletTransaction,
)
from app.repositories.wallets import WalletRepository
from app.services.notify import TelegramNotifier

MIN_DEPOSIT = Decimal("10.00")
MIN_WITHDRAWAL = Decimal("100.00")
_CENT = Decimal("0.01")


class WalletService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings | None = None,
        verify_client: VerifyEtClient | None = None,
    ) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.verify = verify_client or build_verify_et_client(self.settings)
        self.wallets = WalletRepository(session)

    @property
    def deposit_mode(self) -> str:
        return self.settings.deposit_mode

    @property
    def deposits_enabled(self) -> bool:
        return self.settings.deposits_enabled

    @property
    def withdrawals_enabled(self) -> bool:
        return self.settings.withdrawals_enabled

    async def destination(self) -> tuple[str, str | None]:
        row = await self.wallets.payment_account()
        if row is None:
            name = self.settings.telebirr_account_name.strip() or "Naol Kecha"
            number = self.settings.telebirr_settlement_account.strip() or None
            return name, number
        number = row.account_number.strip() or None
        return row.holder_name.strip() or "Naol Kecha", number

    async def update_destination(self, *, holder_name: str, account_number: str) -> PaymentAccount:
        row = await self.wallets.payment_account()
        if row is None:
            row = PaymentAccount(id=1, holder_name=holder_name, account_number=account_number)
            self.session.add(row)
        else:
            row.holder_name = holder_name
            row.account_number = account_number
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def summary(
        self,
        user: User,
    ) -> tuple[Wallet, list[WalletTransaction], list[MoneyOrder]]:
        wallet = await self.wallets.get_or_create(user.id)
        await self.session.commit()
        transactions = list(await self.wallets.recent_transactions(wallet.id))
        orders = list(await self.wallets.recent_orders(user.id))
        return wallet, transactions, orders

    async def deposit(
        self,
        user: User,
        *,
        amount: Decimal,
        transaction_number: str,
        idempotency_key: UUID,
    ) -> MoneyOrder:
        amount = _money(amount)
        txn = _normalize_transaction_number(transaction_number)
        if amount < MIN_DEPOSIT:
            raise WalletError(
                "deposit_too_small",
                f"The minimum deposit is {MIN_DEPOSIT} ETB.",
                status_code=422,
            )
        existing = await self.wallets.order_by_idempotency(user.id, idempotency_key)
        if existing is not None:
            return _same_kind(existing, MoneyOrderKind.DEPOSIT)
        if not self.deposits_enabled:
            raise WalletError(
                "verify_et_unavailable",
                "Deposits need a Verify.et API key.",
                status_code=503,
            )

        duplicate = await self.wallets.order_by_transaction_number(txn)
        if duplicate is not None:
            if duplicate.user_id == user.id and duplicate.status == MoneyOrderStatus.FAILED:
                await self.session.delete(duplicate)
                await self.session.flush()
            else:
                raise WalletError(
                    "transaction_already_used",
                    "That Telebirr transaction was already submitted.",
                    status_code=409,
                )

        order = MoneyOrder(
            user_id=user.id,
            kind=MoneyOrderKind.DEPOSIT,
            status=MoneyOrderStatus.PENDING,
            provider="telebirr",
            amount_etb=amount,
            phone_number=None,
            transaction_number=txn,
            idempotency_key=idempotency_key,
        )
        self.session.add(order)
        try:
            await self.session.flush()
        except IntegrityError as exc:
            raise WalletError(
                "transaction_already_used",
                "That Telebirr transaction was already submitted.",
                status_code=409,
            ) from exc

        try:
            _name, account_number = await self.destination()
            outcome = await self.verify.submit_telebirr(
                transaction_number=txn,
                settlement_account=account_number,
                idempotency_key=f"deposit-{order.id}",
                wait_ms=5000,
            )
        except VerifyEtApiError as exc:
            await self._discard(order)
            raise WalletError(
                "verification_failed",
                exc.message,
                status_code=502 if exc.status_code >= 500 else 422,
            ) from exc

        if outcome.completed and _is_not_found(outcome):
            await self._discard(order)
            raise WalletError(
                "payment_not_found",
                "This transaction number was not found on Telebirr.",
                status_code=422,
            )

        order.verify_request_id = outcome.request_id
        order.provider_reference = outcome.request_id
        await self.session.flush()

        if outcome.completed:
            await self._apply_verification(order, outcome)
        await self.session.commit()
        await self.session.refresh(order)
        await TelegramNotifier(self.session, self.settings).deposit_updated(user, order)
        return order

    async def withdraw(
        self,
        user: User,
        *,
        amount: Decimal,
        phone_number: str,
        idempotency_key: UUID,
    ) -> MoneyOrder:
        amount = _money(amount)
        if amount < MIN_WITHDRAWAL:
            raise WalletError(
                "withdrawal_too_small",
                f"The minimum withdrawal is {MIN_WITHDRAWAL} ETB.",
                status_code=422,
            )
        existing = await self.wallets.order_by_idempotency(user.id, idempotency_key)
        if existing is not None:
            return _same_kind(existing, MoneyOrderKind.WITHDRAWAL)

        wallet = await self.wallets.lock(user.id)
        pending = await self.wallets.pending_withdrawal_total(user.id)
        if wallet.balance_etb - pending < amount:
            raise WalletError("insufficient_balance", "Your wallet balance is too low.")
        order = MoneyOrder(
            user_id=user.id,
            kind=MoneyOrderKind.WITHDRAWAL,
            status=MoneyOrderStatus.PENDING,
            provider="telebirr",
            amount_etb=amount,
            phone_number=phone_number,
            idempotency_key=idempotency_key,
        )
        self.session.add(order)
        await self.session.commit()
        await self.session.refresh(order)
        await TelegramNotifier(self.session, self.settings).payout_requested(user, order)
        return order

    async def pending_withdrawals(self, user: User) -> Decimal:
        return _money(await self.wallets.pending_withdrawal_total(user.id))

    async def charge_entry_fee(
        self,
        user: User,
        *,
        challenge_id: UUID,
        challenge_title: str,
        fee: Decimal,
    ) -> None:
        """Record the join in the ledger. Caller commits together with the entry row."""
        fee = _money(fee)
        key = f"entry_fee:{challenge_id}:{user.id}"
        wallet = await self.wallets.lock(user.id)
        if await self.wallets.ledger_entry_exists(key):
            return
        pending = await self.wallets.pending_withdrawal_total(user.id)
        if wallet.balance_etb - pending < fee:
            raise WalletError(
                "entry_fee_insufficient",
                f"You need {fee} ETB to join. Add money to your wallet first.",
                status_code=402,
            )
        await self._post(
            wallet,
            amount=-fee,
            entry_type=LedgerType.ENTRY_FEE,
            order=None,
            key=key,
            description=f"Joined {challenge_title}"[:256],
        )

    async def award_prize(
        self,
        user_id: UUID,
        *,
        challenge_id: UUID,
        challenge_title: str,
        amount: Decimal,
    ) -> None:
        """Credit a challenge prize. The caller commits."""
        key = f"prize:{challenge_id}"
        wallet = await self.wallets.lock(user_id)
        if await self.wallets.ledger_entry_exists(key):
            return
        await self._post(
            wallet,
            amount=_money(amount),
            entry_type=LedgerType.PRIZE,
            order=None,
            key=key,
            description=f"Won {challenge_title}"[:256],
        )

    async def award_referral(
        self,
        referrer_id: UUID,
        *,
        referral_id: UUID,
        referred_name: str,
        amount: Decimal,
    ) -> WalletTransaction | None:
        """Credit a referral bonus. The caller commits."""
        key = f"referral:{referral_id}"
        wallet = await self.wallets.lock(referrer_id)
        if await self.wallets.ledger_entry_exists(key):
            return None
        return await self._post(
            wallet,
            amount=_money(amount),
            entry_type=LedgerType.REFERRAL,
            order=None,
            key=key,
            description=f"Referral reward for inviting {referred_name}"[:256],
        )

    async def award_daily_spin(
        self,
        user_id: UUID,
        *,
        spin_id: UUID,
        amount: Decimal,
        label: str = "",
    ) -> WalletTransaction | None:
        """Credit a daily spin prize. The caller commits."""
        key = f"daily_spin:{spin_id}"
        wallet = await self.wallets.lock(user_id)
        if await self.wallets.ledger_entry_exists(key):
            return None
        desc = f"Daily lucky spin prize: {label}" if label else "Daily lucky spin prize"
        return await self._post(
            wallet,
            amount=_money(amount),
            entry_type=LedgerType.DAILY_SPIN,
            order=None,
            key=key,
            description=desc[:256],
        )

    async def apply_verify_et_result(
        self,
        *,
        request_id: str,
        outcome: VerificationOutcome,
    ) -> MoneyOrder | None:
        order = await self.wallets.order_by_verify_request_id(request_id)
        if order is None:
            return None
        if order.status != MoneyOrderStatus.PENDING:
            return order
        if outcome.completed and _is_not_found(outcome):
            await self._discard(order)
            return None
        await self._apply_verification(order, outcome)
        await self.session.commit()
        await self.session.refresh(order)
        player = await self.session.get(User, order.user_id)
        if player is not None:
            await TelegramNotifier(self.session, self.settings).deposit_updated(player, order)
        return order

    async def list_withdrawals(
        self,
        *,
        status: MoneyOrderStatus | None = MoneyOrderStatus.PENDING,
    ) -> list[tuple[MoneyOrder, User, Decimal]]:
        rows = await self.wallets.withdrawals_with_users(status=status)
        result: list[tuple[MoneyOrder, User, Decimal]] = []
        for order, user in rows:
            wallet = await self.wallets.get_or_create(user.id)
            result.append((order, user, wallet.balance_etb))
        await self.session.commit()
        return result

    async def complete_withdrawal(self, order_id: UUID) -> MoneyOrder:
        order = await self._pending_withdrawal(order_id)
        if order.status == MoneyOrderStatus.SUCCEEDED:
            return order

        wallet = await self.wallets.lock(order.user_id)
        order = await self._pending_withdrawal(order_id, lock=True)
        if order.status == MoneyOrderStatus.SUCCEEDED:
            return order
        if order.status != MoneyOrderStatus.PENDING:
            raise WalletError("withdrawal_not_pending", "This cash out was already cancelled.")

        # Requests made before payouts moved to admin confirmation were deducted up front.
        already_held = await self.wallets.ledger_entry_exists(f"withdrawal:{order.id}:hold")
        if not already_held:
            if wallet.balance_etb < order.amount_etb:
                raise WalletError(
                    "insufficient_balance",
                    "The player's balance is now lower than this cash out. Reject it instead.",
                )
            await self._post(
                wallet,
                amount=-order.amount_etb,
                entry_type=LedgerType.WITHDRAWAL_HOLD,
                order=order,
                key=f"withdrawal:{order.id}:paid",
                description=f"Cash out sent to {order.phone_number}",
            )
        order.status = MoneyOrderStatus.SUCCEEDED
        order.completed_at = datetime.now(UTC)
        order.failure_reason = None
        await self.session.commit()
        await self.session.refresh(order)
        player = await self.session.get(User, order.user_id)
        if player is not None:
            await TelegramNotifier(self.session, self.settings).payout_paid(player, order)
        return order

    async def reject_withdrawal(self, order_id: UUID, *, reason: str | None = None) -> MoneyOrder:
        order = await self._pending_withdrawal(order_id)
        if order.status == MoneyOrderStatus.CANCELLED:
            return order

        wallet = await self.wallets.lock(order.user_id)
        order = await self._pending_withdrawal(order_id, lock=True)
        if order.status == MoneyOrderStatus.CANCELLED:
            return order
        if order.status != MoneyOrderStatus.PENDING:
            raise WalletError("withdrawal_not_pending", "This cash out was already paid.")

        if await self.wallets.ledger_entry_exists(f"withdrawal:{order.id}:hold"):
            await self._post(
                wallet,
                amount=order.amount_etb,
                entry_type=LedgerType.WITHDRAWAL_RELEASE,
                order=order,
                key=f"withdrawal:{order.id}:release",
                description="Cash out cancelled; money returned",
            )
        order.status = MoneyOrderStatus.CANCELLED
        order.completed_at = datetime.now(UTC)
        order.failure_reason = (reason or "Cancelled by admin")[:256]
        await self.session.commit()
        await self.session.refresh(order)
        player = await self.session.get(User, order.user_id)
        if player is not None:
            await TelegramNotifier(self.session, self.settings).payout_rejected(player, order)
        return order

    async def list_deposits(
        self,
        *,
        status: MoneyOrderStatus | None = None,
        limit: int = 100,
    ) -> list[tuple[MoneyOrder, User, Decimal]]:
        rows = await self.wallets.deposits_with_users(status=status, limit=limit)
        result: list[tuple[MoneyOrder, User, Decimal]] = []
        for order, user in rows:
            wallet = await self.wallets.get_or_create(user.id)
            result.append((order, user, wallet.balance_etb))
        await self.session.commit()
        return result

    async def manual_approve_deposit(self, order_id: UUID) -> tuple[MoneyOrder, User, Decimal]:
        order = await self.wallets.order_by_id(order_id, lock=True)
        if order is None or order.kind != MoneyOrderKind.DEPOSIT:
            raise NotFoundError("Deposit not found.")
        user = await self.session.get(User, order.user_id)
        if user is None:
            raise NotFoundError("Player not found.")
        wallet = await self.wallets.lock(order.user_id)
        if order.status != MoneyOrderStatus.SUCCEEDED:
            order.status = MoneyOrderStatus.SUCCEEDED
            order.completed_at = datetime.now(UTC)
            order.failure_reason = None
            key = f"deposit:{order.id}"
            if not await self.wallets.ledger_entry_exists(key):
                await self._post(
                    wallet,
                    amount=order.amount_etb,
                    entry_type=LedgerType.DEPOSIT,
                    order=order,
                    key=key,
                    description=f"Telebirr deposit {order.transaction_number or 'manual'}"[:256],
                )
            await self.session.commit()
            await self.session.refresh(order)
            await self.session.refresh(wallet)
            await TelegramNotifier(self.session, self.settings).deposit_updated(user, order)
        return order, user, wallet.balance_etb

    async def adjust_balance(
        self,
        user_id: UUID,
        *,
        amount: Decimal,
        direction: Literal["credit", "debit"],
        reason: str,
    ) -> tuple[Wallet, WalletTransaction, User]:
        user = await self.session.get(User, user_id)
        if user is None:
            raise NotFoundError("Player not found.")
        amount = _money(amount)
        if amount <= 0:
            raise WalletError(
                "invalid_amount",
                "Adjustment amount must be positive.",
                status_code=422,
            )
        wallet = await self.wallets.lock(user_id)
        if direction == "debit":
            if wallet.balance_etb < amount:
                raise WalletError(
                    "insufficient_balance",
                    f"Player balance ({wallet.balance_etb} ETB) is less than {amount} ETB.",
                    status_code=409,
                )
            delta = -amount
        elif direction == "credit":
            delta = amount
        else:
            raise WalletError(
                "invalid_direction",
                "Direction must be credit or debit.",
                status_code=422,
            )

        adj_key = f"adjustment:{uuid4()}"
        desc = f"Admin {direction}: {reason.strip()}"[:256]
        tx = await self._post(
            wallet,
            amount=delta,
            entry_type=LedgerType.ADJUSTMENT,
            order=None,
            key=adj_key,
            description=desc,
        )
        await self.session.commit()
        await self.session.refresh(wallet)
        await TelegramNotifier(self.session, self.settings).balance_adjusted(
            user,
            amount=delta,
            balance_after=wallet.balance_etb,
            direction=direction,
            reason=reason.strip(),
        )
        return wallet, tx, user

    async def finance_summary(self) -> dict[str, Any]:
        since = datetime.now(UTC) - timedelta(days=1)
        total_user_balances = await self.wallets.total_user_balances()

        total_deposits_all_time = await self.session.scalar(
            select(func.coalesce(func.sum(WalletTransaction.amount_etb), 0)).where(
                WalletTransaction.entry_type == LedgerType.DEPOSIT
            )
        )
        total_withdrawals_paid_all_time = await self.session.scalar(
            select(func.coalesce(func.sum(MoneyOrder.amount_etb), 0)).where(
                MoneyOrder.kind == MoneyOrderKind.WITHDRAWAL,
                MoneyOrder.status == MoneyOrderStatus.SUCCEEDED,
            )
        )
        total_adjustments_all_time = await self.session.scalar(
            select(func.coalesce(func.sum(WalletTransaction.amount_etb), 0)).where(
                WalletTransaction.entry_type == LedgerType.ADJUSTMENT
            )
        )
        total_entry_fees_all_time = await self.session.scalar(
            select(func.coalesce(func.sum(func.abs(WalletTransaction.amount_etb)), 0)).where(
                WalletTransaction.entry_type == LedgerType.ENTRY_FEE
            )
        )
        total_prizes_paid_all_time = await self.session.scalar(
            select(func.coalesce(func.sum(WalletTransaction.amount_etb), 0)).where(
                WalletTransaction.entry_type == LedgerType.PRIZE
            )
        )
        pending = (
            await self.session.execute(
                select(func.count(), func.coalesce(func.sum(MoneyOrder.amount_etb), 0)).where(
                    MoneyOrder.kind == MoneyOrderKind.WITHDRAWAL,
                    MoneyOrder.status == MoneyOrderStatus.PENDING,
                )
            )
        ).one()

        deposits_today = await self.session.scalar(
            select(func.coalesce(func.sum(WalletTransaction.amount_etb), 0)).where(
                WalletTransaction.entry_type == LedgerType.DEPOSIT,
                WalletTransaction.created_at >= since,
            )
        )
        entry_fees_today = await self.session.scalar(
            select(func.coalesce(func.sum(func.abs(WalletTransaction.amount_etb)), 0)).where(
                WalletTransaction.entry_type == LedgerType.ENTRY_FEE,
                WalletTransaction.created_at >= since,
            )
        )
        prizes_today = await self.session.scalar(
            select(func.coalesce(func.sum(WalletTransaction.amount_etb), 0)).where(
                WalletTransaction.entry_type == LedgerType.PRIZE,
                WalletTransaction.created_at >= since,
            )
        )
        withdrawals_paid_today = await self.session.scalar(
            select(func.coalesce(func.sum(MoneyOrder.amount_etb), 0)).where(
                MoneyOrder.kind == MoneyOrderKind.WITHDRAWAL,
                MoneyOrder.status == MoneyOrderStatus.SUCCEEDED,
                MoneyOrder.completed_at >= since,
            )
        )

        acc_name, acc_number = await self.destination()

        fees = Decimal(total_entry_fees_all_time or 0)
        prizes = Decimal(total_prizes_paid_all_time or 0)
        return {
            "total_user_balances_etb": Decimal(total_user_balances or 0),
            "total_deposits_all_time_etb": Decimal(total_deposits_all_time or 0),
            "total_withdrawals_paid_all_time_etb": Decimal(total_withdrawals_paid_all_time or 0),
            "total_adjustments_all_time_etb": Decimal(total_adjustments_all_time or 0),
            "pending_withdrawals_count": int(pending[0] or 0),
            "pending_withdrawals_etb": Decimal(pending[1] or 0),
            "total_entry_fees_all_time_etb": fees,
            "total_prizes_paid_all_time_etb": prizes,
            "net_platform_profit_etb": fees - prizes,
            "deposits_today_etb": Decimal(deposits_today or 0),
            "entry_fees_today_etb": Decimal(entry_fees_today or 0),
            "prizes_today_etb": Decimal(prizes_today or 0),
            "withdrawals_paid_today_etb": Decimal(withdrawals_paid_today or 0),
            "telebirr_account_name": acc_name,
            "telebirr_account_number": acc_number or "",
        }

    async def _discard(self, order: MoneyOrder) -> None:
        await self.session.delete(order)
        await self.session.commit()

    async def _pending_withdrawal(self, order_id: UUID, *, lock: bool = False) -> MoneyOrder:
        order = await self.wallets.order_by_id(order_id, lock=lock)
        if order is None or order.kind != MoneyOrderKind.WITHDRAWAL:
            raise NotFoundError("Withdrawal not found.")
        if order.status == MoneyOrderStatus.FAILED:
            raise WalletError("withdrawal_not_pending", "This cash out is already closed.")
        return order

    async def _apply_verification(self, order: MoneyOrder, outcome: VerificationOutcome) -> None:
        if order.kind != MoneyOrderKind.DEPOSIT:
            return
        if order.status != MoneyOrderStatus.PENDING:
            return

        if not outcome.verified or outcome.status != "success":
            _fail(order, _verification_message(outcome))
            return

        _name, account_number = await self.destination()
        if account_number and outcome.settlement_matched is False:
            _fail(order, f"This payment was not sent to {account_number}.")
            return

        credited = outcome.amount if outcome.amount is not None else order.amount_etb
        credited = _money(credited)
        if credited != order.amount_etb:
            _fail(
                order,
                f"Telebirr shows {credited} ETB, not the {order.amount_etb} ETB you entered.",
            )
            return

        wallet = await self.wallets.lock(order.user_id)
        order.status = MoneyOrderStatus.SUCCEEDED
        order.completed_at = datetime.now(UTC)
        order.failure_reason = None
        await self._post(
            wallet,
            amount=credited,
            entry_type=LedgerType.DEPOSIT,
            order=order,
            key=f"deposit:{order.id}",
            description=f"Telebirr deposit {order.transaction_number}",
        )

    async def _post(
        self,
        wallet: Wallet,
        *,
        amount: Decimal,
        entry_type: LedgerType,
        order: MoneyOrder | None,
        key: str,
        description: str,
    ) -> WalletTransaction:
        balance_after = _money(wallet.balance_etb + amount)
        if balance_after < 0:
            raise WalletError("insufficient_balance", "Your wallet balance is too low.")
        wallet.balance_etb = balance_after
        tx = WalletTransaction(
            wallet_id=wallet.id,
            order_id=order.id if order is not None else None,
            entry_type=entry_type,
            amount_etb=amount,
            balance_after_etb=balance_after,
            idempotency_key=key,
            description=description,
        )
        self.session.add(tx)
        return tx


def _is_not_found(outcome: VerificationOutcome) -> bool:
    return outcome.status == "not_found"


def _money(value: Decimal) -> Decimal:
    return value.quantize(_CENT, rounding=ROUND_HALF_UP)


def _normalize_transaction_number(value: str) -> str:
    compact = "".join(character for character in value.strip().upper() if character.isalnum())
    if len(compact) < 6 or len(compact) > 64:
        raise WalletError(
            "invalid_transaction_number",
            "Enter the Telebirr transaction number from your SMS or receipt.",
            status_code=422,
        )
    return compact


def _fail(order: MoneyOrder, reason: str) -> None:
    order.status = MoneyOrderStatus.FAILED
    order.failure_reason = reason[:256]
    order.completed_at = datetime.now(UTC)


def _verification_message(outcome: VerificationOutcome) -> str:
    if outcome.error_message and outcome.status not in {"not_found", "failed", "pending"}:
        return outcome.error_message
    if outcome.status == "not_found":
        return "This transaction number was not found on Telebirr."
    if outcome.status == "failed":
        return "Telebirr did not confirm this payment."
    if outcome.status == "pending":
        return "Telebirr has not finished this payment."
    return "This payment is not confirmed."


def _same_kind(order: MoneyOrder, expected: MoneyOrderKind) -> MoneyOrder:
    if order.kind != expected:
        raise WalletError(
            "idempotency_key_reused",
            "That request key was already used for a different wallet operation.",
        )
    return order
