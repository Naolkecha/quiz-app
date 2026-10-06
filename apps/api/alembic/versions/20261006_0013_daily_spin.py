"""Create daily_spins and daily_spin_configs tables and add daily_spin ledger type.

Revision ID: 20261006_0013
Revises: 20261006_0012
Create Date: 2026-10-06
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261006_0013"
down_revision: str | None = "20261006_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_SEGMENTS = [
    {"id": 1, "label": "1.00 ETB", "amount_etb": "1.00", "weight": 25, "color": "#10b981"},
    {"id": 2, "label": "Try Again", "amount_etb": "0.00", "weight": 25, "color": "#94a3b8"},
    {"id": 3, "label": "0.50 ETB", "amount_etb": "0.50", "weight": 30, "color": "#38bdf8"},
    {"id": 4, "label": "2.00 ETB", "amount_etb": "2.00", "weight": 15, "color": "#f59e0b"},
    {"id": 5, "label": "Better Luck", "amount_etb": "0.00", "weight": 20, "color": "#cbd5e1"},
    {"id": 6, "label": "5.00 ETB", "amount_etb": "5.00", "weight": 5, "color": "#ec4899"},
    {"id": 7, "label": "10.00 ETB", "amount_etb": "10.00", "weight": 2, "color": "#8b5cf6"},
    {"id": 8, "label": "0.50 ETB", "amount_etb": "0.50", "weight": 30, "color": "#06b6d4"},
]


def upgrade() -> None:
    # 1. Update wallet_transactions entry_type check constraint to include 'daily_spin'
    op.drop_constraint(
        "ck_wallet_transactions_entry_type_known",
        "wallet_transactions",
        type_="check",
    )
    op.create_check_constraint(
        "ck_wallet_transactions_entry_type_known",
        "wallet_transactions",
        "entry_type IN ('deposit', 'withdrawal_hold', 'withdrawal_release', "
        "'prize', 'entry_fee', 'adjustment', 'referral', 'daily_spin')",
    )

    # 2. Create daily_spin_configs table
    op.create_table(
        "daily_spin_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("cooldown_hours", sa.Integer(), server_default=sa.text("24"), nullable=False),
        sa.Column("segments", sa.JSON(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("id = 1", name="ck_daily_spin_configs_singleton"),
        sa.PrimaryKeyConstraint("id", name="pk_daily_spin_configs"),
    )

    default_json = json.dumps(DEFAULT_SEGMENTS)
    op.execute(
        f"INSERT INTO daily_spin_configs (id, is_enabled, cooldown_hours, segments) "
        f"VALUES (1, true, 24, '{default_json}') "
        f"ON CONFLICT (id) DO NOTHING"
    )

    # 3. Create daily_spins table
    op.create_table(
        "daily_spins",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.Column("segment_label", sa.String(length=64), nullable=False),
        sa.Column(
            "prize_amount_etb",
            sa.Numeric(precision=12, scale=2),
            server_default=sa.text("0.00"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_daily_spins_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_daily_spins"),
    )
    op.create_index("ix_daily_spins_user_id", "daily_spins", ["user_id"])
    op.create_index("ix_daily_spins_created_at", "daily_spins", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_daily_spins_created_at", table_name="daily_spins")
    op.drop_index("ix_daily_spins_user_id", table_name="daily_spins")
    op.drop_table("daily_spins")
    op.drop_table("daily_spin_configs")

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
