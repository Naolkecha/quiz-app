"""Wallet balances, immutable ledger entries, and provider money orders."""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MoneyOrderKind(enum.StrEnum):
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"


class MoneyOrderStatus(enum.StrEnum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class LedgerType(enum.StrEnum):
    DEPOSIT = "deposit"
    WITHDRAWAL_HOLD = "withdrawal_hold"
    WITHDRAWAL_RELEASE = "withdrawal_release"
    PRIZE = "prize"
    ENTRY_FEE = "entry_fee"
    ADJUSTMENT = "adjustment"
    REFERRAL = "referral"
    DAILY_SPIN = "daily_spin"


class Wallet(Base):
    __tablename__ = "wallets"
    __table_args__ = (CheckConstraint("balance_etb >= 0", name="balance_nonnegative"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    balance_etb: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0"),
        server_default=text("0"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class MoneyOrder(Base):
    __tablename__ = "money_orders"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_money_orders_user_idempotency"),
        CheckConstraint("amount_etb > 0", name="amount_positive"),
        CheckConstraint("provider = 'telebirr'", name="provider_known"),
        CheckConstraint("kind IN ('deposit', 'withdrawal')", name="kind_known"),
        CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed', 'cancelled')",
            name="status_known",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[MoneyOrderKind] = mapped_column(
        Enum(
            MoneyOrderKind,
            name="money_order_kind",
            native_enum=False,
            length=32,
            values_callable=lambda members: [member.value for member in members],
            create_constraint=False,
        ),
        nullable=False,
    )
    status: Mapped[MoneyOrderStatus] = mapped_column(
        Enum(
            MoneyOrderStatus,
            name="money_order_status",
            native_enum=False,
            length=32,
            values_callable=lambda members: [member.value for member in members],
            create_constraint=False,
        ),
        nullable=False,
        default=MoneyOrderStatus.PENDING,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="telebirr")
    amount_etb: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(16))
    transaction_number: Mapped[str | None] = mapped_column(String(64))
    verify_request_id: Mapped[str | None] = mapped_column(String(64))
    idempotency_key: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    provider_reference: Mapped[str | None] = mapped_column(String(128), unique=True)
    checkout_url: Mapped[str | None] = mapped_column(String(2048))
    failure_reason: Mapped[str | None] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_wallet_transactions_idempotency_key"),
        CheckConstraint("amount_etb <> 0 OR entry_type = 'entry_fee'", name="amount_nonzero"),
        CheckConstraint("balance_after_etb >= 0", name="balance_after_nonnegative"),
        CheckConstraint(
            "entry_type IN "
            "('deposit', 'withdrawal_hold', 'withdrawal_release', 'prize', "
            "'entry_fee', 'adjustment', 'referral')",
            name="entry_type_known",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wallet_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("wallets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("money_orders.id", ondelete="RESTRICT"),
    )
    entry_type: Mapped[LedgerType] = mapped_column(
        Enum(
            LedgerType,
            name="wallet_ledger_type",
            native_enum=False,
            length=32,
            values_callable=lambda members: [member.value for member in members],
            create_constraint=False,
        ),
        nullable=False,
    )
    amount_etb: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    balance_after_etb: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(String(256), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class PaymentAccount(Base):
    """The single Telebirr account players pay into. Admins can change it."""

    __tablename__ = "payment_accounts"
    __table_args__ = (CheckConstraint("id = 1", name="singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    holder_name: Mapped[str] = mapped_column(String(80), nullable=False)
    account_number: Mapped[str] = mapped_column(String(20), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
