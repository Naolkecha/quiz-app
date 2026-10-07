"""Tests for duel question bank and category sampling."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.sessions import issue_session
from app.models.admin import AdminAccount, AdminRole
from app.models.question import Choice, Question, QuestionCategory
from app.models.user import User
from app.services.duels import DuelService


def _auth_headers(user: User) -> dict[str, str]:
    token = issue_session(user_id=user.id, secret=get_settings().secret_key, ttl_seconds=3600)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_duel_category_sampling(session: AsyncSession) -> None:
    # 1. Create a category with exactly 5 questions
    cat = QuestionCategory(id="test_art", name="Art & Painting", icon="🎨", is_active=True)
    session.add(cat)
    await session.flush()

    for i in range(1, 6):
        q = Question(category="test_art", prompt=f"Art question {i}?")
        session.add(q)
        await session.flush()
        session.add(Choice(question_id=q.id, position=1, label=f"Artist {i}", is_correct=True))
        session.add(Choice(question_id=q.id, position=2, label="Other artist", is_correct=False))

    # 2. Create another category with only 3 questions (insufficient)
    cat2 = QuestionCategory(id="test_music", name="Music", icon="🎵", is_active=True)
    session.add(cat2)
    await session.flush()
    for i in range(1, 4):
        q2 = Question(category="test_music", prompt=f"Music question {i}?")
        session.add(q2)
        await session.flush()
        session.add(Choice(question_id=q2.id, position=1, label=f"Song {i}", is_correct=True))
        session.add(Choice(question_id=q2.id, position=2, label="Other song", is_correct=False))

    await session.commit()

    service = DuelService(session)

    # list_available_categories should include test_art but NOT test_music (< 5 questions)
    cats = await service.list_available_categories()
    cat_ids = [c.id for c in cats]
    assert "test_art" in cat_ids
    assert "test_music" not in cat_ids

    # _pick_questions for test_art should successfully return 5 questions
    picked = await service._pick_questions("test_art")
    assert len(picked) == 5
    for item in picked:
        assert "Art question" in item["prompt"]
        assert len(item["choices"]) == 2
        assert item["correct_choice_id"] != ""

    # _pick_questions for test_music must raise AppError("insufficient_questions") and NOT fallback
    with pytest.raises(AppError) as exc_info:
        await service._pick_questions("test_music")
    assert exc_info.value.code == "insufficient_questions"

    # _pick_questions for nonexistent category must raise AppError
    with pytest.raises(AppError) as exc_info_nonexistent:
        await service._pick_questions("nonexistent_cat")
    assert exc_info_nonexistent.value.code == "invalid_category"


@pytest.mark.asyncio
async def test_admin_category_and_bank_endpoints(session: AsyncSession, client: AsyncClient) -> None:
    owner = User(telegram_id=999888777, username="owner_duel_admin", first_name="Owner")
    session.add(owner)
    await session.flush()
    session.add(AdminAccount(user_id=owner.id, role=AdminRole.OWNER))
    await session.commit()

    headers = _auth_headers(owner)

    # 1. Create a category
    resp = await client.post(
        "/api/admin/categories",
        headers=headers,
        json={"id": "test_cinema", "name": "Cinema & Movies", "icon": "🎬", "description": "Film trivia"},
    )
    assert resp.status_code == 201
    assert resp.json()["id"] == "test_cinema"

    # 2. Add question to that category
    q_resp = await client.post(
        "/api/admin/questions",
        headers=headers,
        json={
            "category": "test_cinema",
            "prompt": "Who directed Inception?",
            "choices": [
                {"label": "Christopher Nolan", "is_correct": True},
                {"label": "Steven Spielberg", "is_correct": False},
                {"label": "James Cameron", "is_correct": False},
                {"label": "Quentin Tarantino", "is_correct": False},
            ],
        },
    )
    assert q_resp.status_code == 201
    data = q_resp.json()
    assert data["prompt"] == "Who directed Inception?"
    assert len(data["choices"]) == 4

    # 3. List questions for test_cinema
    list_resp = await client.get("/api/admin/questions?category=test_cinema", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    # 4. Check /api/duels/categories (should not include test_cinema yet because it only has 1 question)
    duel_cats_resp = await client.get("/api/duels/categories")
    assert duel_cats_resp.status_code == 200
    duel_cat_ids = [c["id"] for c in duel_cats_resp.json()]
    assert "test_cinema" not in duel_cat_ids
