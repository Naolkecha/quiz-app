"""Create referral_configs table and update default referral reward to 1 ETB.

Revision ID: 20261006_0012
Revises: 20261005_0011
Create Date: 2026-10-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261006_0012"
down_revision: str | None = "20261005_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Update default referral reward in referrals table to 1.00 ETB
    op.alter_column(
        "referrals",
        "reward_amount_etb",
        server_default="1.00",
    )

    # Create singleton referral configuration table for admin settings
    op.create_table(
        "referral_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "reward_amount_etb",
            sa.Numeric(precision=12, scale=2),
            server_default="1.00",
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("id = 1", name="ck_referral_configs_singleton"),
        sa.PrimaryKeyConstraint("id", name="pk_referral_configs"),
    )

    op.execute(
        "INSERT INTO referral_configs (id, reward_amount_etb) VALUES (1, 1.00) "
        "ON CONFLICT (id) DO NOTHING"
    )


def downgrade() -> None:
    op.drop_table("referral_configs")
    op.alter_column(
        "referrals",
        "reward_amount_etb",
        server_default="5.00",
    )
