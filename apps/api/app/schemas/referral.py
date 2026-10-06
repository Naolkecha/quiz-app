"""Schemas for referral responses and inputs."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class ReferralItem(BaseModel):
    id: UUID
    referred_name: str
    referred_username: str | None
    reward_amount_etb: Decimal
    is_rewarded: bool
    created_at: datetime
    rewarded_at: datetime | None


class ReferralSummary(BaseModel):
    referral_code: str
    telegram_bot_url: str
    mini_app_url: str
    reward_per_referral_etb: Decimal
    total_referrals: int
    rewarded_referrals: int
    total_earned_etb: Decimal
    referred_by: str | None = None
    recent_referrals: list[ReferralItem] = []


class ApplyReferralRequest(BaseModel):
    code: str = Field(min_length=1, max_length=128)


class ApplyReferralResponse(BaseModel):
    status: str
    message: str
    referrer_name: str
