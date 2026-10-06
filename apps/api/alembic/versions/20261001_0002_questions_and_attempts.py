"""Create questions, choices, attempts, and answers.

Revision ID: 20261001_0002
Revises: 20260930_0001
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261001_0002"
down_revision: str | None = "20260930_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "questions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("challenge_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.CheckConstraint("position > 0", name="ck_questions_position_positive"),
        sa.ForeignKeyConstraint(
            ["challenge_id"],
            ["challenges.id"],
            name="fk_questions_challenge_id_challenges",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_questions"),
        sa.UniqueConstraint(
            "challenge_id",
            "position",
            name="uq_questions_challenge_position",
        ),
    )
    op.create_index("ix_questions_challenge_id", "questions", ["challenge_id"])
    op.create_table(
        "choices",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.CheckConstraint("position > 0", name="ck_choices_position_positive"),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["questions.id"],
            name="fk_choices_question_id_questions",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_choices"),
        sa.UniqueConstraint("question_id", "position", name="uq_choices_question_position"),
    )
    op.create_index("ix_choices_question_id", "choices", ["question_id"])
    op.create_table(
        "attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("challenge_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("elapsed_ms", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "status IN ('in_progress', 'finished')",
            name="ck_attempts_status_known",
        ),
        sa.CheckConstraint("score IS NULL OR score >= 0", name="ck_attempts_score_nonnegative"),
        sa.CheckConstraint(
            "elapsed_ms IS NULL OR elapsed_ms >= 0",
            name="ck_attempts_elapsed_nonnegative",
        ),
        sa.ForeignKeyConstraint(
            ["challenge_id"],
            ["challenges.id"],
            name="fk_attempts_challenge_id_challenges",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_attempts_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_attempts"),
        sa.UniqueConstraint("challenge_id", "user_id", name="uq_attempts_challenge_user"),
    )
    op.create_table(
        "attempt_answers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attempt_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("choice_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["attempts.id"],
            name="fk_attempt_answers_attempt_id_attempts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["questions.id"],
            name="fk_attempt_answers_question_id_questions",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["choice_id"],
            ["choices.id"],
            name="fk_attempt_answers_choice_id_choices",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_attempt_answers"),
        sa.UniqueConstraint(
            "attempt_id",
            "question_id",
            name="uq_attempt_answers_attempt_question",
        ),
    )


def downgrade() -> None:
    op.drop_table("attempt_answers")
    op.drop_table("attempts")
    op.drop_index("ix_choices_question_id", table_name="choices")
    op.drop_table("choices")
    op.drop_index("ix_questions_challenge_id", table_name="questions")
    op.drop_table("questions")
