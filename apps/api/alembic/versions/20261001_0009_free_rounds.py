"""Free rounds: a player cap, the winner, and when the prize was paid.

Revision ID: 20261001_0009
Revises: 20261001_0008
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261001_0009"
down_revision: str | None = "20261001_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("challenges", sa.Column("max_participants", sa.Integer(), nullable=True))
    op.add_column("challenges", sa.Column("winner_user_id", sa.Uuid(), nullable=True))
    op.add_column(
        "challenges",
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_challenges_winner_user_id_users",
        "challenges",
        "users",
        ["winner_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_challenges_max_participants_positive",
        "challenges",
        "max_participants IS NULL OR max_participants > 0",
    )


def downgrade() -> None:
    op.drop_constraint("ck_challenges_max_participants_positive", "challenges", type_="check")
    op.drop_constraint("fk_challenges_winner_user_id_users", "challenges", type_="foreignkey")
    op.drop_column("challenges", "settled_at")
    op.drop_column("challenges", "winner_user_id")
    op.drop_column("challenges", "max_participants")
