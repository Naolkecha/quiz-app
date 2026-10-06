"""Store the Telebirr account players pay into.

Revision ID: 20261001_0007
Revises: 20261001_0006
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261001_0007"
down_revision: str | None = "20261001_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "payment_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("holder_name", sa.String(length=80), nullable=False),
        sa.Column("account_number", sa.String(length=20), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("id = 1", name="ck_payment_accounts_singleton"),
        sa.PrimaryKeyConstraint("id", name="pk_payment_accounts"),
    )
    op.execute(
        "INSERT INTO payment_accounts (id, holder_name, account_number) "
        "VALUES (1, 'Naol Kecha', '0972900847')"
    )


def downgrade() -> None:
    op.drop_table("payment_accounts")
