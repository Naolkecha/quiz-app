"""Start a round, score it on the server, and rank finished plays."""

from datetime import timedelta
from typing import Literal
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, PlayError
from app.models.attempt import Attempt, AttemptAnswer, AttemptStatus
from app.models.challenge import PUBLIC_STATUSES, Challenge, ChallengeStatus
from app.models.question import Question
from app.models.user import User
from app.repositories.challenges import ChallengeRepository
from app.repositories.entries import EntryRepository
from app.repositories.play import SUBMIT_GRACE_SECONDS, PlayRepository, utc_now
from app.schemas.play import (
    AnswerIn,
    AttemptView,
    LeaderboardEntry,
    PlayChoice,
    PlayQuestion,
)
from app.services.free_rounds import FreeRoundService


class PlayService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.challenges = ChallengeRepository(session)
        self.entries = EntryRepository(session)
        self.plays = PlayRepository(session)

    async def current(self, challenge_id: UUID, user: User) -> AttemptView | None:
        challenge = await self._playable(challenge_id)
        if await self.plays.close_expired(challenge, utc_now()):
            await self.session.commit()
        attempt = await self.plays.get_attempt(challenge_id, user.id)
        if attempt is None:
            return None
        return await self._view(challenge, attempt, user)

    async def start(self, challenge_id: UUID, user: User) -> AttemptView:
        challenge = await self._playable(challenge_id)
        now = utc_now()
        if await self.plays.close_expired(challenge, now):
            await self.session.commit()
        existing = await self.plays.get_attempt(challenge_id, user.id)
        if existing is not None:
            return await self._view(challenge, existing, user)
        entry = await self.entries.get(challenge_id, user.id)
        if entry is None:
            raise PlayError(
                "challenge_not_joined",
                "Join this challenge and accept its terms before starting.",
            )
        if challenge.status == ChallengeStatus.COMPLETED:
            raise PlayError("challenge_closed", "This challenge is closed.")
        questions = await self.plays.questions(challenge.id)
        if not questions:
            raise PlayError("questions_missing", "This challenge has no questions yet.")
        attempt = Attempt(
            challenge_id=challenge.id,
            user_id=user.id,
            status=AttemptStatus.IN_PROGRESS,
            started_at=now,
        )
        self.session.add(attempt)
        try:
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            existing = await self.plays.get_attempt(challenge_id, user.id)
            if existing is None:
                raise
            return await self._view(challenge, existing, user)
        return await self._view(challenge, attempt, user)

    async def finish(self, challenge_id: UUID, user: User, answers: list[AnswerIn]) -> AttemptView:
        challenge = await self._playable(challenge_id)
        now = utc_now()
        await self.plays.close_expired(challenge, now)
        attempt = await self.plays.lock_attempt(challenge_id, user.id)
        if attempt is None:
            raise NotFoundError("Start the challenge before submitting answers.")
        if attempt.status == AttemptStatus.FINISHED:
            await self.session.commit()
            return await self._view(challenge, attempt, user)

        deadline = attempt.started_at + timedelta(
            seconds=challenge.duration_seconds + SUBMIT_GRACE_SECONDS
        )
        questions = await self.plays.questions(challenge.id)
        if now > deadline:
            score = 0
            elapsed_ms = challenge.duration_seconds * 1000
        else:
            score = _score(questions, answers)
            elapsed_ms = max(0, int((now - attempt.started_at).total_seconds() * 1000))
            for answer in _unique_answers(answers):
                self.session.add(
                    AttemptAnswer(
                        attempt_id=attempt.id,
                        question_id=answer.question_id,
                        choice_id=answer.choice_id,
                    )
                )
        attempt.status = AttemptStatus.FINISHED
        attempt.score = score
        attempt.elapsed_ms = elapsed_ms
        attempt.finished_at = now
        await self.session.commit()
        from app.services.referrals import ReferralService

        await ReferralService(self.session).reward_referrer_if_eligible(user.id)
        await self.session.commit()
        view = await self._view(challenge, attempt, user)
        await FreeRoundService(self.session).settle_if_ready(challenge)
        return view

    async def leaderboard(self, challenge_id: UUID) -> list[LeaderboardEntry]:
        challenge = await self._public(challenge_id)
        if await self.plays.close_expired(challenge, utc_now()):
            await self.session.commit()
        rows = await self.plays.leaderboard(challenge_id)
        return [
            _entry(rank, attempt, player) for rank, (attempt, player) in enumerate(rows, start=1)
        ]

    async def _playable(self, challenge_id: UUID) -> Challenge:
        challenge = await self._public(challenge_id)
        if challenge.status not in PUBLIC_STATUSES:
            raise PlayError("challenge_closed", "This challenge is not open.")
        return challenge

    async def _public(self, challenge_id: UUID) -> Challenge:
        challenge = await self.session.get(Challenge, challenge_id)
        if challenge is None or challenge.status not in PUBLIC_STATUSES:
            raise NotFoundError("No challenge is scheduled.")
        return challenge

    async def _view(self, challenge: Challenge, attempt: Attempt, user: User) -> AttemptView:
        questions = await self.plays.questions(challenge.id)
        rows = await self.plays.leaderboard(challenge.id)
        board = [_entry(rank, row, player) for rank, (row, player) in enumerate(rows, start=1)]
        rank = next((entry.rank for entry in board if entry.user_id == user.id), None)
        visible = (
            [_question(question) for question in questions]
            if attempt.status == AttemptStatus.IN_PROGRESS
            else None
        )
        status: Literal["in_progress", "finished"] = (
            "finished" if attempt.status == AttemptStatus.FINISHED else "in_progress"
        )
        return AttemptView(
            attempt_id=attempt.id,
            status=status,
            started_at=attempt.started_at,
            server_now=utc_now(),
            duration_seconds=challenge.duration_seconds,
            question_count=len(questions),
            questions=visible,
            score=attempt.score,
            elapsed_ms=attempt.elapsed_ms,
            rank=rank,
            leaderboard=board if status == "finished" else [],
        )


def _question(question: Question) -> PlayQuestion:
    return PlayQuestion(
        id=question.id,
        position=question.position,
        prompt=question.prompt,
        choices=[PlayChoice(id=choice.id, label=choice.label) for choice in question.choices],
    )


def _entry(rank: int, attempt: Attempt, player: User) -> LeaderboardEntry:
    name = f"{player.first_name} (@{player.username})" if player.username else player.first_name
    return LeaderboardEntry(
        rank=rank,
        user_id=player.id,
        display_name=name,
        score=attempt.score or 0,
        elapsed_ms=attempt.elapsed_ms or 0,
    )


def _unique_answers(answers: list[AnswerIn]) -> list[AnswerIn]:
    seen: set[UUID] = set()
    unique: list[AnswerIn] = []
    for answer in answers:
        if answer.question_id in seen:
            raise PlayError("duplicate_answer", "Each question can be answered once.")
        seen.add(answer.question_id)
        unique.append(answer)
    return unique


def _score(questions: list[Question], answers: list[AnswerIn]) -> int:
    by_id = {question.id: question for question in questions}
    correct = 0
    for answer in _unique_answers(answers):
        question = by_id.get(answer.question_id)
        if question is None:
            raise PlayError("answer_invalid", "That question is not part of this challenge.")
        choice = next((item for item in question.choices if item.id == answer.choice_id), None)
        if choice is None:
            raise PlayError("answer_invalid", "That choice does not belong to the question.")
        if choice.is_correct:
            correct += 1
    return correct
