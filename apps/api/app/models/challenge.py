"""A timed skill competition and its published economics."""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ChallengeStatus(enum.StrEnum):
    DRAFT = "draft"
    REGISTRATION = "registration"
    READY = "ready"
    LIVE = "live"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


PUBLIC_STATUSES = (
    ChallengeStatus.REGISTRATION,
    ChallengeStatus.READY,
    ChallengeStatus.LIVE,
    ChallengeStatus.COMPLETED,
)


class Challenge(Base):
    __tablename__ = "challenges"
    __table_args__ = (
        CheckConstraint("entry_fee_etb >= 0", name="entry_fee_nonnegative"),
        CheckConstraint("minimum_participants > 0", name="minimum_participants_positive"),
        CheckConstraint("base_prize_etb >= 0", name="base_prize_nonnegative"),
        CheckConstraint(
            "extra_prize_per_participant_etb >= 0",
            name="extra_prize_nonnegative",
        ),
        CheckConstraint("question_count > 0", name="question_count_positive"),
        CheckConstraint("duration_seconds > 0", name="duration_positive"),
        CheckConstraint(
            "max_participants IS NULL OR max_participants > 0",
            name="max_participants_positive",
        ),
        CheckConstraint(
            "registration_closes_at IS NULL OR registration_opens_at IS NULL "
            "OR registration_closes_at >= registration_opens_at",
            name="registration_window_ordered",
        ),
        CheckConstraint(
            "status IN ('draft', 'registration', 'ready', 'live', 'completed', 'cancelled')",
            name="status_known",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    entry_fee_etb: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("20"),
        server_default=text("20"),
    )
    minimum_participants: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=100,
        server_default=text("100"),
    )
    base_prize_etb: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("1000"),
        server_default=text("1000"),
    )
    extra_prize_per_participant_etb: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("10"),
        server_default=text("10"),
    )
    question_count: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    # Set only on free rounds: the round closes when this many players join.
    max_participants: Mapped[int | None] = mapped_column(Integer)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    winner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registration_opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registration_closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        index=True,
    )
    status: Mapped[ChallengeStatus] = mapped_column(
        Enum(
            ChallengeStatus,
            name="challenge_status",
            native_enum=False,
            length=32,
            values_callable=lambda members: [member.value for member in members],
            create_constraint=False,
        ),
        nullable=False,
        default=ChallengeStatus.DRAFT,
        server_default=text("'draft'"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
