"""Allow zero-amount entry fee ledger rows so every join is recorded.

Revision ID: 20261001_0006
Revises: 20261001_0005
Create Date: 2026-10-01
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261001_0006"
down_revision: str | None = "20261001_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_wallet_transactions_amount_nonzero",
        "wallet_transactions",
        type_="check",
    )
    op.create_check_constraint(
        "ck_wallet_transactions_amount_nonzero",
        "wallet_transactions",
        "amount_etb <> 0 OR entry_type = 'entry_fee'",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_wallet_transactions_amount_nonzero",
        "wallet_transactions",
        type_="check",
    )
    op.create_check_constraint(
        "ck_wallet_transactions_amount_nonzero",
        "wallet_transactions",
        "amount_etb <> 0",
    )
