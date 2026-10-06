"""Referral endpoints for viewing stats, referral links, and applying codes."""

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.referral import (
    ApplyReferralRequest,
    ApplyReferralResponse,
    ReferralSummary,
)
from app.services.referrals import ReferralService

router = APIRouter(prefix="/referrals", tags=["referrals"])


@router.get(
    "/me",
    response_model=ReferralSummary,
    summary="Get the current user's referral stats, links, and recent invites",
)
async def my_referrals(user: CurrentUser, session: DbSession) -> ReferralSummary:
    return await ReferralService(session).get_referral_summary(user)


@router.post(
    "/apply",
    response_model=ApplyReferralResponse,
    summary="Manually apply a referral code from a friend",
)
async def apply_referral_code(
    body: ApplyReferralRequest,
    user: CurrentUser,
    session: DbSession,
) -> ApplyReferralResponse:
    _referral, referrer = await ReferralService(session).apply_code(user, body.code)
    inviter_name = (
        f"{referrer.first_name} (@{referrer.username})"
        if referrer.username
        else referrer.first_name
    )
    return ApplyReferralResponse(
        status="ok",
        message="Referral code applied successfully!",
        referrer_name=inviter_name,
    )
