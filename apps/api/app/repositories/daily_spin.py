"""Persistence and database operations for daily spins and configuration."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily_spin import DailySpin, DailySpinConfig

DEFAULT_SEGMENTS: list[dict[str, Any]] = [
    {"id": 1, "label": "1.00 ETB", "amount_etb": "1.00", "weight": 25, "color": "#10b981"},
    {"id": 2, "label": "Try Again", "amount_etb": "0.00", "weight": 25, "color": "#94a3b8"},
    {"id": 3, "label": "0.50 ETB", "amount_etb": "0.50", "weight": 30, "color": "#38bdf8"},
    {"id": 4, "label": "2.00 ETB", "amount_etb": "2.00", "weight": 15, "color": "#f59e0b"},
    {"id": 5, "label": "Better Luck", "amount_etb": "0.00", "weight": 20, "color": "#cbd5e1"},
    {"id": 6, "label": "5.00 ETB", "amount_etb": "5.00", "weight": 5, "color": "#ec4899"},
    {"id": 7, "label": "10.00 ETB", "amount_etb": "10.00", "weight": 2, "color": "#8b5cf6"},
    {"id": 8, "label": "0.50 ETB", "amount_etb": "0.50", "weight": 30, "color": "#06b6d4"},
]


class DailySpinRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_config(self) -> DailySpinConfig:
        """Fetch the singleton config row (id=1) or create default if missing."""
        config = await self.session.get(DailySpinConfig, 1)
        if config is None:
            config = DailySpinConfig(
                id=1,
                is_enabled=True,
                cooldown_hours=24,
                segments=DEFAULT_SEGMENTS,
            )
            self.session.add(config)
            await self.session.flush()
        return config

    async def update_config(
        self,
        *,
        is_enabled: bool,
        cooldown_hours: int,
        segments: list[dict[str, Any]],
    ) -> DailySpinConfig:
        config = await self.get_config()
        config.is_enabled = is_enabled
        config.cooldown_hours = cooldown_hours
        config.segments = segments
        config.updated_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(config)
        return config

    async def get_last_spin(self, user_id: UUID) -> DailySpin | None:
        stmt = (
            select(DailySpin)
            .where(DailySpin.user_id == user_id)
            .order_by(DailySpin.created_at.desc())
            .limit(1)
        )
        return await self.session.scalar(stmt)

    async def create_spin(
        self,
        *,
        user_id: UUID,
        segment_index: int,
        segment_label: str,
        prize_amount_etb: Decimal,
    ) -> DailySpin:
        spin = DailySpin(
            user_id=user_id,
            segment_index=segment_index,
            segment_label=segment_label,
            prize_amount_etb=prize_amount_etb,
        )
        self.session.add(spin)
        await self.session.flush()
        return spin

    async def list_user_spins(self, user_id: UUID, limit: int = 15) -> list[DailySpin]:
        stmt = (
            select(DailySpin)
            .where(DailySpin.user_id == user_id)
            .order_by(DailySpin.created_at.desc())
            .limit(limit)
        )
        return list((await self.session.scalars(stmt)).all())

    async def overview_stats(self) -> tuple[int, int, Decimal]:
        """Returns (total_spins, spins_today, total_payout_etb)."""
        now = datetime.now(UTC)
        since_today = now.replace(hour=0, minute=0, second=0, microsecond=0)

        total_spins = await self.session.scalar(select(func.count()).select_from(DailySpin)) or 0
        spins_today = await self.session.scalar(
            select(func.count()).select_from(DailySpin).where(DailySpin.created_at >= since_today)
        ) or 0
        total_payout = await self.session.scalar(
            select(func.coalesce(func.sum(DailySpin.prize_amount_etb), Decimal("0")))
        ) or Decimal("0")

        return int(total_spins), int(spins_today), Decimal(total_payout)
