from collections.abc import Sequence
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.wallet import (
    MoneyOrder,
    MoneyOrderKind,
    MoneyOrderStatus,
    PaymentAccount,
    Wallet,
    WalletTransaction,
)


class WalletRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_or_create(self, user_id: UUID) -> Wallet:
        stmt = (
            pg_insert(Wallet)
            .values(user_id=user_id)
            .on_conflict_do_nothing(index_elements=[Wallet.user_id])
            .returning(Wallet)
        )
        created = await self.session.scalar(stmt)
        if created is not None:
            return created
        wallet = await self.session.scalar(select(Wallet).where(Wallet.user_id == user_id))
        if wallet is None:
            raise RuntimeError("Wallet conflict did not return an existing wallet.")
        return wallet

    async def lock(self, user_id: UUID) -> Wallet:
        wallet = await self.get_or_create(user_id)
        locked = await self.session.scalar(
            select(Wallet).where(Wallet.id == wallet.id).with_for_update()
        )
        if locked is None:
            raise RuntimeError("Wallet disappeared while acquiring its balance lock.")
        return locked

    async def order_by_idempotency(self, user_id: UUID, key: UUID) -> MoneyOrder | None:
        return await self.session.scalar(
            select(MoneyOrder).where(
                MoneyOrder.user_id == user_id,
                MoneyOrder.idempotency_key == key,
            )
        )

    async def order_by_id(self, order_id: UUID, *, lock: bool = False) -> MoneyOrder | None:
        stmt = select(MoneyOrder).where(MoneyOrder.id == order_id)
        if lock:
            stmt = stmt.with_for_update()
        return await self.session.scalar(stmt)

    async def pending_withdrawal_total(self, user_id: UUID) -> Decimal:
        total = await self.session.scalar(
            select(func.coalesce(func.sum(MoneyOrder.amount_etb), 0)).where(
                MoneyOrder.user_id == user_id,
                MoneyOrder.kind == MoneyOrderKind.WITHDRAWAL,
                MoneyOrder.status == MoneyOrderStatus.PENDING,
            )
        )
        return Decimal(total or 0)

    async def ledger_entry_exists(self, key: str) -> bool:
        found = await self.session.scalar(
            select(WalletTransaction.id).where(WalletTransaction.idempotency_key == key)
        )
        return found is not None

    async def withdrawals_with_users(
        self,
        *,
        status: MoneyOrderStatus | None,
        limit: int = 100,
    ) -> Sequence[tuple[MoneyOrder, User]]:
        stmt = (
            select(MoneyOrder, User)
            .join(User, User.id == MoneyOrder.user_id)
            .where(MoneyOrder.kind == MoneyOrderKind.WITHDRAWAL)
            .order_by(MoneyOrder.created_at.asc() if status else MoneyOrder.created_at.desc())
            .limit(limit)
        )
        if status is not None:
            stmt = stmt.where(MoneyOrder.status == status)
        return [(row[0], row[1]) for row in (await self.session.execute(stmt)).all()]

    async def order_by_transaction_number(self, transaction_number: str) -> MoneyOrder | None:
        return await self.session.scalar(
            select(MoneyOrder).where(MoneyOrder.transaction_number == transaction_number)
        )

    async def order_by_verify_request_id(self, request_id: str) -> MoneyOrder | None:
        return await self.session.scalar(
            select(MoneyOrder).where(MoneyOrder.verify_request_id == request_id)
        )

    async def recent_transactions(
        self,
        wallet_id: UUID,
        *,
        limit: int = 20,
    ) -> Sequence[WalletTransaction]:
        return (
            await self.session.scalars(
                select(WalletTransaction)
                .where(WalletTransaction.wallet_id == wallet_id)
                .order_by(WalletTransaction.created_at.desc())
                .limit(limit)
            )
        ).all()

    async def payment_account(self) -> PaymentAccount | None:
        return await self.session.get(PaymentAccount, 1)

    async def recent_orders(
        self,
        user_id: UUID,
        *,
        limit: int = 20,
    ) -> Sequence[MoneyOrder]:
        return (
            await self.session.scalars(
                select(MoneyOrder)
                .where(MoneyOrder.user_id == user_id)
                .order_by(MoneyOrder.created_at.desc())
                .limit(limit)
            )
        ).all()

    async def deposits_with_users(
        self,
        *,
        status: MoneyOrderStatus | None,
        limit: int = 100,
    ) -> Sequence[tuple[MoneyOrder, User]]:
        stmt = (
            select(MoneyOrder, User)
            .join(User, User.id == MoneyOrder.user_id)
            .where(MoneyOrder.kind == MoneyOrderKind.DEPOSIT)
            .order_by(MoneyOrder.created_at.desc())
            .limit(limit)
        )
        if status is not None:
            stmt = stmt.where(MoneyOrder.status == status)
        return [(row[0], row[1]) for row in (await self.session.execute(stmt)).all()]

    async def total_user_balances(self) -> Decimal:
        total = await self.session.scalar(
            select(func.coalesce(func.sum(Wallet.balance_etb), 0))
        )
        return Decimal(total or 0)
