"""Create persistent challenge entries and backfill existing players.

Revision ID: 20261001_0003
Revises: 20261001_0002
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261001_0003"
down_revision: str | None = "20261001_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TERMS_VERSION = "2026-10-01"


def upgrade() -> None:
    op.create_table(
        "challenge_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("challenge_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("terms_version", sa.String(length=32), nullable=False),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["challenge_id"],
            ["challenges.id"],
            name="fk_challenge_entries_challenge_id_challenges",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_challenge_entries_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_challenge_entries"),
        sa.UniqueConstraint(
            "challenge_id",
            "user_id",
            name="uq_challenge_entries_challenge_user",
        ),
    )
    op.create_index(
        "ix_challenge_entries_challenge_id",
        "challenge_entries",
        ["challenge_id"],
    )
    op.execute(
        sa.text(
            """
            INSERT INTO challenge_entries
                (id, challenge_id, user_id, terms_version, joined_at)
            SELECT gen_random_uuid(), challenge_id, user_id, :terms_version, started_at
            FROM attempts
            ON CONFLICT (challenge_id, user_id) DO NOTHING
            """
        ).bindparams(terms_version=TERMS_VERSION)
    )


def downgrade() -> None:
    op.drop_index("ix_challenge_entries_challenge_id", table_name="challenge_entries")
    op.drop_table("challenge_entries")
