"""Add invited_username and is_public to duels table.

Revision ID: 20261007_0015
Revises: 20261007_0014
Create Date: 2026-10-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261007_0015"
down_revision: str | None = "20261007_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("duels", sa.Column("invited_username", sa.String(128), nullable=True))
    op.add_column("duels", sa.Column("invited_usernames", sa.JSON(), server_default=sa.text("'[]'::jsonb"), nullable=False))
    op.add_column("duels", sa.Column("is_public", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.create_index("idx_duels_invited_username", "duels", [sa.text("LOWER(invited_username)")])


def downgrade() -> None:
    op.drop_index("idx_duels_invited_username", table_name="duels")
    op.drop_column("duels", "is_public")
    op.drop_column("duels", "invited_usernames")
    op.drop_column("duels", "invited_username")
