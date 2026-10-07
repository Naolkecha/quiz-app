"""Create duels table for 1v1 Fast Duel matches.

Revision ID: 20261007_0014
Revises: 20261006_0013
Create Date: 2026-10-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261007_0014"
down_revision: str | None = "20261006_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "duels",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("creator_id", sa.Uuid(), nullable=False),
        sa.Column("opponent_id", sa.Uuid(), nullable=True),
        sa.Column("stake_etb", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("prize_etb", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("platform_fee_etb", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("category", sa.String(64), server_default="general", nullable=False),
        sa.Column("status", sa.String(32), server_default="waiting_opponent", nullable=False),
        sa.Column("questions", sa.JSON(), nullable=False),
        sa.Column("creator_score", sa.Integer(), nullable=True),
        sa.Column("creator_time_seconds", sa.Numeric(6, 2), nullable=True),
        sa.Column("creator_answers", sa.JSON(), nullable=True),
        sa.Column("creator_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("opponent_score", sa.Integer(), nullable=True),
        sa.Column("opponent_time_seconds", sa.Numeric(6, 2), nullable=True),
        sa.Column("opponent_answers", sa.JSON(), nullable=True),
        sa.Column("opponent_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("winner_id", sa.Uuid(), nullable=True),
        sa.Column("is_tie", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["creator_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["opponent_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["winner_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_duels_status", "duels", ["status"])
    op.create_index("idx_duels_creator_id", "duels", ["creator_id"])
    op.create_index("idx_duels_opponent_id", "duels", ["opponent_id"])


def downgrade() -> None:
    op.drop_index("idx_duels_opponent_id", table_name="duels")
    op.drop_index("idx_duels_creator_id", table_name="duels")
    op.drop_index("idx_duels_status", table_name="duels")
    op.drop_table("duels")
