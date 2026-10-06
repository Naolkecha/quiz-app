"""Play a challenge before the prize minimum and land on the leaderboard."""

import time
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attempt import Attempt
from app.models.challenge import Challenge, ChallengeStatus
from app.models.question import Choice, Question
from app.tests.constants import TEST_BOT_TOKEN
from app.tests.init_data_factory import signed_init_data, telegram_user


def _token(client_body: dict[str, object]) -> str:
    token = client_body["session_token"]
    assert isinstance(token, str)
    return token


def _init_data(*, telegram_id: int, first_name: str, username: str) -> str:
    return signed_init_data(
        TEST_BOT_TOKEN,
        {
            "auth_date": str(int(time.time())),
            "query_id": "AAEplay",
            "user": telegram_user(
                telegram_id=telegram_id,
                first_name=first_name,
                last_name="Bekele",
                username=username,
            ),
        },
    )


async def _login(client: AsyncClient, telegram_id: int, first_name: str, username: str) -> str:
    response = await client.post(
        "/api/auth/telegram",
        json={
            "init_data": _init_data(
                telegram_id=telegram_id, first_name=first_name, username=username
            )
        },
    )
    assert response.status_code == 200
    return _token(response.json())


async def _join(client: AsyncClient, challenge_id: UUID, token: str) -> None:
    response = await client.post(
        f"/api/challenges/{challenge_id}/join",
        headers={"Authorization": f"Bearer {token}"},
        json={"accepted_terms": True},
    )
    assert response.status_code == 200
    assert response.json()["joined"] is True


async def _challenge(session: AsyncSession) -> Challenge:
    challenge = Challenge(
        title="Speed round",
        description="Two questions.",
        question_count=2,
        duration_seconds=30,
        status=ChallengeStatus.LIVE,
        starts_at=datetime.now(UTC),
        entry_fee_etb=Decimal("0"),
    )
    session.add(challenge)
    await session.flush()
    for position, prompt, correct, wrong in (
        (1, "Capital of Ethiopia?", "Addis Ababa", "Nairobi"),
        (2, "What is 2 + 2?", "4", "5"),
    ):
        question = Question(challenge_id=challenge.id, position=position, prompt=prompt)
        session.add(question)
        await session.flush()
        session.add(Choice(question_id=question.id, position=1, label=correct, is_correct=True))
        session.add(Choice(question_id=question.id, position=2, label=wrong, is_correct=False))
    await session.commit()
    return challenge


async def _correct_answers(session: AsyncSession, challenge_id: UUID) -> list[dict[str, str]]:
    questions = list(
        (
            await session.scalars(
                select(Question)
                .where(Question.challenge_id == challenge_id)
                .order_by(Question.position)
            )
        ).all()
    )
    answers: list[dict[str, str]] = []
    for question in questions:
        choice = await session.scalar(
            select(Choice).where(Choice.question_id == question.id, Choice.is_correct.is_(True))
        )
        assert choice is not None
        answers.append({"question_id": str(question.id), "choice_id": str(choice.id)})
    return answers


async def test_play_hides_correct_answers_and_ranks_the_score(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    challenge = await _challenge(session)
    token = await _login(client, 61001, "Sara", "sara_play")
    headers = {"Authorization": f"Bearer {token}"}

    blocked = await client.post(f"/api/challenges/{challenge.id}/play", headers=headers)
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "challenge_not_joined"

    await _join(client, challenge.id, token)
    not_started = await client.get(f"/api/challenges/{challenge.id}/attempt", headers=headers)
    assert not_started.status_code == 404
    joined_challenge = await client.get(f"/api/challenges/{challenge.id}")
    assert joined_challenge.json()["participant_count"] == 1

    started = await client.post(f"/api/challenges/{challenge.id}/play", headers=headers)
    assert started.status_code == 200
    body = started.json()
    assert body["status"] == "in_progress"
    assert body["question_count"] == 2
    assert "is_correct" not in started.text
    assert [question["prompt"] for question in body["questions"]] == [
        "Capital of Ethiopia?",
        "What is 2 + 2?",
    ]

    finished = await client.post(
        f"/api/challenges/{challenge.id}/finish",
        headers=headers,
        json={"answers": await _correct_answers(session, challenge.id)},
    )
    assert finished.status_code == 200
    result = finished.json()
    assert result["status"] == "finished"
    assert result["score"] == 2
    assert result["rank"] == 1
    assert result["questions"] is None
    assert result["leaderboard"][0]["display_name"] == "Sara (@sara_play)"
    assert result["leaderboard"][0]["score"] == 2

    today = await client.get("/api/challenges/today")
    assert today.status_code == 200
    assert today.json()["participant_count"] == 1
    assert today.json()["is_confirmed"] is False


async def test_faster_equal_score_ranks_first(client: AsyncClient, session: AsyncSession) -> None:
    challenge = await _challenge(session)
    slow = await _login(client, 61002, "Liya", "liya_slow")
    fast = await _login(client, 61003, "Noah", "noah_fast")
    answers = await _correct_answers(session, challenge.id)

    await _join(client, challenge.id, slow)
    await client.post(
        f"/api/challenges/{challenge.id}/play",
        headers={"Authorization": f"Bearer {slow}"},
    )
    slow_attempt = await session.scalar(select(Attempt).where(Attempt.challenge_id == challenge.id))
    assert slow_attempt is not None
    slow_attempt.started_at = datetime.now(UTC) - timedelta(seconds=12)
    await session.commit()
    slow_finish = await client.post(
        f"/api/challenges/{challenge.id}/finish",
        headers={"Authorization": f"Bearer {slow}"},
        json={"answers": answers},
    )
    assert slow_finish.status_code == 200
    assert slow_finish.json()["score"] == 2

    await _join(client, challenge.id, fast)
    await client.post(
        f"/api/challenges/{challenge.id}/play", headers={"Authorization": f"Bearer {fast}"}
    )
    fast_finish = await client.post(
        f"/api/challenges/{challenge.id}/finish",
        headers={"Authorization": f"Bearer {fast}"},
        json={"answers": answers},
    )
    assert fast_finish.status_code == 200
    board = fast_finish.json()["leaderboard"]
    assert [row["display_name"] for row in board] == ["Noah (@noah_fast)", "Liya (@liya_slow)"]
    assert fast_finish.json()["rank"] == 1


async def test_late_submission_scores_zero(client: AsyncClient, session: AsyncSession) -> None:
    challenge = await _challenge(session)
    token = await _login(client, 61004, "Hana", "hana_late")
    headers = {"Authorization": f"Bearer {token}"}
    await _join(client, challenge.id, token)
    await client.post(f"/api/challenges/{challenge.id}/play", headers=headers)
    attempt = await session.scalar(select(Attempt).where(Attempt.challenge_id == challenge.id))
    assert attempt is not None
    attempt.started_at = datetime.now(UTC) - timedelta(seconds=90)
    await session.commit()
    finished = await client.post(
        f"/api/challenges/{challenge.id}/finish",
        headers=headers,
        json={"answers": await _correct_answers(session, challenge.id)},
    )
    assert finished.status_code == 200
    assert finished.json()["score"] == 0
    assert finished.json()["leaderboard"][0]["score"] == 0
