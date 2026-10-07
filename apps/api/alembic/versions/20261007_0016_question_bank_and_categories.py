"""Question categories and question bank for fast duels.

Revision ID: 20261007_0016
Revises: 20261007_0015
Create Date: 2026-10-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261007_0016"
down_revision: str | None = "20261007_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create question_categories table
    op.create_table(
        "question_categories",
        sa.Column("id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("icon", sa.String(16), server_default="🎯", nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_question_categories"),
    )

    # 2. Alter questions table to support standalone question bank
    op.alter_column("questions", "challenge_id", nullable=True)
    op.alter_column("questions", "position", nullable=True)

    # Relax check constraint on position so null is permitted for bank questions
    op.execute("ALTER TABLE questions DROP CONSTRAINT IF EXISTS ck_questions_ck_questions_position_positive")
    op.execute("ALTER TABLE questions DROP CONSTRAINT IF EXISTS ck_questions_position_positive")
    op.create_check_constraint(
        "ck_questions_position_positive",
        "questions",
        "position IS NULL OR position > 0",
    )

    # Unique constraint should only enforce (challenge_id, position) when challenge_id is NOT NULL
    op.drop_constraint("uq_questions_challenge_position", "questions", type_="unique")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_questions_challenge_position "
        "ON questions (challenge_id, position) WHERE challenge_id IS NOT NULL"
    )

    # Add category and created_at columns to questions
    op.add_column(
        "questions",
        sa.Column(
            "category",
            sa.String(64),
            sa.ForeignKey("question_categories.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_questions_category", "questions", ["category"])
    op.add_column(
        "questions",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # 3. Seed default question categories
    op.execute(
        """
        INSERT INTO question_categories (id, name, icon, description, is_active)
        VALUES
            ('general', 'General Knowledge', '🧠', 'All-around trivia, pop facts, and general knowledge.', true),
            ('football', 'Football Mania', '⚽', 'Soccer leagues, world cups, legends, and records.', true),
            ('history', 'History & Culture', '🏛️', 'World & Ethiopian historical events, monuments, and culture.', true),
            ('science', 'Science & Tech', '🔬', 'Physics, biology, space, gadgets, and tech trivia.', true),
            ('geography', 'Geography', '🌍', 'Countries, capitals, mountains, rivers, and flags.', true)
        ON CONFLICT (id) DO NOTHING;
        """
    )

    # 4. Backfill existing questions to 'general' category
    op.execute("UPDATE questions SET category = 'general' WHERE category IS NULL")


def downgrade() -> None:
    op.drop_index("ix_questions_category", table_name="questions")
    op.drop_column("questions", "created_at")
    op.drop_column("questions", "category")
    op.execute("DROP INDEX IF EXISTS uq_questions_challenge_position")
    op.create_unique_constraint("uq_questions_challenge_position", "questions", ["challenge_id", "position"])
    op.drop_table("question_categories")
