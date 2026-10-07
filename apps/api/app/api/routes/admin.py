from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload

from app.api.deps import AdminAccess, DbSession, require_owner
from app.core.exceptions import AppError
from app.models.challenge import Challenge, ChallengeStatus
from app.models.entry import ChallengeEntry
from app.models.question import Choice, Question, QuestionCategory
from app.models.user import User
from app.models.wallet import (
    LedgerType,
    MoneyOrder,
    MoneyOrderKind,
    MoneyOrderStatus,
    Wallet,
    WalletTransaction,
)
from app.services.admins import AdminService
from app.services.wallets import WalletService

router = APIRouter(prefix="/admin", tags=["admin"])


class FinanceSummary(BaseModel):
    total_user_balances_etb: Decimal
    total_deposits_all_time_etb: Decimal
    total_withdrawals_paid_all_time_etb: Decimal
    total_adjustments_all_time_etb: Decimal = Decimal(0)
    pending_withdrawals_etb: Decimal
    pending_withdrawals_count: int
    total_entry_fees_all_time_etb: Decimal
    total_prizes_paid_all_time_etb: Decimal
    net_platform_profit_etb: Decimal
    deposits_today_etb: Decimal
    entry_fees_today_etb: Decimal
    prizes_today_etb: Decimal
    withdrawals_paid_today_etb: Decimal
    telebirr_account_name: str
    telebirr_account_number: str


class AdjustBalanceRequest(BaseModel):
    user_id: UUID
    amount_etb: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    direction: Literal["credit", "debit"]
    reason: str = Field(min_length=3, max_length=200)


class AdjustBalanceResponse(BaseModel):
    user_id: UUID
    player_name: str
    telegram_username: str | None
    balance_etb: Decimal
    amount_etb: Decimal
    direction: str
    reason: str
    transaction_id: UUID
    created_at: datetime


class AdminDepositView(BaseModel):
    id: UUID
    user_id: UUID
    player_name: str
    telegram_username: str | None
    telegram_id: int
    amount_etb: Decimal
    transaction_number: str | None
    status: MoneyOrderStatus
    failure_reason: str | None
    created_at: datetime
    completed_at: datetime | None
    balance_etb: Decimal


class AdminMember(BaseModel):
    username: str
    role: str
    created_at: datetime


class AddAdminRequest(BaseModel):
    username: str = Field(min_length=5, max_length=33)


class AdminTransaction(BaseModel):
    id: UUID
    entry_type: LedgerType
    amount_etb: Decimal
    balance_after_etb: Decimal
    description: str
    created_at: datetime
    user_id: UUID
    player_name: str
    telegram_username: str | None


class Overview(BaseModel):
    role: str
    players: int
    players_today: int
    open_challenges: int
    pending_cash_outs: int
    pending_cash_out_etb: Decimal
    deposits_today_etb: Decimal
    entry_fees_today_etb: Decimal
    prizes_today_etb: Decimal


@router.get("/overview", response_model=Overview, summary="Numbers for the admin home")
async def overview(role: AdminAccess, session: DbSession) -> Overview:
    since = datetime.now(UTC) - timedelta(days=1)

    async def ledger_sum(entry_type: LedgerType) -> Decimal:
        value = await session.scalar(
            select(func.coalesce(func.sum(WalletTransaction.amount_etb), 0)).where(
                WalletTransaction.entry_type == entry_type,
                WalletTransaction.created_at >= since,
            )
        )
        return abs(Decimal(value or 0))

    pending = (
        await session.execute(
            select(func.count(), func.coalesce(func.sum(MoneyOrder.amount_etb), 0)).where(
                MoneyOrder.kind == MoneyOrderKind.WITHDRAWAL,
                MoneyOrder.status == MoneyOrderStatus.PENDING,
            )
        )
    ).one()
    return Overview(
        role=role.value,
        players=int(await session.scalar(select(func.count()).select_from(User)) or 0),
        players_today=int(
            await session.scalar(select(func.count()).where(User.created_at >= since)) or 0
        ),
        open_challenges=int(
            await session.scalar(
                select(func.count()).where(Challenge.status == ChallengeStatus.LIVE)
            )
            or 0
        ),
        pending_cash_outs=int(pending[0] or 0),
        pending_cash_out_etb=Decimal(pending[1] or 0),
        deposits_today_etb=await ledger_sum(LedgerType.DEPOSIT),
        entry_fees_today_etb=await ledger_sum(LedgerType.ENTRY_FEE),
        prizes_today_etb=await ledger_sum(LedgerType.PRIZE),
    )


@router.get(
    "/transactions",
    response_model=list[AdminTransaction],
    summary="List wallet movements for every player",
)
async def list_transactions(
    _role: AdminAccess,
    session: DbSession,
    entry_type: Annotated[
        Literal[
            "deposit",
            "entry_fee",
            "prize",
            "withdrawal_hold",
            "withdrawal_release",
            "adjustment",
            "referral",
            "all",
        ],
        Query(),
    ] = "all",
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[AdminTransaction]:
    stmt = (
        select(WalletTransaction, User)
        .join(Wallet, Wallet.id == WalletTransaction.wallet_id)
        .join(User, User.id == Wallet.user_id)
        .order_by(WalletTransaction.created_at.desc())
        .limit(limit)
    )
    if entry_type != "all":
        stmt = stmt.where(WalletTransaction.entry_type == LedgerType(entry_type))
    rows = (await session.execute(stmt)).all()
    return [
        AdminTransaction(
            id=item.id,
            entry_type=item.entry_type,
            amount_etb=item.amount_etb,
            balance_after_etb=item.balance_after_etb,
            description=item.description,
            created_at=item.created_at,
            user_id=player.id,
            player_name=" ".join(part for part in (player.first_name, player.last_name) if part),
            telegram_username=player.username,
        )
        for item, player in rows
    ]


# ---------------------------------------------------------------------------
# Finance & Treasury management
# ---------------------------------------------------------------------------


@router.get(
    "/finance/summary",
    response_model=FinanceSummary,
    summary="Get financial liquidity, liabilities, revenue, and daily numbers",
)
async def finance_summary(_role: AdminAccess, session: DbSession) -> FinanceSummary:
    summary_data = await WalletService(session).finance_summary()
    return FinanceSummary(**summary_data)


@router.post(
    "/finance/adjust",
    response_model=AdjustBalanceResponse,
    summary="Manually credit or debit a player wallet balance",
)
async def adjust_balance(
    body: AdjustBalanceRequest,
    _role: AdminAccess,
    session: DbSession,
) -> AdjustBalanceResponse:
    wallet, tx, user = await WalletService(session).adjust_balance(
        body.user_id,
        amount=body.amount_etb,
        direction=body.direction,
        reason=body.reason,
    )
    player_name = " ".join(part for part in (user.first_name, user.last_name) if part) or "Player"
    return AdjustBalanceResponse(
        user_id=user.id,
        player_name=player_name,
        telegram_username=user.username,
        balance_etb=wallet.balance_etb,
        amount_etb=tx.amount_etb,
        direction=body.direction,
        reason=body.reason,
        transaction_id=tx.id,
        created_at=tx.created_at,
    )


@router.get(
    "/finance/deposits",
    response_model=list[AdminDepositView],
    summary="List deposit orders with user details and status filter",
)
async def list_deposits(
    _role: AdminAccess,
    session: DbSession,
    status: Annotated[Literal["pending", "succeeded", "failed", "all"], Query()] = "all",
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[AdminDepositView]:
    selected = None if status == "all" else MoneyOrderStatus(status)
    rows = await WalletService(session).list_deposits(status=selected, limit=limit)
    result: list[AdminDepositView] = []
    for order, user, balance in rows:
        name = " ".join(part for part in (user.first_name, user.last_name) if part) or "Player"
        result.append(
            AdminDepositView(
                id=order.id,
                user_id=user.id,
                player_name=name,
                telegram_username=user.username,
                telegram_id=user.telegram_id,
                amount_etb=order.amount_etb,
                transaction_number=order.transaction_number,
                status=order.status,
                failure_reason=order.failure_reason,
                created_at=order.created_at,
                completed_at=order.completed_at,
                balance_etb=balance,
            )
        )
    return result


@router.post(
    "/finance/deposits/{order_id}/approve",
    response_model=AdminDepositView,
    summary="Manually verify and credit a pending or failed deposit",
)
async def approve_deposit(
    order_id: UUID,
    _role: AdminAccess,
    session: DbSession,
) -> AdminDepositView:
    order, user, balance = await WalletService(session).manual_approve_deposit(order_id)
    name = " ".join(part for part in (user.first_name, user.last_name) if part) or "Player"
    return AdminDepositView(
        id=order.id,
        user_id=user.id,
        player_name=name,
        telegram_username=user.username,
        telegram_id=user.telegram_id,
        amount_etb=order.amount_etb,
        transaction_number=order.transaction_number,
        status=order.status,
        failure_reason=order.failure_reason,
        created_at=order.created_at,
        completed_at=order.completed_at,
        balance_etb=balance,
    )


@router.get("/admins", response_model=list[AdminMember], summary="List admin usernames")
async def list_admins(_role: AdminAccess, session: DbSession) -> list[AdminMember]:
    rows = await AdminService(session).list_members()
    return [
        AdminMember(username=row.username, role=row.role.value, created_at=row.created_at)
        for row in rows
    ]


@router.post(
    "/admins",
    response_model=AdminMember,
    summary="Add a Telegram username as admin",
    dependencies=[Depends(require_owner)],
)
async def add_admin(body: AddAdminRequest, session: DbSession) -> AdminMember:
    row = await AdminService(session).add_member(body.username)
    return AdminMember(username=row.username, role=row.role.value, created_at=row.created_at)


@router.delete(
    "/admins/{username}",
    status_code=204,
    summary="Remove an admin username",
    dependencies=[Depends(require_owner)],
)
async def remove_admin(username: str, session: DbSession) -> None:
    await AdminService(session).remove_member(username)


# ---------------------------------------------------------------------------
# Challenge management
# ---------------------------------------------------------------------------

_VALID_TRANSITIONS: dict[str, list[str]] = {
    "draft": ["registration", "ready", "live", "cancelled"],
    "registration": ["ready", "live", "cancelled"],
    "ready": ["live", "cancelled"],
    "live": ["completed", "cancelled"],
    "completed": [],
    "cancelled": [],
}


class AdminChallenge(BaseModel):
    id: UUID
    title: str
    description: str
    status: str
    entry_fee_etb: Decimal
    minimum_participants: int
    base_prize_etb: Decimal
    extra_prize_per_participant_etb: Decimal
    question_count: int
    duration_seconds: int
    max_participants: int | None
    participant_count: int
    created_at: datetime
    starts_at: datetime | None
    category: str | None = None


class ChoiceIn(BaseModel):
    label: str = Field(min_length=1)
    is_correct: bool


class QuestionIn(BaseModel):
    prompt: str = Field(min_length=1)
    choices: list[ChoiceIn] = Field(min_length=2, max_length=6)


class ImportQuestionsRequest(BaseModel):
    questions: list[QuestionIn] = Field(min_length=1)


class CreateChallengeRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    entry_fee_etb: Decimal = Field(ge=0)
    minimum_participants: int = Field(ge=1)
    base_prize_etb: Decimal = Field(ge=0)
    extra_prize_per_participant_etb: Decimal = Field(ge=0)
    question_count: int = Field(ge=1)
    duration_seconds: int = Field(ge=10)
    max_participants: int | None = None
    questions: list[QuestionIn] | None = None
    category: str | None = Field(default=None, max_length=50)
    status: Literal["draft", "registration", "live"] = "draft"
    notify_users: bool = False


class UpdateChallengeRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1)
    entry_fee_etb: Decimal | None = Field(default=None, ge=0)
    minimum_participants: int | None = Field(default=None, ge=1)
    base_prize_etb: Decimal | None = Field(default=None, ge=0)
    extra_prize_per_participant_etb: Decimal | None = Field(default=None, ge=0)
    question_count: int | None = Field(default=None, ge=1)
    duration_seconds: int | None = Field(default=None, ge=10)
    max_participants: int | None = None
    category: str | None = Field(default=None, max_length=50)


class UpdateChallengeStatus(BaseModel):
    status: Literal["draft", "registration", "ready", "live", "completed", "cancelled"]
    notify_users: bool = False


class NotifyChallengeResponse(BaseModel):
    challenge_id: UUID
    sent: int
    failed: int
    total: int


class AdminPlayer(BaseModel):
    id: UUID
    telegram_id: int
    username: str | None
    first_name: str
    last_name: str | None
    is_blocked: bool
    created_at: datetime
    balance_etb: Decimal


def _build_challenge_response(challenge: Challenge, participant_count: int) -> AdminChallenge:
    status_str = (
        challenge.status.value
        if hasattr(challenge.status, "value")
        else str(challenge.status)
    )
    return AdminChallenge(
        id=challenge.id,
        title=challenge.title,
        description=challenge.description,
        status=status_str,
        entry_fee_etb=challenge.entry_fee_etb,
        minimum_participants=challenge.minimum_participants,
        base_prize_etb=challenge.base_prize_etb,
        extra_prize_per_participant_etb=challenge.extra_prize_per_participant_etb,
        question_count=challenge.question_count,
        duration_seconds=challenge.duration_seconds,
        max_participants=challenge.max_participants,
        participant_count=participant_count,
        created_at=challenge.created_at,
        starts_at=challenge.starts_at,
        category=challenge.category,
    )


async def _save_questions_for_challenge(
    session: DbSession,
    challenge_id: UUID,
    questions: list[QuestionIn],
) -> None:
    for idx, q in enumerate(questions, start=1):
        correct_count = sum(1 for c in q.choices if c.is_correct)
        if correct_count != 1:
            msg = (
                f"Question #{idx} ('{q.prompt[:30]}...') "
                f"must have exactly 1 correct answer (found {correct_count})."
            )
            raise AppError(code="invalid_choices", message=msg, status_code=422)

    await session.execute(delete(Question).where(Question.challenge_id == challenge_id))

    for pos, q in enumerate(questions, start=1):
        question = Question(challenge_id=challenge_id, position=pos, prompt=q.prompt)
        session.add(question)
        await session.flush()
        for c_pos, c in enumerate(q.choices, start=1):
            session.add(
                Choice(
                    question_id=question.id,
                    position=c_pos,
                    label=c.label,
                    is_correct=c.is_correct,
                )
            )


@router.get(
    "/challenges",
    response_model=list[AdminChallenge],
    summary="List all challenges with participant counts",
)
async def list_challenges(_role: AdminAccess, session: DbSession) -> list[AdminChallenge]:
    count_sq = (
        select(ChallengeEntry.challenge_id, func.count().label("cnt"))
        .group_by(ChallengeEntry.challenge_id)
        .subquery()
    )
    stmt = (
        select(Challenge, func.coalesce(count_sq.c.cnt, 0).label("participant_count"))
        .outerjoin(count_sq, count_sq.c.challenge_id == Challenge.id)
        .order_by(Challenge.created_at.desc())
    )
    rows = (await session.execute(stmt)).all()
    return [_build_challenge_response(challenge, int(count)) for challenge, count in rows]


@router.post(
    "/challenges",
    response_model=AdminChallenge,
    status_code=201,
    summary="Create a new challenge in draft, registration, or live status",
    dependencies=[Depends(require_owner)],
)
async def create_challenge(body: CreateChallengeRequest, session: DbSession) -> AdminChallenge:
    if body.status in ("registration", "live") and not body.questions:
        raise AppError(
            code="no_questions",
            message=(
                "Cannot create challenge as registration or live without adding questions first."
            ),
            status_code=400,
        )
    q_count = len(body.questions) if body.questions else body.question_count
    challenge = Challenge(
        title=body.title,
        description=body.description,
        entry_fee_etb=body.entry_fee_etb,
        minimum_participants=body.minimum_participants,
        base_prize_etb=body.base_prize_etb,
        extra_prize_per_participant_etb=body.extra_prize_per_participant_etb,
        question_count=q_count,
        duration_seconds=body.duration_seconds,
        max_participants=body.max_participants,
        category=body.category.strip().lower() if body.category and body.category.strip() else None,
        status=ChallengeStatus(body.status),
    )
    session.add(challenge)
    await session.flush()
    if body.questions:
        await _save_questions_for_challenge(session, challenge.id, body.questions)
    await session.commit()
    await session.refresh(challenge)

    if body.notify_users and challenge.status in (
        ChallengeStatus.REGISTRATION,
        ChallengeStatus.LIVE,
    ):
        from app.services.notify import TelegramNotifier

        await TelegramNotifier(session).broadcast_new_challenge(challenge)

    return _build_challenge_response(challenge, 0)


@router.patch(
    "/challenges/{challenge_id}/status",
    response_model=AdminChallenge,
    summary="Change the status of a challenge",
    dependencies=[Depends(require_owner)],
)
async def update_challenge_status(
    challenge_id: UUID,
    body: UpdateChallengeStatus,
    session: DbSession,
) -> AdminChallenge:
    challenge = await session.get(Challenge, challenge_id)
    if challenge is None:
        raise AppError(code="not_found", message="Challenge not found.", status_code=404)
    current = (
        challenge.status.value
        if hasattr(challenge.status, "value")
        else str(challenge.status)
    )
    allowed = _VALID_TRANSITIONS.get(current, [])
    if body.status not in allowed:
        raise AppError(
            code="invalid_transition",
            message=f"Cannot move from '{current}' to '{body.status}'.",
            status_code=409,
        )

    if body.status in ("ready", "live"):
        q_count = await session.scalar(
            select(func.count())
            .select_from(Question)
            .where(Question.challenge_id == challenge_id)
        )
        if not q_count:
            raise AppError(
                code="no_questions",
                message="Cannot make challenge ready or live without adding questions first.",
                status_code=400,
            )

    if body.status == "completed":
        now = datetime.now(UTC)
        challenge.status = ChallengeStatus.COMPLETED
        challenge.settled_at = now
        challenge.registration_closes_at = now
        from app.repositories.entries import EntryRepository
        from app.repositories.play import PlayRepository
        from app.services.challenges import calculate_prize
        from app.services.notify import TelegramNotifier

        await PlayRepository(session).close_expired(challenge, now)
        if challenge.winner_user_id is None:
            leaderboard_rows = await PlayRepository(session).leaderboard(challenge.id)
            if leaderboard_rows:
                winner_attempt, winner_user = leaderboard_rows[0]
                challenge.winner_user_id = winner_user.id
                entry_count = await EntryRepository(session).count(challenge.id)
                prize_amount = calculate_prize(
                    entry_count,
                    minimum_participants=challenge.minimum_participants,
                    base_prize_etb=challenge.base_prize_etb,
                    extra_prize_per_participant_etb=challenge.extra_prize_per_participant_etb,
                )
                if prize_amount > 0:
                    await WalletService(session).award_prize(
                        winner_user.id,
                        challenge_id=challenge.id,
                        challenge_title=challenge.title,
                        amount=prize_amount,
                    )
                    await TelegramNotifier(session).prize_won(
                        winner_user,
                        title=challenge.title,
                        amount=prize_amount,
                    )
    else:
        challenge.status = ChallengeStatus(body.status)

    await session.commit()
    await session.refresh(challenge)

    if body.notify_users and challenge.status in (
        ChallengeStatus.REGISTRATION,
        ChallengeStatus.LIVE,
    ):
        from app.services.notify import TelegramNotifier

        await TelegramNotifier(session).broadcast_new_challenge(challenge)

    # participant count after status change
    count_sq = (
        select(ChallengeEntry.challenge_id, func.count().label("cnt"))
        .group_by(ChallengeEntry.challenge_id)
        .subquery()
    )
    stmt = (
        select(func.coalesce(count_sq.c.cnt, 0))
        .where(count_sq.c.challenge_id == challenge.id)
    )
    count = int(await session.scalar(stmt) or 0)
    return _build_challenge_response(challenge, count)


@router.post(
    "/challenges/{challenge_id}/notify",
    response_model=NotifyChallengeResponse,
    summary="Send Telegram notification about this challenge to all registered players",
    dependencies=[Depends(require_owner)],
)
async def notify_challenge_players(
    challenge_id: UUID,
    session: DbSession,
) -> NotifyChallengeResponse:
    challenge = await session.get(Challenge, challenge_id)
    if challenge is None:
        raise AppError(code="not_found", message="Challenge not found.", status_code=404)
    if challenge.status not in (
        ChallengeStatus.REGISTRATION,
        ChallengeStatus.READY,
        ChallengeStatus.LIVE,
    ):
        raise AppError(
            code="challenge_not_open",
            message="Can only notify players about open or live challenges.",
            status_code=400,
        )
    from app.services.notify import TelegramNotifier

    result = await TelegramNotifier(session).broadcast_new_challenge(challenge)
    return NotifyChallengeResponse(
        challenge_id=challenge.id,
        sent=result["sent"],
        failed=result["failed"],
        total=result["total"],
    )


@router.delete(
    "/challenges/{challenge_id}",
    status_code=204,
    summary="Delete a draft or cancelled challenge",
    dependencies=[Depends(require_owner)],
)
async def delete_challenge(challenge_id: UUID, session: DbSession) -> None:
    challenge = await session.get(Challenge, challenge_id)
    if challenge is None:
        raise AppError(code="not_found", message="Challenge not found.", status_code=404)
    if challenge.status not in (ChallengeStatus.DRAFT, ChallengeStatus.CANCELLED):
        raise AppError(
            code="challenge_active",
            message="Can only delete challenges in draft or cancelled status.",
            status_code=409,
        )
    entry_count = await session.scalar(
        select(func.count())
        .select_from(ChallengeEntry)
        .where(ChallengeEntry.challenge_id == challenge_id)
    )
    if entry_count:
        raise AppError(
            code="challenge_has_entries",
            message="Cannot delete a challenge that players have already joined.",
            status_code=409,
        )
    await session.execute(delete(Question).where(Question.challenge_id == challenge_id))
    await session.delete(challenge)
    await session.commit()


class AdminChoiceView(BaseModel):
    id: UUID
    position: int
    label: str
    is_correct: bool


class AdminQuestionView(BaseModel):
    id: UUID
    position: int
    prompt: str
    choices: list[AdminChoiceView]


@router.get(
    "/challenges/{challenge_id}/questions",
    response_model=list[AdminQuestionView],
    summary="List all questions for a challenge",
)
async def list_challenge_questions(
    challenge_id: UUID,
    _role: AdminAccess,
    session: DbSession,
) -> list[AdminQuestionView]:
    stmt = (
        select(Question)
        .where(Question.challenge_id == challenge_id)
        .options(selectinload(Question.choices))
        .order_by(Question.position)
    )
    rows = (await session.scalars(stmt)).all()
    return [
        AdminQuestionView(
            id=q.id,
            position=q.position,
            prompt=q.prompt,
            choices=[
                AdminChoiceView(
                    id=c.id,
                    position=c.position,
                    label=c.label,
                    is_correct=c.is_correct,
                )
                for c in q.choices
            ],
        )
        for q in rows
    ]


@router.post(
    "/challenges/{challenge_id}/questions",
    response_model=dict[str, Any],
    summary="Import or replace questions for a challenge",
    dependencies=[Depends(require_owner)],
)
async def import_questions(
    challenge_id: UUID,
    body: ImportQuestionsRequest,
    session: DbSession,
) -> dict[str, Any]:
    challenge = await session.get(Challenge, challenge_id)
    if challenge is None:
        raise AppError(code="not_found", message="Challenge not found.", status_code=404)
    if challenge.status not in (
        ChallengeStatus.DRAFT,
        ChallengeStatus.REGISTRATION,
        ChallengeStatus.READY,
    ):
        raise AppError(
            code="challenge_active",
            message="Cannot modify questions on a live or completed challenge.",
            status_code=409,
        )

    await _save_questions_for_challenge(session, challenge_id, body.questions)
    challenge.question_count = len(body.questions)
    await session.commit()

    return {
        "status": "ok",
        "question_count": len(body.questions),
        "message": f"Successfully imported {len(body.questions)} questions.",
    }


# ---------------------------------------------------------------------------
# Player management
# ---------------------------------------------------------------------------


def _build_player_response(user: User, balance_etb: Decimal) -> AdminPlayer:
    return AdminPlayer(
        id=user.id,
        telegram_id=user.telegram_id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        is_blocked=user.is_blocked,
        created_at=user.created_at,
        balance_etb=balance_etb,
    )


@router.get(
    "/players",
    response_model=list[AdminPlayer],
    summary="List players with wallet balances",
)
async def list_players(
    _role: AdminAccess,
    session: DbSession,
    search: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[AdminPlayer]:
    stmt = (
        select(User, func.coalesce(Wallet.balance_etb, 0).label("balance_etb"))
        .outerjoin(Wallet, Wallet.user_id == User.id)
        .order_by(User.created_at.desc())
        .limit(limit)
    )
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(User.username.ilike(pattern) | User.first_name.ilike(pattern))
    rows = (await session.execute(stmt)).all()
    return [_build_player_response(user, Decimal(balance or 0)) for user, balance in rows]


@router.post(
    "/players/{user_id}/block",
    response_model=AdminPlayer,
    summary="Block a player account",
    dependencies=[Depends(require_owner)],
)
async def block_player(user_id: UUID, session: DbSession) -> AdminPlayer:
    user = await session.get(User, user_id)
    if user is None:
        raise AppError(code="not_found", message="Player not found.", status_code=404)
    user.is_blocked = True
    await session.commit()
    await session.refresh(user)
    balance = await session.scalar(
        select(Wallet.balance_etb).where(Wallet.user_id == user.id)
    )
    return _build_player_response(user, Decimal(balance or 0))


@router.post(
    "/players/{user_id}/unblock",
    response_model=AdminPlayer,
    summary="Unblock a player account",
    dependencies=[Depends(require_owner)],
)
async def unblock_player(user_id: UUID, session: DbSession) -> AdminPlayer:
    user = await session.get(User, user_id)
    if user is None:
        raise AppError(code="not_found", message="Player not found.", status_code=404)
    user.is_blocked = False
    await session.commit()
    await session.refresh(user)
    balance = await session.scalar(
        select(Wallet.balance_etb).where(Wallet.user_id == user.id)
    )
    return _build_player_response(user, Decimal(balance or 0))


# ---------------------------------------------------------------------------
# Referral configuration & stats
# ---------------------------------------------------------------------------


class ReferralRewardConfig(BaseModel):
    reward_amount_etb: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    updated_at: datetime | None = None


class AdminReferralOverview(BaseModel):
    reward_amount_etb: Decimal
    total_referrals: int
    rewarded_referrals: int
    total_payout_etb: Decimal


@router.get(
    "/referrals/config",
    response_model=ReferralRewardConfig,
    summary="Get current referral bonus per person",
)
@router.get(
    "/referral-reward",
    response_model=ReferralRewardConfig,
    include_in_schema=False,
)
async def get_referral_reward_config(
    _role: AdminAccess,
    session: DbSession,
) -> ReferralRewardConfig:
    from app.services.referrals import ReferralService

    service = ReferralService(session)
    config = await service.referrals.get_config()
    if config is not None:
        return ReferralRewardConfig(
            reward_amount_etb=config.reward_amount_etb,
            updated_at=config.updated_at,
        )
    return ReferralRewardConfig(
        reward_amount_etb=await service.get_reward_amount(),
        updated_at=None,
    )


@router.put(
    "/referrals/config",
    response_model=ReferralRewardConfig,
    summary="Update referral bonus per person decided by admin",
)
@router.put(
    "/referral-reward",
    response_model=ReferralRewardConfig,
    include_in_schema=False,
)
async def update_referral_reward_config(
    body: ReferralRewardConfig,
    _role: AdminAccess,
    session: DbSession,
) -> ReferralRewardConfig:
    from app.services.referrals import ReferralService

    service = ReferralService(session)
    config = await service.referrals.update_reward_amount(body.reward_amount_etb)
    return ReferralRewardConfig(
        reward_amount_etb=config.reward_amount_etb,
        updated_at=config.updated_at,
    )


@router.get(
    "/referrals/overview",
    response_model=AdminReferralOverview,
    summary="Get referral summary and stats for admins",
)
async def get_admin_referral_overview(
    _role: AdminAccess,
    session: DbSession,
) -> AdminReferralOverview:
    from app.models.referral import Referral
    from app.services.referrals import ReferralService

    service = ReferralService(session)
    reward_amount = await service.get_reward_amount()
    total = await session.scalar(
        select(func.count(func.distinct(Referral.referred_id)))
    ) or 0
    rewarded = await session.scalar(
        select(func.count(func.distinct(Referral.referred_id))).where(Referral.is_rewarded.is_(True))
    ) or 0
    payout = await session.scalar(
        select(func.coalesce(func.sum(Referral.reward_amount_etb), Decimal("0"))).where(
            Referral.is_rewarded.is_(True)
        )
    ) or Decimal("0")
    return AdminReferralOverview(
        reward_amount_etb=reward_amount,
        total_referrals=int(total),
        rewarded_referrals=int(rewarded),
        total_payout_etb=Decimal(payout),
    )


@router.get(
    "/spin",
    summary="Get daily spin configuration and statistics",
)
async def get_admin_spin_overview(
    _role: AdminAccess,
    session: DbSession,
):
    from app.services.daily_spin import DailySpinService

    service = DailySpinService(session)
    return await service.admin_overview()


@router.put(
    "/spin",
    summary="Update daily spin availability, cooldown, and segments",
)
async def update_admin_spin_config(
    body: dict,
    _role: AdminAccess,
    session: DbSession,
):
    from app.schemas.daily_spin import AdminSpinConfigUpdate
    from app.services.daily_spin import DailySpinService

    config_update = AdminSpinConfigUpdate(**body)
    service = DailySpinService(session)
    return await service.admin_update_config(config_update)


# ---------------------------------------------------------------------------
# Question Bank & Categories management
# ---------------------------------------------------------------------------


class AdminCategoryView(BaseModel):
    id: str
    name: str
    icon: str
    description: str | None = None
    is_active: bool
    question_count: int
    created_at: datetime


class CreateCategoryRequest(BaseModel):
    id: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=128)
    icon: str = Field(default="🎯", max_length=16)
    description: str | None = None


class UpdateCategoryRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=128)
    icon: str | None = Field(default=None, max_length=16)
    description: str | None = None
    is_active: bool | None = None


class CreateBankQuestionRequest(BaseModel):
    category: str = Field(min_length=2, max_length=64)
    prompt: str = Field(min_length=3)
    choices: list[ChoiceIn] = Field(min_length=2, max_length=6)


class ImportBankQuestionsRequest(BaseModel):
    category: str = Field(min_length=2, max_length=64)
    questions: list[QuestionIn] = Field(min_length=1, max_length=200)


class BankQuestionView(BaseModel):
    id: UUID
    category: str
    prompt: str
    created_at: datetime
    choices: list[AdminChoiceView]


@router.get(
    "/categories",
    response_model=list[AdminCategoryView],
    summary="List all question categories with their question counts",
)
async def list_admin_categories(
    _role: AdminAccess,
    session: DbSession,
) -> list[AdminCategoryView]:
    count_sq = (
        select(Question.category.label("cat_id"), func.count(Question.id).label("q_count"))
        .where(Question.category.is_not(None))
        .group_by(Question.category)
        .subquery()
    )
    stmt = (
        select(QuestionCategory, func.coalesce(count_sq.c.q_count, 0).label("question_count"))
        .outerjoin(count_sq, count_sq.c.cat_id == QuestionCategory.id)
        .order_by(QuestionCategory.name.asc())
    )
    rows = (await session.execute(stmt)).all()
    return [
        AdminCategoryView(
            id=cat.id,
            name=cat.name,
            icon=cat.icon,
            description=cat.description,
            is_active=cat.is_active,
            question_count=int(cnt),
            created_at=cat.created_at,
        )
        for cat, cnt in rows
    ]


@router.post(
    "/categories",
    response_model=AdminCategoryView,
    status_code=201,
    summary="Create a new question category",
    dependencies=[Depends(require_owner)],
)
async def create_admin_category(
    body: CreateCategoryRequest,
    session: DbSession,
) -> AdminCategoryView:
    slug = body.id.strip().lower()
    existing = await session.get(QuestionCategory, slug)
    if existing:
        raise AppError(code="duplicate_category", message=f"Category '{slug}' already exists.", status_code=409)
    category = QuestionCategory(
        id=slug,
        name=body.name.strip(),
        icon=body.icon.strip() or "🎯",
        description=body.description.strip() if body.description else None,
        is_active=True,
    )
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return AdminCategoryView(
        id=category.id,
        name=category.name,
        icon=category.icon,
        description=category.description,
        is_active=category.is_active,
        question_count=0,
        created_at=category.created_at,
    )


@router.patch(
    "/categories/{category_id}",
    response_model=AdminCategoryView,
    summary="Update a question category",
    dependencies=[Depends(require_owner)],
)
async def update_admin_category(
    category_id: str,
    body: UpdateCategoryRequest,
    session: DbSession,
) -> AdminCategoryView:
    cat = await session.get(QuestionCategory, category_id.strip().lower())
    if not cat:
        raise AppError(code="not_found", message="Category not found.", status_code=404)
    if body.name is not None:
        cat.name = body.name.strip()
    if body.icon is not None:
        cat.icon = body.icon.strip()
    if body.description is not None:
        cat.description = body.description.strip() if body.description else None
    if body.is_active is not None:
        cat.is_active = body.is_active
    await session.commit()
    await session.refresh(cat)
    count = await session.scalar(
        select(func.count(Question.id)).where(Question.category == cat.id)
    ) or 0
    return AdminCategoryView(
        id=cat.id,
        name=cat.name,
        icon=cat.icon,
        description=cat.description,
        is_active=cat.is_active,
        question_count=int(count),
        created_at=cat.created_at,
    )


@router.delete(
    "/categories/{category_id}",
    status_code=204,
    summary="Delete a question category",
    dependencies=[Depends(require_owner)],
)
async def delete_admin_category(
    category_id: str,
    session: DbSession,
) -> None:
    cat = await session.get(QuestionCategory, category_id.strip().lower())
    if not cat:
        raise AppError(code="not_found", message="Category not found.", status_code=404)
    await session.delete(cat)
    await session.commit()


@router.get(
    "/questions",
    response_model=list[BankQuestionView],
    summary="List questions in the question bank by category",
)
async def list_bank_questions(
    _role: AdminAccess,
    session: DbSession,
    category: str | None = None,
    limit: int = 100,
) -> list[BankQuestionView]:
    stmt = (
        select(Question)
        .options(selectinload(Question.choices))
        .order_by(Question.created_at.desc())
        .limit(limit)
    )
    if category:
        stmt = stmt.where(Question.category == category.strip().lower())
    questions = (await session.scalars(stmt)).all()
    return [
        BankQuestionView(
            id=q.id,
            category=q.category or "general",
            prompt=q.prompt,
            created_at=q.created_at,
            choices=[
                AdminChoiceView(
                    id=c.id,
                    position=c.position,
                    label=c.label,
                    is_correct=c.is_correct,
                )
                for c in q.choices
            ],
        )
        for q in questions
    ]


@router.post(
    "/questions",
    response_model=BankQuestionView,
    status_code=201,
    summary="Add a single question to the question bank",
    dependencies=[Depends(require_owner)],
)
async def create_bank_question(
    body: CreateBankQuestionRequest,
    session: DbSession,
) -> BankQuestionView:
    cat_slug = body.category.strip().lower()
    cat = await session.get(QuestionCategory, cat_slug)
    if not cat:
        raise AppError(code="category_not_found", message=f"Category '{body.category}' does not exist.", status_code=404)
    correct_count = sum(1 for c in body.choices if c.is_correct)
    if correct_count != 1:
        raise AppError(code="invalid_choices", message=f"Question must have exactly 1 correct answer (found {correct_count}).", status_code=422)

    q = Question(
        category=cat_slug,
        prompt=body.prompt.strip(),
        challenge_id=None,
        position=None,
    )
    session.add(q)
    await session.flush()
    for idx, c in enumerate(body.choices, start=1):
        session.add(
            Choice(
                question_id=q.id,
                position=idx,
                label=c.label.strip(),
                is_correct=c.is_correct,
            )
        )
    await session.commit()
    await session.refresh(q)
    stmt = select(Question).options(selectinload(Question.choices)).where(Question.id == q.id)
    saved = await session.scalar(stmt)
    assert saved is not None
    return BankQuestionView(
        id=saved.id,
        category=saved.category or cat_slug,
        prompt=saved.prompt,
        created_at=saved.created_at,
        choices=[
            AdminChoiceView(id=c.id, position=c.position, label=c.label, is_correct=c.is_correct)
            for c in saved.choices
        ],
    )


@router.post(
    "/questions/import",
    response_model=dict[str, Any],
    status_code=201,
    summary="Bulk import questions into a question bank category",
    dependencies=[Depends(require_owner)],
)
async def import_bank_questions(
    body: ImportBankQuestionsRequest,
    session: DbSession,
) -> dict[str, Any]:
    cat_slug = body.category.strip().lower()
    cat = await session.get(QuestionCategory, cat_slug)
    if not cat:
        raise AppError(code="category_not_found", message=f"Category '{body.category}' does not exist.", status_code=404)

    for idx, q_in in enumerate(body.questions, start=1):
        correct_count = sum(1 for c in q_in.choices if c.is_correct)
        if correct_count != 1:
            raise AppError(
                code="invalid_choices",
                message=f"Question #{idx} ('{q_in.prompt[:30]}...') must have exactly 1 correct answer.",
                status_code=422,
            )

    added_count = 0
    for q_in in body.questions:
        q = Question(
            category=cat_slug,
            prompt=q_in.prompt.strip(),
            challenge_id=None,
            position=None,
        )
        session.add(q)
        await session.flush()
        for c_idx, c in enumerate(q_in.choices, start=1):
            session.add(
                Choice(
                    question_id=q.id,
                    position=c_idx,
                    label=c.label.strip(),
                    is_correct=c.is_correct,
                )
            )
        added_count += 1

    await session.commit()
    return {
        "status": "ok",
        "category": cat_slug,
        "imported_count": added_count,
        "message": f"Successfully imported {added_count} questions into {cat.name}.",
    }


@router.delete(
    "/questions/{question_id}",
    status_code=204,
    summary="Delete a question from the question bank",
    dependencies=[Depends(require_owner)],
)
async def delete_bank_question(
    question_id: UUID,
    session: DbSession,
) -> None:
    q = await session.get(Question, question_id)
    if not q:
        raise AppError(code="not_found", message="Question not found.", status_code=404)
    await session.delete(q)
    await session.commit()

