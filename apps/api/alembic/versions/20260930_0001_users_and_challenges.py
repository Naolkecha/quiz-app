"""Create users and challenges.

Revision ID: 20260930_0001
Revises:
Create Date: 2026-09-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260930_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("username", sa.String(length=32), nullable=True),
        sa.Column("first_name", sa.String(length=64), nullable=False),
        sa.Column("last_name", sa.String(length=64), nullable=True),
        sa.Column("photo_url", sa.String(length=1024), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("is_blocked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("telegram_id", name="uq_users_telegram_id"),
    )
    op.create_table(
        "challenges",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "entry_fee_etb",
            sa.Numeric(precision=12, scale=2),
            server_default=sa.text("20"),
            nullable=False,
        ),
        sa.Column(
            "minimum_participants",
            sa.Integer(),
            server_default=sa.text("100"),
            nullable=False,
        ),
        sa.Column(
            "base_prize_etb",
            sa.Numeric(precision=12, scale=2),
            server_default=sa.text("1000"),
            nullable=False,
        ),
        sa.Column(
            "extra_prize_per_participant_etb",
            sa.Numeric(precision=12, scale=2),
            server_default=sa.text("10"),
            nullable=False,
        ),
        sa.Column("question_count", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("registration_opens_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("registration_closes_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            sa.String(length=32),
            server_default=sa.text("'draft'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("entry_fee_etb >= 0", name="ck_challenges_entry_fee_nonnegative"),
        sa.CheckConstraint(
            "minimum_participants > 0",
            name="ck_challenges_minimum_participants_positive",
        ),
        sa.CheckConstraint("base_prize_etb >= 0", name="ck_challenges_base_prize_nonnegative"),
        sa.CheckConstraint(
            "extra_prize_per_participant_etb >= 0",
            name="ck_challenges_extra_prize_nonnegative",
        ),
        sa.CheckConstraint("question_count > 0", name="ck_challenges_question_count_positive"),
        sa.CheckConstraint("duration_seconds > 0", name="ck_challenges_duration_positive"),
        sa.CheckConstraint(
            "registration_closes_at IS NULL OR registration_opens_at IS NULL "
            "OR registration_closes_at >= registration_opens_at",
            name="ck_challenges_registration_window_ordered",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'registration', 'ready', 'live', 'completed', 'cancelled')",
            name="ck_challenges_status_known",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_challenges"),
    )
    op.create_index("ix_challenges_starts_at", "challenges", ["starts_at"])
    op.create_index("ix_challenges_status", "challenges", ["status"])


def downgrade() -> None:
    op.drop_index("ix_challenges_status", table_name="challenges")
    op.drop_index("ix_challenges_starts_at", table_name="challenges")
    op.drop_table("challenges")
    op.drop_table("users")
