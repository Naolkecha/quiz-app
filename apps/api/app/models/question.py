"""Questions and question categories. The correct choice stays on the server."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class QuestionCategory(Base):
    __tablename__ = "question_categories"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    icon: Mapped[str] = mapped_column(String(16), default="🎯", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    questions: Mapped[list[Question]] = relationship(back_populates="category_rel")


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        CheckConstraint("position IS NULL OR position > 0", name="position_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    challenge_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("challenges.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    category: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("question_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    choices: Mapped[list["Choice"]] = relationship(
        back_populates="question",
        order_by="Choice.position",
        cascade="all, delete-orphan",
    )
    category_rel: Mapped[QuestionCategory | None] = relationship(back_populates="questions")


class Choice(Base):
    __tablename__ = "choices"
    __table_args__ = (
        CheckConstraint("position > 0", name="choice_position_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    question: Mapped[Question] = relationship(back_populates="choices")
