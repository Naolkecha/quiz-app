"""Telegram messages for wallet changes. Failures never block the money flow."""

import asyncio
import html
import logging
from decimal import Decimal

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.admin import AdminAccount
from app.models.challenge import Challenge
from app.models.user import User
from app.models.wallet import MoneyOrder, MoneyOrderStatus

logger = logging.getLogger(__name__)


class TelegramNotifier:
    def __init__(self, session: AsyncSession, settings: Settings | None = None) -> None:
        self.session = session
        self.settings = settings or get_settings()

    @property
    def enabled(self) -> bool:
        return bool(self.settings.telegram_bot_token) and self.settings.app_env != "test"

    async def deposit_updated(self, user: User, order: MoneyOrder) -> None:
        amount = _etb(order.amount_etb)
        if order.status == MoneyOrderStatus.SUCCEEDED:
            text = f"Money added\n\n{amount} ETB is now in your Challenge wallet."
        elif order.status == MoneyOrderStatus.PENDING:
            text = (
                f"Still checking\n\n"
                f"We are confirming your {amount} ETB Telebirr payment. "
                "Your balance updates when it is confirmed."
            )
        elif order.status == MoneyOrderStatus.FAILED:
            reason = order.failure_reason or "Telebirr did not confirm this payment."
            text = f"Payment not added\n\n{reason}"
        else:
            return
        await self._send(user.telegram_id, text)

    async def payout_requested(self, user: User, order: MoneyOrder) -> None:
        amount = _etb(order.amount_etb)
        phone = _phone(order.phone_number)
        await self._send(
            user.telegram_id,
            f"Cash out requested\n\n"
            f"{amount} ETB to {phone}.\n"
            "It stays pending until it is sent. Your balance is not charged until then.",
        )
        name = user.first_name
        if user.username:
            name = f"{name} (@{user.username})"
        alert = (
            f"Payout request\n\n"
            f"{name}\n"
            f"{amount} ETB to {phone}\n\n"
            "Open Challenge to send it, then mark it paid."
        )
        for telegram_id in await self._admin_ids():
            if telegram_id != user.telegram_id:
                await self._send(telegram_id, alert)

    async def payout_paid(self, user: User, order: MoneyOrder) -> None:
        await self._send(
            user.telegram_id,
            f"Cash out paid\n\n"
            f"We sent {_etb(order.amount_etb)} ETB to {_phone(order.phone_number)}. "
            "It has been taken from your balance.",
        )

    async def payout_rejected(self, user: User, order: MoneyOrder) -> None:
        reason = order.failure_reason or "Cancelled."
        await self._send(
            user.telegram_id,
            f"Cash out not sent\n\n"
            f"Your {_etb(order.amount_etb)} ETB request was cancelled.\n"
            f"{reason}\n"
            "Your balance was not charged.",
        )

    async def prize_won(self, user: User, *, title: str, amount: object) -> None:
        await self._send(
            user.telegram_id,
            f"You won\n\n{_etb(amount)} ETB from {title} is in your wallet.",
        )

    async def referral_reward_earned(
        self,
        referrer: User,
        *,
        referred_user: User,
        amount: Decimal,
    ) -> None:
        name = referred_user.first_name
        if referred_user.username:
            name = f"{name} (@{referred_user.username})"
        await self._send(
            referrer.telegram_id,
            f"🎉 Referral reward!\n\n"
            f"Your friend {name} completed their first challenge.\n"
            f"{_etb(amount)} ETB has been added to your wallet balance!",
        )

    async def balance_adjusted(
        self,
        user: User,
        *,
        amount: Decimal,
        balance_after: Decimal,
        direction: str,
        reason: str,
    ) -> None:
        action = "credited with" if direction == "credit" else "debited by"
        await self._send(
            user.telegram_id,
            f"Wallet update\n\n"
            f"Your wallet was {action} {_etb(abs(amount))} ETB.\n"
            f"Reason: {reason}\n"
            f"Current balance: {_etb(balance_after)} ETB.",
        )

    async def entry_fee_deducted(
        self,
        user: User,
        *,
        challenge_title: str,
        fee: Decimal,
        balance_after: Decimal,
    ) -> None:
        amount = _etb(fee)
        balance = _etb(balance_after)
        text = (
            f"🎯 Challenge Joined!\n\n"
            f"Competition: {challenge_title}\n"
            f"Entry fee deducted: −{amount} ETB\n"
            f"Remaining wallet balance: {balance} ETB\n\n"
            "Good luck! Answer fast and accurately to claim the top prize."
        )
        await self._send(user.telegram_id, text)

    async def _admin_ids(self) -> list[int]:
        rows = await self.session.scalars(
            select(User.telegram_id)
            .join(AdminAccount, func.lower(AdminAccount.username) == func.lower(User.username))
            .where(User.username.is_not(None), User.is_blocked.is_(False))
        )
        return list(rows.all())

    async def broadcast_new_challenge(self, challenge: Challenge) -> dict[str, int]:
        """Broadcast an alert to all registered active players when a new challenge is added/live."""
        if not self.enabled:
            return {"sent": 0, "failed": 0, "total": 0}

        stmt = select(User.telegram_id).where(User.is_blocked.is_(False))
        user_ids = list((await self.session.scalars(stmt)).all())
        if not user_ids:
            return {"sent": 0, "failed": 0, "total": 0}

        is_free = challenge.entry_fee_etb == 0
        fee_str = "FREE (ነፃ)" if is_free else f"{_etb(challenge.entry_fee_etb)} ETB"
        prize_str = f"{_etb(challenge.base_prize_etb)} ETB"
        title_escaped = html.escape(challenge.title)
        cat_badge = (
            f"📂 <b>Category:</b> {html.escape(challenge.category.title())}\n"
            if challenge.category
            else ""
        )

        message = (
            f"🔥 <b>NEW CHALLENGE OPEN!</b>\n\n"
            f"🏆 <b>{title_escaped}</b>\n"
            f"{cat_badge}"
            f"💰 <b>Prize Pool:</b> {prize_str}\n"
            f"🎟 <b>Entry Fee:</b> {fee_str}\n"
            f"⏱ <b>Questions:</b> {challenge.question_count} questions • {challenge.duration_seconds}s limit\n\n"
            f"🇪🇹 አዲስ ውድድር ተከፍቷል! አሁኑኑ ተወዳድረው የገንዘብ ሽልማት ያሸንፉ።\n"
            f"🌳 Dorgommiin haaraan eegalameera! Amma dorgomaatii badhaafamaa.\n\n"
            f"👇 Tap below to enter and compete for top prizes!"
        )

        reply_markup: dict | None = None
        base_url = self.settings.webapp_url.rstrip("/")
        if base_url.startswith("https://"):
            challenge_url = f"{base_url}/challenges/{challenge.id}"
            reply_markup = {
                "inline_keyboard": [
                    [
                        {
                            "text": "🎮 Play Challenge | አሁኑኑ ተወዳደሩ",
                            "web_app": {"url": challenge_url},
                        }
                    ]
                ]
            }

        sent = 0
        failed = 0
        for tid in user_ids:
            delivered = await self._send(
                tid,
                message,
                reply_markup=reply_markup,
                parse_mode="HTML",
            )
            if delivered:
                sent += 1
            else:
                failed += 1
            await asyncio.sleep(0.05)

        logger.info(
            "Challenge %s broadcast finished: sent=%d failed=%d total=%d",
            challenge.id,
            sent,
            failed,
            len(user_ids),
        )
        return {"sent": sent, "failed": failed, "total": len(user_ids)}

    async def _send(
        self,
        telegram_id: int,
        text: str,
        reply_markup: dict | None = None,
        parse_mode: str | None = None,
    ) -> bool:
        if not self.enabled:
            return False
        url = f"https://api.telegram.org/bot{self.settings.telegram_bot_token}/sendMessage"
        payload = {"chat_id": telegram_id, "text": text}
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        if parse_mode is not None:
            payload["parse_mode"] = parse_mode
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.post(url, json=payload)
            if response.status_code >= 400:
                logger.warning(
                    "telegram notify failed chat=%s status=%s body=%s",
                    telegram_id,
                    response.status_code,
                    response.text,
                )
                return False
            return True
        except httpx.HTTPError:
            logger.warning("telegram notify failed chat=%s", telegram_id)
            return False


def _etb(amount: object) -> str:
    return f"{amount:.2f}" if hasattr(amount, "quantize") else str(amount)


def _phone(value: str | None) -> str:
    digits = "".join(character for character in (value or "") if character.isdigit())
    if digits.startswith("251") and len(digits) == 12:
        return f"0{digits[3:]}"
    return digits or "your Telebirr number"
