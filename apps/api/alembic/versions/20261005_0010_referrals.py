"""Referrals tracking and referral wallet ledger entry type.

Revision ID: 20261005_0010
Revises: 20261001_0009
Create Date: 2026-10-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261005_0010"
down_revision: str | None = "20261001_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "referrals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("referrer_id", sa.Uuid(), nullable=False),
        sa.Column("referred_id", sa.Uuid(), nullable=False),
        sa.Column(
            "reward_amount_etb",
            sa.Numeric(precision=12, scale=2),
            server_default="5.00",
            nullable=False,
        ),
        sa.Column(
            "is_rewarded",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("rewarded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["referred_id"],
            ["users.id"],
            name="fk_referrals_referred_id_users",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["referrer_id"],
            ["users.id"],
            name="fk_referrals_referrer_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_referrals"),
        sa.UniqueConstraint("referred_id", name="uq_referrals_referred_id"),
    )
    op.create_index("ix_referrals_referrer_id", "referrals", ["referrer_id"])

    op.drop_constraint(
        "ck_wallet_transactions_entry_type_known",
        "wallet_transactions",
        type_="check",
    )
    op.create_check_constraint(
        "ck_wallet_transactions_entry_type_known",
        "wallet_transactions",
        "entry_type IN ('deposit', 'withdrawal_hold', 'withdrawal_release', "
        "'prize', 'entry_fee', 'adjustment', 'referral')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_wallet_transactions_entry_type_known",
        "wallet_transactions",
        type_="check",
    )
    op.create_check_constraint(
        "ck_wallet_transactions_entry_type_known",
        "wallet_transactions",
        "entry_type IN ('deposit', 'withdrawal_hold', 'withdrawal_release', "
        "'prize', 'entry_fee', 'adjustment')",
    )
    op.drop_index("ix_referrals_referrer_id", table_name="referrals")
    op.drop_table("referrals")
