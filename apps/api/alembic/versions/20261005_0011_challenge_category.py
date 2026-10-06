"""Add category column to challenges table.

Revision ID: 20261005_0011
Revises: 20261005_0010
Create Date: 2026-10-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261005_0011"
down_revision: str | None = "20261005_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("challenges", sa.Column("category", sa.String(length=50), nullable=True))
    op.create_index("ix_challenges_category", "challenges", ["category"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_challenges_category", table_name="challenges")
    op.drop_column("challenges", "category")
