"""Referral service: link users, compute referral codes and links, and award bonuses."""

import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.exceptions import AppError, NotFoundError
from app.models.attempt import Attempt, AttemptStatus
from app.models.referral import Referral
from app.models.user import User
from app.repositories.referrals import ReferralRepository
from app.repositories.users import UserRepository
from app.schemas.referral import ReferralItem, ReferralSummary
from app.services.notify import TelegramNotifier
from app.services.wallets import WalletService

logger = logging.getLogger(__name__)

DEFAULT_REFERRAL_REWARD_ETB = Decimal("1.00")


class ReferralService:
    def __init__(self, session: AsyncSession, settings: Settings | None = None) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.referrals = ReferralRepository(session)
        self.users = UserRepository(session)
        self.wallets = WalletService(session, settings=self.settings)

    async def get_reward_amount(self) -> Decimal:
        """Get the current referral bonus per person decided by admins."""
        try:
            config = await self.referrals.get_config()
            if config is not None:
                return config.reward_amount_etb
        except Exception as exc:
            logger.warning("Could not load referral config from db: %s", exc)
        return DEFAULT_REFERRAL_REWARD_ETB

    async def register_referral(
        self,
        new_user: User,
        referral_code: str | None,
        *,
        reward_amount: Decimal | None = None,
    ) -> Referral | None:
        """Link a newly registered user to their referrer.

        Only counts new and unique users:
        - Must not be a self-referral
        - Must not be a circular referral
        - User must not have already played any challenges
        - User must not have been already referred
        """
        if not referral_code:
            return None

        referrer = await self.referrals.get_referrer_by_code(referral_code)
        if referrer is None:
            logger.info("referral code %s not found for user %s", referral_code, new_user.id)
            return None

        if referrer.id == new_user.id:
            logger.info("user %s attempted to refer themselves", new_user.id)
            return None

        # Check uniqueness: user can only be referred once
        existing = await self.referrals.get_by_referred_id(new_user.id)
        if existing is not None:
            return existing

        # Circular referral check: referrer must not have been referred by this user
        circular = await self.referrals.get_by_referred_id(referrer.id)
        if circular is not None and circular.referrer_id == new_user.id:
            logger.info("circular referral attempt between %s and %s", new_user.id, referrer.id)
            return None

        # New user check: user must not have played challenges already
        has_attempts = await self.session.scalar(
            select(func.count()).select_from(Attempt).where(Attempt.user_id == new_user.id)
        )
        if has_attempts and has_attempts > 0:
            logger.info("user %s is not new (has %s attempts)", new_user.id, has_attempts)
            return None

        if reward_amount is None:
            reward_amount = await self.get_reward_amount()

        referral = await self.referrals.create(
            referrer_id=referrer.id,
            referred_id=new_user.id,
            reward_amount=reward_amount,
        )
        logger.info(
            "referral registered: referrer=%s (%s) referred=%s (%s) amount=%s",
            referrer.id,
            referrer.telegram_id,
            new_user.id,
            new_user.telegram_id,
            reward_amount,
        )
        return referral

    async def apply_code(self, user: User, code: str) -> tuple[Referral, User]:
        """Manually apply a referral code for a new user."""
        existing = await self.referrals.get_by_referred_id(user.id)
        if existing is not None:
            raise AppError(
                code="already_referred",
                message="You have already applied a referral code.",
                status_code=409,
            )

        # Only new players before playing their first challenge can apply a code
        has_attempts = await self.session.scalar(
            select(func.count()).select_from(Attempt).where(Attempt.user_id == user.id)
        )
        if has_attempts and has_attempts > 0:
            raise AppError(
                code="not_new_user",
                message=(
                    "Referral codes can only be applied by new players "
                    "before playing their first challenge."
                ),
                status_code=400,
            )

        # Account must be newly created (within 48 hours)
        if user.created_at and (datetime.now(UTC) - user.created_at) > timedelta(hours=48):
            raise AppError(
                code="not_new_user",
                message=(
                    "Referral codes can only be applied by new accounts within 48 hours of joining."
                ),
                status_code=400,
            )

        referrer = await self.referrals.get_referrer_by_code(code)
        if referrer is None:
            raise NotFoundError("Invalid referral code. No player found with that code.")

        if referrer.id == user.id:
            raise AppError(
                code="cannot_refer_self",
                message="You cannot use your own referral code.",
                status_code=422,
            )

        # Prevent circular referrals
        circular = await self.referrals.get_by_referred_id(referrer.id)
        if circular is not None and circular.referrer_id == user.id:
            raise AppError(
                code="circular_referral",
                message="You cannot use a referral code from someone you invited.",
                status_code=422,
            )

        reward_amount = await self.get_reward_amount()
        referral = await self.referrals.create(
            referrer_id=referrer.id,
            referred_id=user.id,
            reward_amount=reward_amount,
        )
        await self.session.commit()
        await self.session.refresh(referral)
        return referral, referrer

    async def reward_referrer_if_eligible(self, referred_user_id: UUID) -> Referral | None:
        """Check if this user was referred and hasn't triggered the reward yet.

        Called when the user finishes their first challenge.
        """
        referral = await self.referrals.lock_by_referred_id(referred_user_id)
        if referral is None or referral.is_rewarded:
            return None

        referrer = await self.users.get(referral.referrer_id)
        referred = await self.users.get(referral.referred_id)
        if referrer is None or referred is None or referrer.is_blocked:
            return None

        # Verify that this was their very first finished challenge
        finished_attempts_count = await self.session.scalar(
            select(func.count())
            .select_from(Attempt)
            .where(
                Attempt.user_id == referred_user_id,
                Attempt.status == AttemptStatus.FINISHED,
            )
        )
        if finished_attempts_count and finished_attempts_count > 1:
            referral.is_rewarded = True
            referral.rewarded_at = datetime.now(UTC)
            return None

        # Award wallet bonus
        await self.wallets.award_referral(
            referrer.id,
            referral_id=referral.id,
            referred_name=referred.first_name,
            amount=referral.reward_amount_etb,
        )

        referral.is_rewarded = True
        referral.rewarded_at = datetime.now(UTC)

        # Notify referrer via Telegram bot
        await TelegramNotifier(self.session, self.settings).referral_reward_earned(
            referrer,
            referred_user=referred,
            amount=referral.reward_amount_etb,
        )
        logger.info(
            "referral reward paid: referrer=%s amount=%s referred=%s",
            referrer.id,
            referral.reward_amount_etb,
            referred.id,
        )
        return referral

    async def get_referral_summary(self, user: User) -> ReferralSummary:
        """Summary of stats, links, and recent referrals for the user."""
        total, rewarded, earned = await self.referrals.stats_by_referrer(user.id)
        rows = await self.referrals.list_by_referrer(user.id, limit=30)
        active_reward = await self.get_reward_amount()

        # Bot and WebApp links
        bot_username = (
            self.settings.telegram_bot_username.strip().lstrip("@")
            or "ChallengeQuizBot"
        )
        code = str(user.telegram_id)
        telegram_bot_url = f"https://t.me/{bot_username}?start=ref_{code}"
        mini_app_url = f"https://t.me/{bot_username}/app?startapp=ref_{code}"

        # Check who referred this user
        referred_by_row = await self.referrals.get_by_referred_id(user.id)
        referred_by_name = None
        if referred_by_row is not None:
            inviter = await self.users.get(referred_by_row.referrer_id)
            if inviter is not None:
                referred_by_name = (
                    f"{inviter.first_name} (@{inviter.username})"
                    if inviter.username
                    else inviter.first_name
                )

        recent = [
            ReferralItem(
                id=ref.id,
                referred_name=friend.first_name,
                referred_username=friend.username,
                reward_amount_etb=ref.reward_amount_etb,
                is_rewarded=ref.is_rewarded,
                created_at=ref.created_at,
                rewarded_at=ref.rewarded_at,
            )
            for ref, friend in rows
        ]

        return ReferralSummary(
            referral_code=code,
            telegram_bot_url=telegram_bot_url,
            mini_app_url=mini_app_url,
            reward_per_referral_etb=active_reward,
            total_referrals=total,
            rewarded_referrals=rewarded,
            total_earned_etb=earned,
            referred_by=referred_by_name,
            recent_referrals=recent,
        )
