"""Referral persistence and query operations."""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.referral import Referral, ReferralConfig
from app.models.user import User


class ReferralRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_config(self) -> ReferralConfig | None:
        """Fetch the admin-configured referral settings (singleton row id=1)."""
        return await self.session.get(ReferralConfig, 1)

    async def get_or_create_config(
        self,
        default_amount: Decimal = Decimal("1.00"),
    ) -> ReferralConfig:
        config = await self.session.get(ReferralConfig, 1)
        if config is None:
            config = ReferralConfig(id=1, reward_amount_etb=default_amount)
            self.session.add(config)
            await self.session.flush()
        return config

    async def update_reward_amount(self, amount: Decimal) -> ReferralConfig:
        config = await self.get_or_create_config(default_amount=amount)
        config.reward_amount_etb = amount
        await self.session.commit()
        await self.session.refresh(config)
        return config

    async def create(
        self,
        *,
        referrer_id: UUID,
        referred_id: UUID,
        reward_amount: Decimal = Decimal("1.00"),
    ) -> Referral:
        referral = Referral(
            referrer_id=referrer_id,
            referred_id=referred_id,
            reward_amount_etb=reward_amount,
            is_rewarded=False,
        )
        self.session.add(referral)
        await self.session.flush()
        return referral

    async def get_by_referred_id(self, referred_id: UUID) -> Referral | None:
        stmt = select(Referral).where(Referral.referred_id == referred_id)
        return await self.session.scalar(stmt)

    async def lock_by_referred_id(self, referred_id: UUID) -> Referral | None:
        stmt = select(Referral).where(Referral.referred_id == referred_id).with_for_update()
        return await self.session.scalar(stmt)

    async def get_referrer_by_code(self, raw_code: str) -> User | None:
        code = raw_code.strip()
        if code.lower().startswith("ref_"):
            code = code[4:].strip()
        elif code.lower().startswith("r_"):
            code = code[2:].strip()

        if not code:
            return None

        # 1. Telegram ID (most common: /start ref_123456789)
        if code.isdigit():
            try:
                tg_id = int(code)
                user = await self.session.scalar(select(User).where(User.telegram_id == tg_id))
                if user is not None:
                    return user
            except (ValueError, OverflowError):
                pass

        # 2. UUID string
        try:
            user_uuid = UUID(code)
            user = await self.session.get(User, user_uuid)
            if user is not None:
                return user
        except (ValueError, AttributeError):
            pass

        # 3. Username (@username or username)
        clean_username = code.lstrip("@")
        stmt = select(User).where(func.lower(User.username) == clean_username.lower())
        return await self.session.scalar(stmt)

    async def stats_by_referrer(self, referrer_id: UUID) -> tuple[int, int, Decimal]:
        """Returns (total_referrals, rewarded_referrals, total_earned_etb).

        Counts unique referred users only.
        """
        total = await self.session.scalar(
            select(func.count(func.distinct(Referral.referred_id))).where(
                Referral.referrer_id == referrer_id
            )
        )
        rewarded = await self.session.scalar(
            select(func.count(func.distinct(Referral.referred_id))).where(
                Referral.referrer_id == referrer_id, Referral.is_rewarded.is_(True)
            )
        )
        earned = await self.session.scalar(
            select(func.coalesce(func.sum(Referral.reward_amount_etb), Decimal("0"))).where(
                Referral.referrer_id == referrer_id, Referral.is_rewarded.is_(True)
            )
        )
        return int(total or 0), int(rewarded or 0), Decimal(earned or 0)

    async def list_by_referrer(
        self,
        referrer_id: UUID,
        *,
        limit: int = 50,
    ) -> list[tuple[Referral, User]]:
        stmt = (
            select(Referral, User)
            .join(User, User.id == Referral.referred_id)
            .where(Referral.referrer_id == referrer_id)
            .order_by(Referral.created_at.desc())
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).all()
        return [(ref, user) for ref, user in rows]
