"""Business logic for daily lucky wheel spins, wallet prize crediting, and admin configuration."""

import logging
import random
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.daily_spin import DailySpinConfig
from app.models.user import User
from app.repositories.daily_spin import DailySpinRepository
from app.schemas.daily_spin import (
    AdminSpinConfigUpdate,
    AdminSpinOverview,
    SpinResultResponse,
    SpinSegment,
    SpinStatusResponse,
    UserSpinHistoryItem,
)
from app.services.wallets import WalletService

logger = logging.getLogger(__name__)


class DailySpinService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = DailySpinRepository(session)
        self.wallets = WalletService(session)

    async def get_status(self, user: User) -> SpinStatusResponse:
        """Return user's spin readiness, countdown, and active wheel segments."""
        config = await self.repo.get_config()
        last_spin = await self.repo.get_last_spin(user.id)
        now = datetime.now(UTC)

        cooldown = timedelta(hours=config.cooldown_hours)
        can_spin = config.is_enabled
        seconds_remaining = 0
        next_spin_at = None

        if last_spin is not None:
            spin_time = last_spin.created_at
            if spin_time.tzinfo is None:
                spin_time = spin_time.replace(tzinfo=UTC)
            eligible_at = spin_time + cooldown
            if now < eligible_at:
                can_spin = False
                seconds_remaining = max(0, int((eligible_at - now).total_seconds()))
                next_spin_at = eligible_at

        segments = [
            SpinSegment(
                id=int(s.get("id", i + 1)),
                label=str(s.get("label", "")),
                amount_etb=Decimal(str(s.get("amount_etb", "0.00"))),
                weight=int(s.get("weight", 10)),
                color=s.get("color"),
            )
            for i, s in enumerate(config.segments)
        ]

        return SpinStatusResponse(
            is_enabled=config.is_enabled,
            can_spin=can_spin,
            cooldown_hours=config.cooldown_hours,
            seconds_remaining=seconds_remaining,
            next_spin_at=next_spin_at,
            segments=segments,
            last_spin_at=last_spin.created_at if last_spin else None,
        )

    async def spin(self, user: User) -> SpinResultResponse:
        """Perform a daily lucky wheel spin and award any cash prize directly to the user's wallet."""
        if user.is_blocked:
            raise AppError(code="user_blocked", message="Your account is blocked.", status_code=403)

        config = await self.repo.get_config()
        if not config.is_enabled:
            raise AppError(
                code="spin_disabled",
                message="Daily spin is currently unavailable. Please check back later.",
                status_code=400,
            )

        now = datetime.now(UTC)
        cooldown = timedelta(hours=config.cooldown_hours)

        # Check last spin cooldown
        last_spin = await self.repo.get_last_spin(user.id)
        if last_spin is not None:
            spin_time = last_spin.created_at
            if spin_time.tzinfo is None:
                spin_time = spin_time.replace(tzinfo=UTC)
            eligible_at = spin_time + cooldown
            if now < eligible_at:
                remaining_sec = max(0, int((eligible_at - now).total_seconds()))
                hours = remaining_sec // 3600
                minutes = (remaining_sec % 3600) // 60
                raise AppError(
                    code="already_spun",
                    message=f"You already claimed your daily spin. Next spin available in {hours}h {minutes}m.",
                    status_code=429,
                )

        raw_segments = config.segments
        if not raw_segments:
            raise AppError(code="no_segments", message="Daily spin wheel is not configured.", status_code=500)

        # Weighted random selection based on segment weights
        weights = [max(1, int(s.get("weight", 10))) for s in raw_segments]
        winning_index = random.choices(range(len(raw_segments)), weights=weights, k=1)[0]
        chosen = raw_segments[winning_index]

        prize_amount = Decimal(str(chosen.get("amount_etb", "0.00")))
        label = str(chosen.get("label", "Prize"))

        # Save spin entry
        spin = await self.repo.create_spin(
            user_id=user.id,
            segment_index=winning_index,
            segment_label=label,
            prize_amount_etb=prize_amount,
        )

        # If ETB prize won, credit wallet
        if prize_amount > Decimal("0"):
            await self.wallets.award_daily_spin(
                user.id,
                spin_id=spin.id,
                amount=prize_amount,
                label=label,
            )

        await self.session.commit()
        await self.session.refresh(spin)

        # Get updated wallet balance
        wallet = await self.wallets.wallets.get_or_create(user.id)
        next_spin_at = now + cooldown

        logger.info(
            "daily spin completed: user=%s index=%s label=%s prize=%s",
            user.id,
            winning_index,
            label,
            prize_amount,
        )

        return SpinResultResponse(
            spin_id=spin.id,
            segment_index=winning_index,
            segment_label=label,
            prize_amount_etb=prize_amount,
            balance_after_etb=wallet.balance_etb,
            next_spin_at=next_spin_at,
        )

    async def history(self, user: User, limit: int = 15) -> list[UserSpinHistoryItem]:
        """List user's past spin results."""
        rows = await self.repo.list_user_spins(user.id, limit=limit)
        return [
            UserSpinHistoryItem(
                id=r.id,
                segment_label=r.segment_label,
                prize_amount_etb=r.prize_amount_etb,
                created_at=r.created_at,
            )
            for r in rows
        ]

    async def admin_overview(self) -> AdminSpinOverview:
        """Return admin view with configuration and all-time stats."""
        config = await self.repo.get_config()
        total_spins, spins_today, total_payout = await self.repo.overview_stats()
        segments = [
            SpinSegment(
                id=int(s.get("id", i + 1)),
                label=str(s.get("label", "")),
                amount_etb=Decimal(str(s.get("amount_etb", "0.00"))),
                weight=int(s.get("weight", 10)),
                color=s.get("color"),
            )
            for i, s in enumerate(config.segments)
        ]
        return AdminSpinOverview(
            is_enabled=config.is_enabled,
            cooldown_hours=config.cooldown_hours,
            total_spins=total_spins,
            spins_today=spins_today,
            total_payout_etb=total_payout,
            segments=segments,
        )

    async def admin_update_config(self, body: AdminSpinConfigUpdate) -> AdminSpinOverview:
        """Update daily spin availability, cooldown, and prize segments."""
        raw_segments = [
            {
                "id": s.id,
                "label": s.label.strip(),
                "amount_etb": str(s.amount_etb),
                "weight": s.weight,
                "color": s.color,
            }
            for s in body.segments
        ]
        await self.repo.update_config(
            is_enabled=body.is_enabled,
            cooldown_hours=body.cooldown_hours,
            segments=raw_segments,
        )
        return await self.admin_overview()
