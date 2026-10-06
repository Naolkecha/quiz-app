"""Free rounds fill up, pay the top player, and open the next round."""

import time
from datetime import UTC, datetime
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.challenge import Challenge, ChallengeStatus
from app.models.question import Choice, Question
from app.tests.constants import TEST_BOT_TOKEN
from app.tests.init_data_factory import signed_init_data, telegram_user


async def _login(client: AsyncClient, telegram_id: int, username: str) -> str:
    init_data = signed_init_data(
        TEST_BOT_TOKEN,
        {
            "auth_date": str(int(time.time())),
            "query_id": f"AAEfree{telegram_id}",
            "user": telegram_user(
                telegram_id=telegram_id,
                first_name=f"P{telegram_id}",
                last_name="Free",
                username=username,
            ),
        },
    )
    response = await client.post("/api/auth/telegram", json={"init_data": init_data})
    assert response.status_code == 200
    return response.json()["session_token"]


async def _question_bank(session: AsyncSession) -> None:
    source = Challenge(
        title="Question source",
        description="Bank for free rounds.",
        question_count=12,
        duration_seconds=30,
        status=ChallengeStatus.DRAFT,
        starts_at=datetime.now(UTC),
    )
    session.add(source)
    await session.flush()
    for position in range(1, 13):
        question = Question(challenge_id=source.id, position=position, prompt=f"Q{position}?")
        session.add(question)
        await session.flush()
        session.add(Choice(question_id=question.id, position=1, label="right", is_correct=True))
        session.add(Choice(question_id=question.id, position=2, label="wrong", is_correct=False))
    await session.commit()


async def test_free_round_pays_winner_and_opens_next(
    client: AsyncClient,
    session: AsyncSession,
) -> None:
    await _question_bank(session)

    listed = (await client.get("/api/challenges")).json()
    free = [item for item in listed if item["is_free"]]
    assert sorted(item["max_participants"] for item in free) == [10, 20, 50]
    ten = next(item for item in free if item["max_participants"] == 10)
    assert ten["entry_fee_etb"] == "0.00"
    assert ten["current_prize_etb"] == "10.00"
    assert ten["spots_left"] == 10

    tokens = [await _login(client, 63000 + n, f"free_player_{n}") for n in range(10)]
    for token in tokens:
        joined = await client.post(
            f"/api/challenges/{ten['id']}/join",
            headers={"Authorization": f"Bearer {token}"},
            json={"accepted_terms": True},
        )
        assert joined.status_code == 200

    late = await _login(client, 63099, "free_player_late")
    full = await client.post(
        f"/api/challenges/{ten['id']}/join",
        headers={"Authorization": f"Bearer {late}"},
        json={"accepted_terms": True},
    )
    assert full.status_code == 409
    assert full.json()["detail"]["code"] == "challenge_full"

    for index, token in enumerate(tokens):
        headers = {"Authorization": f"Bearer {token}"}
        started = (await client.post(f"/api/challenges/{ten['id']}/play", headers=headers)).json()
        answers = []
        if index == 0:
            questions = await session.scalars(
                select(Question).where(Question.challenge_id == ten["id"])
            )
            for question in questions:
                right = await session.scalar(
                    select(Choice).where(
                        Choice.question_id == question.id, Choice.is_correct.is_(True)
                    )
                )
                assert right is not None
                answers.append({"question_id": str(question.id), "choice_id": str(right.id)})
        assert started["status"] == "in_progress"
        finished = await client.post(
            f"/api/challenges/{ten['id']}/finish", headers=headers, json={"answers": answers}
        )
        assert finished.status_code == 200

    settled = (await client.get(f"/api/challenges/{ten['id']}")).json()
    assert settled["status"] == "completed"
    assert settled["winner_name"] == "P63000"

    winner_wallet = (
        await client.get("/api/wallet", headers={"Authorization": f"Bearer {tokens[0]}"})
    ).json()
    assert winner_wallet["balance_etb"] == "10.00"
    prizes = [row for row in winner_wallet["transactions"] if row["entry_type"] == "prize"]
    assert len(prizes) == 1
    assert prizes[0]["amount_etb"] == "10.00"

    loser_wallet = (
        await client.get("/api/wallet", headers={"Authorization": f"Bearer {tokens[1]}"})
    ).json()
    assert loser_wallet["balance_etb"] == "0.00"

    reopened = (await client.get("/api/challenges")).json()
    next_ten = [item for item in reopened if item["is_free"] and item["max_participants"] == 10]
    assert len(next_ten) == 1
    assert next_ten[0]["id"] != ten["id"]
    assert next_ten[0]["title"].endswith("#2")
    assert Decimal(next_ten[0]["current_prize_etb"]) == Decimal("10")
