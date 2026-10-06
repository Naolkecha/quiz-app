"""Create wallets, money orders, and wallet ledger.

Revision ID: 20261001_0004
Revises: 20261001_0003
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261001_0004"
down_revision: str | None = "20261001_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "wallets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "balance_etb",
            sa.Numeric(precision=12, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("balance_etb >= 0", name="ck_wallets_balance_nonnegative"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_wallets_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_wallets"),
        sa.UniqueConstraint("user_id", name="uq_wallets_user_id"),
    )
    op.create_table(
        "money_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("amount_etb", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("phone_number", sa.String(length=16), nullable=False),
        sa.Column("idempotency_key", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_reference", sa.String(length=128), nullable=True),
        sa.Column("checkout_url", sa.String(length=2048), nullable=True),
        sa.Column("failure_reason", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("amount_etb > 0", name="ck_money_orders_amount_positive"),
        sa.CheckConstraint("provider = 'telebirr'", name="ck_money_orders_provider_known"),
        sa.CheckConstraint(
            "kind IN ('deposit', 'withdrawal')",
            name="ck_money_orders_kind_known",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed', 'cancelled')",
            name="ck_money_orders_status_known",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_money_orders_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_money_orders"),
        sa.UniqueConstraint("provider_reference", name="uq_money_orders_provider_reference"),
        sa.UniqueConstraint("user_id", "idempotency_key", name="uq_money_orders_user_idempotency"),
    )
    op.create_index("ix_money_orders_user_id", "money_orders", ["user_id"])
    op.create_table(
        "wallet_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("wallet_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("entry_type", sa.String(length=32), nullable=False),
        sa.Column("amount_etb", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("balance_after_etb", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=256), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount_etb <> 0", name="ck_wallet_transactions_amount_nonzero"),
        sa.CheckConstraint(
            "balance_after_etb >= 0",
            name="ck_wallet_transactions_balance_after_nonnegative",
        ),
        sa.CheckConstraint(
            "entry_type IN "
            "('deposit', 'withdrawal_hold', 'withdrawal_release', 'prize', "
            "'entry_fee', 'adjustment')",
            name="ck_wallet_transactions_entry_type_known",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["money_orders.id"],
            name="fk_wallet_transactions_order_id_money_orders",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["wallet_id"],
            ["wallets.id"],
            name="fk_wallet_transactions_wallet_id_wallets",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_wallet_transactions"),
        sa.UniqueConstraint(
            "idempotency_key",
            name="uq_wallet_transactions_idempotency_key",
        ),
    )
    op.create_index("ix_wallet_transactions_wallet_id", "wallet_transactions", ["wallet_id"])


def downgrade() -> None:
    op.drop_index("ix_wallet_transactions_wallet_id", table_name="wallet_transactions")
    op.drop_table("wallet_transactions")
    op.drop_index("ix_money_orders_user_id", table_name="money_orders")
    op.drop_table("money_orders")
    op.drop_table("wallets")
