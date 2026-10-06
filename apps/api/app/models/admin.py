"""Telegram usernames allowed to manage Challenge."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AdminRole(enum.StrEnum):
    OWNER = "owner"
    ADMIN = "admin"


class AdminAccount(Base):
    __tablename__ = "admins"
    __table_args__ = (CheckConstraint("role IN ('owner', 'admin')", name="role_known"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    role: Mapped[AdminRole] = mapped_column(
        Enum(
            AdminRole,
            name="admin_role",
            native_enum=False,
            length=16,
            values_callable=lambda members: [member.value for member in members],
            create_constraint=False,
        ),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
