"""Add Verify.et deposit fields and nullable withdrawal phones.

Revision ID: 20261001_0005
Revises: 20261001_0004
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261001_0005"
down_revision: str | None = "20261001_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "money_orders",
        sa.Column("transaction_number", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "money_orders",
        sa.Column("verify_request_id", sa.String(length=64), nullable=True),
    )
    op.alter_column("money_orders", "phone_number", existing_type=sa.String(length=16), nullable=True)
    op.create_index(
        "uq_money_orders_transaction_number",
        "money_orders",
        ["transaction_number"],
        unique=True,
        postgresql_where=sa.text("transaction_number IS NOT NULL"),
    )
    op.create_index(
        "uq_money_orders_verify_request_id",
        "money_orders",
        ["verify_request_id"],
        unique=True,
        postgresql_where=sa.text("verify_request_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_money_orders_verify_request_id", table_name="money_orders")
    op.drop_index("uq_money_orders_transaction_number", table_name="money_orders")
    op.alter_column(
        "money_orders",
        "phone_number",
        existing_type=sa.String(length=16),
        nullable=False,
    )
    op.drop_column("money_orders", "verify_request_id")
    op.drop_column("money_orders", "transaction_number")
