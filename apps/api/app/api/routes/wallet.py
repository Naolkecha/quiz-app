from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, DbSession, require_admin
from app.models.wallet import MoneyOrderStatus
from app.schemas.errors import ErrorResponse
from app.schemas.wallet import (
    AdminWithdrawalView,
    DepositRequest,
    MoneyOrderView,
    PaymentAccountUpdate,
    PaymentAccountView,
    WalletTransactionView,
    WalletView,
    WithdrawalDecision,
    WithdrawalRequest,
)
from app.services.wallets import WalletService

router = APIRouter(prefix="/wallet", tags=["wallet"])

_MONEY_ERRORS: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse, "description": "Authentication required."},
    409: {"model": ErrorResponse, "description": "Balance or idempotency conflict."},
    422: {"description": "The amount, phone, or transaction number is invalid."},
    503: {"model": ErrorResponse, "description": "Verify.et is not configured."},
}


_admin_key = require_admin


@router.get(
    "",
    response_model=WalletView,
    summary="Return the current balance and recent wallet activity",
    responses={401: _MONEY_ERRORS[401]},
)
async def wallet(user: CurrentUser, session: DbSession) -> WalletView:
    service = WalletService(session)
    account, transactions, orders = await service.summary(user)
    pending = await service.pending_withdrawals(user)
    account_name, account_number = await service.destination()
    return WalletView(
        balance_etb=account.balance_etb,
        pending_withdrawals_etb=pending,
        available_etb=max(account.balance_etb - pending, Decimal("0")),
        deposit_mode=service.deposit_mode,
        deposits_enabled=service.deposits_enabled,
        withdrawals_enabled=service.withdrawals_enabled,
        settlement_account=account_number,
        settlement_account_name=account_name,
        transactions=[
            WalletTransactionView(
                id=item.id,
                entry_type=item.entry_type,
                amount_etb=item.amount_etb,
                balance_after_etb=item.balance_after_etb,
                description=item.description,
                created_at=item.created_at,
            )
            for item in transactions
        ],
        orders=[_order(item) for item in orders],
    )


@router.post(
    "/deposits",
    response_model=MoneyOrderView,
    summary="Submit a Telebirr deposit for Verify.et confirmation",
    description=(
        "Pay the Challenge Telebirr number, then submit the transaction number. "
        "Verify.et confirms the receipt and credits the wallet when the check succeeds."
    ),
    responses=_MONEY_ERRORS,
)
async def deposit(
    body: DepositRequest,
    user: CurrentUser,
    session: DbSession,
) -> MoneyOrderView:
    order = await WalletService(session).deposit(
        user,
        amount=body.amount_etb,
        transaction_number=body.transaction_number,
        idempotency_key=body.idempotency_key,
    )
    return _order(order)


@router.post(
    "/withdrawals",
    response_model=MoneyOrderView,
    summary="Request a manual Telebirr withdrawal",
    description=(
        "Creates a pending cash out. The balance is deducted only when an admin "
        "confirms the Telebirr payout was sent."
    ),
    responses=_MONEY_ERRORS,
)
async def withdraw(
    body: WithdrawalRequest,
    user: CurrentUser,
    session: DbSession,
) -> MoneyOrderView:
    order = await WalletService(session).withdraw(
        user,
        amount=body.amount_etb,
        phone_number=body.phone_number,
        idempotency_key=body.idempotency_key,
    )
    return _order(order)


@router.get(
    "/admin/payment-account",
    response_model=PaymentAccountView,
    summary="Return the Telebirr account players pay into",
    dependencies=[Depends(_admin_key)],
)
async def payment_account(session: DbSession) -> PaymentAccountView:
    name, number = await WalletService(session).destination()
    return PaymentAccountView(holder_name=name, account_number=number or "")


@router.put(
    "/admin/payment-account",
    response_model=PaymentAccountView,
    summary="Change the Telebirr name and number players pay into",
    dependencies=[Depends(_admin_key)],
)
async def update_payment_account(
    body: PaymentAccountUpdate,
    session: DbSession,
) -> PaymentAccountView:
    saved = await WalletService(session).update_destination(
        holder_name=body.holder_name,
        account_number=body.account_number,
    )
    return PaymentAccountView(holder_name=saved.holder_name, account_number=saved.account_number)


@router.get(
    "/admin/withdrawals",
    response_model=list[AdminWithdrawalView],
    summary="List cash out requests for admin review",
    dependencies=[Depends(_admin_key)],
)
async def list_withdrawals(
    session: DbSession,
    status: Annotated[Literal["pending", "succeeded", "cancelled", "all"], Query()] = "pending",
) -> list[AdminWithdrawalView]:
    selected = None if status == "all" else MoneyOrderStatus(status)
    rows = await WalletService(session).list_withdrawals(status=selected)
    return [
        AdminWithdrawalView(
            **_order(order).model_dump(),
            user_id=user.id,
            player_name=" ".join(part for part in (user.first_name, user.last_name) if part),
            telegram_username=user.username,
            telegram_id=user.telegram_id,
            balance_etb=balance,
        )
        for order, user, balance in rows
    ]


@router.post(
    "/admin/withdrawals/{order_id}/complete",
    response_model=MoneyOrderView,
    summary="Mark a pending withdrawal as paid",
    dependencies=[Depends(_admin_key)],
)
async def complete_withdrawal(order_id: UUID, session: DbSession) -> MoneyOrderView:
    return _order(await WalletService(session).complete_withdrawal(order_id))


@router.post(
    "/admin/withdrawals/{order_id}/reject",
    response_model=MoneyOrderView,
    summary="Reject a pending withdrawal and release the hold",
    dependencies=[Depends(_admin_key)],
)
async def reject_withdrawal(
    order_id: UUID,
    session: DbSession,
    body: WithdrawalDecision | None = None,
) -> MoneyOrderView:
    reason = body.reason if body is not None else None
    return _order(await WalletService(session).reject_withdrawal(order_id, reason=reason))


def _order(item: Any) -> MoneyOrderView:
    return MoneyOrderView(
        id=item.id,
        kind=item.kind,
        status=item.status,
        provider=item.provider,
        amount_etb=item.amount_etb,
        phone_number=item.phone_number,
        transaction_number=item.transaction_number,
        failure_reason=item.failure_reason,
        created_at=item.created_at,
        completed_at=item.completed_at,
    )
