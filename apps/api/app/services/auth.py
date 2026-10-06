"""Telegram and development login."""

import logging
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import InitDataError, NotFoundError, UserBlockedError
from app.core.sessions import issue_session
from app.integrations.telegram.init_data import validate_init_data
from app.models.user import User
from app.repositories.users import UserRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class AuthResult:
    user: User
    session_token: str
    expires_in: int


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UserRepository(session)

    async def login_telegram(self, init_data: str) -> AuthResult:
        settings = get_settings()
        if not settings.telegram_bot_token:
            raise InitDataError(
                "init_data_invalid",
                "Telegram authentication is not configured.",
            )
        identity = validate_init_data(
            init_data,
            bot_token=settings.telegram_bot_token,
            max_age_seconds=settings.init_data_max_age_seconds,
            clock_skew_seconds=settings.init_data_clock_skew_seconds,
        )
        user, is_new = await self.users.upsert_telegram(identity)
        if is_new and identity.start_param:
            from app.services.referrals import ReferralService

            await ReferralService(self.session).register_referral(user, identity.start_param)
        await self.session.commit()
        if user.is_blocked:
            logger.info("telegram login rejected for blocked user %s", user.id)
            raise UserBlockedError()
        logger.info("telegram login user_id=%s telegram_id=%s", user.id, user.telegram_id)
        return self._session_for(user)

    async def login_development(self) -> AuthResult:
        settings = get_settings()
        if not settings.dev_auth_enabled:
            raise NotFoundError()
        user = await self.users.upsert_development_user()
        await self.session.commit()
        if user.is_blocked:
            raise UserBlockedError()
        logger.info("development login user_id=%s", user.id)
        return self._session_for(user)

    def _session_for(self, user: User) -> AuthResult:
        settings = get_settings()
        token = issue_session(
            user_id=user.id,
            secret=settings.secret_key,
            ttl_seconds=settings.session_ttl_seconds,
        )
        return AuthResult(
            user=user,
            session_token=token,
            expires_in=settings.session_ttl_seconds,
        )
