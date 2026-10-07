"""1v1 Fast Duel service logic."""

from __future__ import annotations

import random
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, NotFoundError
from app.models.duel import Duel, DuelStatus
from app.models.question import Choice, Question
from app.models.user import User
from app.models.wallet import LedgerType
from app.schemas.duel import (
    CreateDuelRequest,
    DuelAnswerInput,
    DuelChoiceView,
    DuelPlayerView,
    DuelQuestionView,
    DuelView,
)
from app.services.notify import TelegramNotifier
from app.services.wallets import WalletService, _money

NUM_DUEL_QUESTIONS = 5
DUEL_EXPIRY_HOURS = 24
FALLBACK_QUESTIONS = [
    {
        "id": "q1",
        "prompt": "What is the capital city of Ethiopia?",
        "choices": [
            {"id": "c1", "label": "Addis Ababa"},
            {"id": "c2", "label": "Hawassa"},
            {"id": "c3", "label": "Dire Dawa"},
            {"id": "c4", "label": "Bahir Dar"},
        ],
        "correct_choice_id": "c1",
    },
    {
        "id": "q2",
        "prompt": "What is the national currency of Ethiopia?",
        "choices": [
            {"id": "c5", "label": "Birr"},
            {"id": "c6", "label": "Shilling"},
            {"id": "c7", "label": "Dinar"},
            {"id": "c8", "label": "Franc"},
        ],
        "correct_choice_id": "c5",
    },
    {
        "id": "q3",
        "prompt": "Which ancient Ethiopian town is famous for rock-hewn churches?",
        "choices": [
            {"id": "c9", "label": "Lalibela"},
            {"id": "c10", "label": "Axum"},
            {"id": "c11", "label": "Gondar"},
            {"id": "c12", "label": "Harar"},
        ],
        "correct_choice_id": "c9",
    },
    {
        "id": "q4",
        "prompt": "How many players are on a standard soccer team on the field?",
        "choices": [
            {"id": "c13", "label": "11"},
            {"id": "c14", "label": "10"},
            {"id": "c15", "label": "9"},
            {"id": "c16", "label": "12"},
        ],
        "correct_choice_id": "c13",
    },
    {
        "id": "q5",
        "prompt": "Which planet is known as the Red Planet?",
        "choices": [
            {"id": "c17", "label": "Mars"},
            {"id": "c18", "label": "Venus"},
            {"id": "c19", "label": "Jupiter"},
            {"id": "c20", "label": "Saturn"},
        ],
        "correct_choice_id": "c17",
    },
]


class DuelService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.wallets = WalletService(session)

    async def _pick_questions(self, category: str) -> list[dict[str, Any]]:
        query = (
            select(Question)
            .options(selectinload(Question.choices))
            .order_by(func.random())
            .limit(NUM_DUEL_QUESTIONS)
        )
        questions = list((await self.session.scalars(query)).all())
        if len(questions) < NUM_DUEL_QUESTIONS:
            return list(FALLBACK_QUESTIONS)

        results: list[dict[str, Any]] = []
        for q in questions:
            correct_choice = next((c for c in q.choices if c.is_correct), q.choices[0] if q.choices else None)
            shuffled_choices = list(q.choices)
            random.shuffle(shuffled_choices)
            results.append(
                {
                    "id": str(q.id),
                    "prompt": q.prompt,
                    "choices": [{"id": str(c.id), "label": c.label} for c in shuffled_choices],
                    "correct_choice_id": str(correct_choice.id) if correct_choice else "",
                }
            )
        return results

    async def create_duel(self, user: User, body: CreateDuelRequest) -> Duel:
        stake = _money(body.stake_etb)
        if stake < 0:
            raise AppError("invalid_stake", "Stake amount cannot be negative.", status_code=400)

        # 10% platform fee on pot (stake * 2)
        if stake > 0:
            pot = stake * 2
            platform_fee = _money(pot * Decimal("0.10"))
            prize = pot - platform_fee
        else:
            platform_fee = Decimal("0.00")
            prize = Decimal("0.00")

        questions = await self._pick_questions(body.category)
        now = datetime.now(UTC)
        duel_id = uuid.uuid4()

        # Deduct creator stake if paid
        if stake > 0:
            wallet = await self.wallets.wallets.lock(user.id)
            if wallet.balance_etb < stake:
                raise AppError(
                    "insufficient_balance",
                    f"Your balance ({wallet.balance_etb} ETB) is less than the {stake} ETB stake.",
                    status_code=400,
                )
            await self.wallets._post(
                wallet,
                amount=-stake,
                entry_type=LedgerType.ENTRY_FEE,
                order=None,
                key=f"duel:{duel_id}:creator:fee",
                description=f"1v1 Duel stake ({stake} ETB)",
            )

        invited_list: list[str] = []
        if body.invited_username:
            for u in body.invited_username.replace(",", " ").split():
                clean_u = u.strip().lstrip("@").lower()
                if clean_u and clean_u not in invited_list:
                    invited_list.append(clean_u)
        if body.invited_usernames:
            for u in body.invited_usernames:
                clean_u = u.strip().lstrip("@").lower()
                if clean_u and clean_u not in invited_list:
                    invited_list.append(clean_u)

        primary_invited = invited_list[0] if invited_list else None
        is_public = body.is_public if not invited_list else False

        duel = Duel(
            id=duel_id,
            creator_id=user.id,
            stake_etb=stake,
            prize_etb=prize,
            platform_fee_etb=platform_fee,
            category=body.category.lower().strip() or "general",
            status=DuelStatus.WAITING_OPPONENT,
            invited_username=primary_invited,
            invited_usernames=invited_list,
            is_public=is_public,
            questions=questions,
            expires_at=now + timedelta(hours=DUEL_EXPIRY_HOURS),
        )
        self.session.add(duel)
        await self.session.commit()
        await self.session.refresh(duel)
        return duel

    async def submit_creator_answers(
        self,
        duel_id: uuid.UUID,
        user: User,
        answers: list[DuelAnswerInput],
        time_seconds: Decimal,
    ) -> Duel:
        duel = await self.session.get(Duel, duel_id)
        if duel is None:
            raise NotFoundError("Duel not found.")
        if duel.creator_id != user.id:
            raise AppError("forbidden", "Only the duel creator can submit these answers.", status_code=403)
        if duel.creator_finished_at is not None:
            raise AppError("already_played", "You have already completed your turn.", status_code=400)

        score = self._calculate_score(duel.questions, answers)
        now = datetime.now(UTC)
        duel.creator_score = score
        duel.creator_time_seconds = time_seconds
        duel.creator_answers = [a.model_dump() for a in answers]
        duel.creator_finished_at = now

        await self.session.commit()
        await self.session.refresh(duel)

        if duel.invited_usernames:
            await self._notify_invited_opponents(duel, user)

        return duel

    async def _notify_invited_opponents(self, duel: Duel, creator: User) -> None:
        try:
            from app.services.telegram_bot import TelegramBotService
            bot = TelegramBotService()
            if not bot.token:
                return

            stake_text = f"{duel.stake_etb} ETB" if duel.stake_etb > 0 else "Free"
            creator_display = f"@{creator.username}" if creator.username else creator.first_name
            text = (
                f"⚔️ <b>1v1 Duel Challenge!</b>\n\n"
                f"{creator_display} has challenged you to a 1v1 Quiz Duel!\n\n"
                f"📊 <b>Category:</b> {duel.category.capitalize()}\n"
                f"💰 <b>Stake:</b> {stake_text} • <b>Winner Takes:</b> {duel.prize_etb} ETB\n\n"
                f"⚡ <i>Can you beat their score? Tap below to enter the Arena!</i>"
            )
            duel_url = f"{bot.webapp_url}/duels/{duel.id}"
            reply_markup = {
                "inline_keyboard": [
                    [{"text": "⚔️ Accept Challenge | ተቀላቀል", "web_app": {"url": duel_url}}],
                    [{"text": "🎮 Open Mini App", "web_app": {"url": bot.webapp_url}}],
                ]
            }

            for username in duel.invited_usernames:
                target_user = await self.session.scalar(
                    select(User).where(func.lower(User.username) == username.lower())
                )
                if target_user and target_user.telegram_id:
                    await bot.send_message(
                        target_user.telegram_id,
                        text,
                        reply_markup=reply_markup,
                        parse_mode="HTML",
                    )
        except Exception:
            pass

    async def join_and_play(
        self,
        duel_id: uuid.UUID,
        user: User,
        answers: list[DuelAnswerInput],
        time_seconds: Decimal,
    ) -> Duel:
        duel = await self.session.get(Duel, duel_id)
        if duel is None:
            raise NotFoundError("Duel not found.")
        if duel.creator_id == user.id:
            raise AppError("self_duel", "You cannot play against yourself.", status_code=400)
        if duel.status != DuelStatus.WAITING_OPPONENT:
            raise AppError("duel_closed", "This duel is no longer accepting opponents.", status_code=400)
        if duel.opponent_id is not None and duel.opponent_id != user.id:
            raise AppError("duel_taken", "Another player has already accepted this duel.", status_code=400)
        if duel.expires_at < datetime.now(UTC):
            duel.status = DuelStatus.EXPIRED
            await self.session.commit()
            raise AppError("duel_expired", "This duel has expired.", status_code=400)

        # Enforce invited user restrictions
        if duel.invited_usernames or duel.invited_username:
            allowed = set(duel.invited_usernames or [])
            if duel.invited_username:
                allowed.add(duel.invited_username.lower())
            curr_username = (user.username or "").lower().strip()
            if not curr_username or curr_username not in allowed:
                targets = ", ".join(f"@{u}" for u in allowed)
                raise AppError(
                    "private_duel",
                    f"This duel is private and reserved only for {targets}.",
                    status_code=403,
                )

        stake = duel.stake_etb
        if stake > 0:
            wallet = await self.wallets.wallets.lock(user.id)
            if wallet.balance_etb < stake:
                raise AppError(
                    "insufficient_balance",
                    f"Your balance ({wallet.balance_etb} ETB) is less than the {stake} ETB stake.",
                    status_code=400,
                )
            await self.wallets._post(
                wallet,
                amount=-stake,
                entry_type=LedgerType.ENTRY_FEE,
                order=None,
                key=f"duel:{duel_id}:opponent:fee",
                description=f"1v1 Duel stake ({stake} ETB)",
            )

        score = self._calculate_score(duel.questions, answers)
        now = datetime.now(UTC)

        duel.opponent_id = user.id
        duel.opponent_score = score
        duel.opponent_time_seconds = time_seconds
        duel.opponent_answers = [a.model_dump() for a in answers]
        duel.opponent_finished_at = now
        duel.status = DuelStatus.COMPLETED
        duel.settled_at = now

        # Determine winner
        c_score = duel.creator_score or 0
        c_time = duel.creator_time_seconds or Decimal("999.00")
        o_score = score
        o_time = time_seconds

        creator = await self.session.get(User, duel.creator_id)

        if c_score > o_score:
            duel.winner_id = duel.creator_id
        elif o_score > c_score:
            duel.winner_id = user.id
        else:
            # Score tie -> faster time wins
            if c_time < o_time:
                duel.winner_id = duel.creator_id
            elif o_time < c_time:
                duel.winner_id = user.id
            else:
                duel.is_tie = True

        # Settle wallet prizes
        prize = duel.prize_etb
        if duel.winner_id is not None and prize > 0:
            winner_wallet = await self.wallets.wallets.lock(duel.winner_id)
            await self.wallets._post(
                winner_wallet,
                amount=prize,
                entry_type=LedgerType.PRIZE,
                order=None,
                key=f"duel:{duel_id}:prize",
                description=f"Won 1v1 Duel ({prize} ETB)",
            )
        elif duel.is_tie and stake > 0:
            # Refund both players
            c_wallet = await self.wallets.wallets.lock(duel.creator_id)
            await self.wallets._post(
                c_wallet,
                amount=stake,
                entry_type=LedgerType.PRIZE,
                order=None,
                key=f"duel:{duel_id}:tie:creator",
                description=f"1v1 Duel tie refund ({stake} ETB)",
            )
            o_wallet = await self.wallets.wallets.lock(user.id)
            await self.wallets._post(
                o_wallet,
                amount=stake,
                entry_type=LedgerType.PRIZE,
                order=None,
                key=f"duel:{duel_id}:tie:opponent",
                description=f"1v1 Duel tie refund ({stake} ETB)",
            )

        await self.session.commit()
        await self.session.refresh(duel)

        # Notify via Telegram bot
        try:
            notifier = TelegramNotifier(self.session)
            if creator and creator.telegram_id:
                if duel.winner_id == duel.creator_id:
                    msg = (
                        f"🏆 <b>1v1 Duel Won!</b>\n\n"
                        f"You beat {user.first_name}!\n"
                        f"📊 Score: {c_score}/5 vs {o_score}/5\n"
                        f"⏱ Time: {c_time:.1f}s vs {o_time:.1f}s\n"
                        + (f"💰 Prize: <b>{prize} ETB</b> credited to your wallet!" if prize > 0 else "")
                    )
                elif duel.is_tie:
                    msg = f"🤝 <b>1v1 Duel Tied!</b>\n\nEqual score and time against {user.first_name}. Stakes refunded."
                else:
                    msg = (
                        f"⚔️ <b>1v1 Duel Result</b>\n\n"
                        f"{user.first_name} won this round ({o_score}/5 vs {c_score}/5).\n"
                        "Better luck next time!"
                    )
                await notifier._send(creator.telegram_id, msg, parse_mode="HTML")

            if user.telegram_id:
                if duel.winner_id == user.id:
                    msg = (
                        f"🏆 <b>1v1 Duel Won!</b>\n\n"
                        f"You beat {creator.first_name if creator else 'your opponent'}!\n"
                        f"📊 Score: {o_score}/5 vs {c_score}/5\n"
                        f"⏱ Time: {o_time:.1f}s vs {c_time:.1f}s\n"
                        + (f"💰 Prize: <b>{prize} ETB</b> credited to your wallet!" if prize > 0 else "")
                    )
                elif duel.is_tie:
                    msg = "🤝 <b>1v1 Duel Tied!</b>\n\nEqual score and time. Stakes refunded."
                else:
                    msg = (
                        f"⚔️ <b>1v1 Duel Result</b>\n\n"
                        f"{creator.first_name if creator else 'Opponent'} won this round ({c_score}/5 vs {o_score}/5).\n"
                        "Challenge them again to get your revenge!"
                    )
                await notifier._send(user.telegram_id, msg, parse_mode="HTML")
        except Exception:
            pass

        return duel

    def _calculate_score(self, questions: list[dict[str, Any]], answers: list[DuelAnswerInput]) -> int:
        score = 0
        answer_map = {a.question_id: a.selected_choice_id for a in answers}
        for q in questions:
            qid = str(q.get("id"))
            correct = str(q.get("correct_choice_id"))
            if answer_map.get(qid) == correct:
                score += 1
        return score

    async def list_open_duels(self, current_user: User | None = None, limit: int = 30) -> list[Duel]:
        now = datetime.now(UTC)
        conditions = [
            Duel.status == DuelStatus.WAITING_OPPONENT,
            Duel.creator_finished_at.is_not(None),
            Duel.expires_at > now,
        ]

        if current_user and current_user.username:
            curr_username = current_user.username.lower()
            conditions.append(
                or_(
                    Duel.is_public.is_(True),
                    func.lower(Duel.invited_username) == curr_username,
                    Duel.invited_usernames.contains([curr_username]),
                )
            )
        else:
            conditions.append(Duel.is_public.is_(True))

        query = (
            select(Duel)
            .where(*conditions)
            .order_by(desc(Duel.created_at))
            .limit(limit)
        )
        return list((await self.session.scalars(query)).all())

    async def my_duels(self, user: User, limit: int = 50) -> list[Duel]:
        query = (
            select(Duel)
            .where(or_(Duel.creator_id == user.id, Duel.opponent_id == user.id))
            .order_by(desc(Duel.created_at))
            .limit(limit)
        )
        return list((await self.session.scalars(query)).all())

    async def get_duel(self, duel_id: uuid.UUID) -> Duel:
        duel = await self.session.get(Duel, duel_id)
        if duel is None:
            raise NotFoundError("Duel not found.")
        return duel

    def serialize_duel(self, duel: Duel, current_user: User | None = None) -> DuelView:
        questions_view: list[DuelQuestionView] = []
        for q in duel.questions:
            choices = [DuelChoiceView(id=str(c.get("id")), label=str(c.get("label"))) for c in q.get("choices", [])]
            questions_view.append(DuelQuestionView(id=str(q.get("id")), prompt=str(q.get("prompt")), choices=choices))

        my_role: str | None = None
        has_played = False
        if current_user:
            if duel.creator_id == current_user.id:
                my_role = "creator"
                has_played = duel.creator_finished_at is not None
            elif duel.opponent_id == current_user.id:
                my_role = "opponent"
                has_played = duel.opponent_finished_at is not None
            else:
                my_role = "spectator"

        creator_player = DuelPlayerView(
            id=duel.creator.id,
            first_name=duel.creator.first_name,
            username=duel.creator.username,
        )
        opponent_player = (
            DuelPlayerView(
                id=duel.opponent.id,
                first_name=duel.opponent.first_name,
                username=duel.opponent.username,
            )
            if duel.opponent
            else None
        )
        winner_player = (
            DuelPlayerView(
                id=duel.winner.id,
                first_name=duel.winner.first_name,
                username=duel.winner.username,
            )
            if duel.winner
            else None
        )

        return DuelView(
            id=duel.id,
            creator=creator_player,
            opponent=opponent_player,
            winner=winner_player,
            stake_etb=duel.stake_etb,
            prize_etb=duel.prize_etb,
            platform_fee_etb=duel.platform_fee_etb,
            category=duel.category,
            status=duel.status,
            invited_username=duel.invited_username,
            invited_usernames=duel.invited_usernames or [],
            is_public=duel.is_public,
            questions=questions_view,
            creator_score=duel.creator_score if (duel.status == DuelStatus.COMPLETED or my_role == "creator") else None,
            creator_time_seconds=(
                duel.creator_time_seconds
                if (duel.status == DuelStatus.COMPLETED or my_role == "creator")
                else None
            ),
            opponent_score=duel.opponent_score if duel.status == DuelStatus.COMPLETED else None,
            opponent_time_seconds=duel.opponent_time_seconds if duel.status == DuelStatus.COMPLETED else None,
            is_tie=duel.is_tie,
            created_at=duel.created_at,
            expires_at=duel.expires_at,
            settled_at=duel.settled_at,
            my_role=my_role,
            has_played=has_played,
        )
