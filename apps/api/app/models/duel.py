"""1v1 Fast Duel match model."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class DuelStatus(enum.StrEnum):
    WAITING_OPPONENT = "waiting_opponent"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class Duel(Base):
    __tablename__ = "duels"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    opponent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    stake_etb: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    prize_etb: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    platform_fee_etb: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    category: Mapped[str] = mapped_column(String(64), default="general", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=DuelStatus.WAITING_OPPONENT, index=True, nullable=False)
    questions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)

    creator_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    creator_time_seconds: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    creator_answers: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    creator_finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    opponent_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    opponent_time_seconds: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    opponent_answers: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    opponent_finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    winner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_tie: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    creator: Mapped["User"] = relationship("User", foreign_keys=[creator_id], lazy="selectin")  # type: ignore # noqa: F821
    opponent: Mapped["User | None"] = relationship("User", foreign_keys=[opponent_id], lazy="selectin")  # type: ignore # noqa: F821
    winner: Mapped["User | None"] = relationship("User", foreign_keys=[winner_id], lazy="selectin")  # type: ignore # noqa: F821
