"""Seed Telegram admins. @jiillicha is the main admin.

Revision ID: 20261001_0008
Revises: 20261001_0007
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261001_0008"
down_revision: str | None = "20261001_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "admins",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.String(length=32), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("role IN ('owner', 'admin')", name="ck_admins_role_known"),
        sa.PrimaryKeyConstraint("id", name="pk_admins"),
        sa.UniqueConstraint("username", name="uq_admins_username"),
    )
    op.execute(
        "INSERT INTO admins (id, username, role) "
        "VALUES ('6d1c0b2e-7a4f-4c1d-9b8e-2f5a1c0d7e11', 'jiillicha', 'owner')"
    )


def downgrade() -> None:
    op.drop_table("admins")
