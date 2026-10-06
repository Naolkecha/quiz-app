"""Schemas for daily spin requests and responses."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class SpinSegment(BaseModel):
    id: int
    label: str
    amount_etb: Decimal = Field(default=Decimal("0.00"), ge=0)
    weight: int = Field(default=10, ge=1)
    color: str | None = None


class SpinStatusResponse(BaseModel):
    is_enabled: bool
    can_spin: bool
    cooldown_hours: int
    seconds_remaining: int
    next_spin_at: datetime | None = None
    segments: list[SpinSegment] = []
    last_spin_at: datetime | None = None


class SpinResultResponse(BaseModel):
    spin_id: UUID
    segment_index: int
    segment_label: str
    prize_amount_etb: Decimal
    balance_after_etb: Decimal
    next_spin_at: datetime


class AdminSpinConfigUpdate(BaseModel):
    is_enabled: bool
    cooldown_hours: int = Field(default=24, ge=1, le=168)
    segments: list[SpinSegment] = Field(min_length=2)


class AdminSpinOverview(BaseModel):
    is_enabled: bool
    cooldown_hours: int
    total_spins: int
    spins_today: int
    total_payout_etb: Decimal
    segments: list[SpinSegment]


class UserSpinHistoryItem(BaseModel):
    id: UUID
    segment_label: str
    prize_amount_etb: Decimal
    created_at: datetime
