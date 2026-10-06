"""Create the development user, today's challenge, and its questions.

Run from apps/api after `alembic upgrade head`:

    python -m app.seed
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dev_user import DEV_FIRST_NAME, DEV_LAST_NAME, DEV_TELEGRAM_ID, DEV_USERNAME
from app.core.logging import configure_logging
from app.db.session import SessionLocal
from app.models.attempt import Attempt
from app.models.challenge import Challenge, ChallengeStatus
from app.models.question import Choice, Question
from app.repositories.users import UserRepository

CHALLENGE_TITLE = "Daily Skill Challenge"
QUESTION_COUNT = 15
DURATION_SECONDS = 30
logger = logging.getLogger(__name__)

# (prompt, [(label, is_correct), ...])
QUESTIONS: list[tuple[str, list[tuple[str, bool]]]] = [
    (
        "What is the capital of Ethiopia?",
        [("Nairobi", False), ("Addis Ababa", True), ("Cairo", False), ("Khartoum", False)],
    ),
    (
        "How many minutes are in one hour?",
        [("30", False), ("90", False), ("60", True), ("45", False)],
    ),
    (
        "What is 7 × 8?",
        [("54", False), ("64", False), ("48", False), ("56", True)],
    ),
    (
        "Which planet is closest to the sun?",
        [("Venus", False), ("Mercury", True), ("Earth", False), ("Mars", False)],
    ),
    (
        "What is H2O?",
        [("Salt", False), ("Gold", False), ("Water", True), ("Oxygen gas", False)],
    ),
    (
        "How many sides does a triangle have?",
        [("4", False), ("5", False), ("6", False), ("3", True)],
    ),
    (
        "Which of these is a primary color?",
        [("Green", False), ("Blue", True), ("Orange", False), ("Purple", False)],
    ),
    (
        "Which ocean is the largest?",
        [("Atlantic", False), ("Indian", False), ("Pacific", True), ("Arctic", False)],
    ),
    (
        "What is 100 ÷ 4?",
        [("20", False), ("40", False), ("50", False), ("25", True)],
    ),
    (
        "Which animal is a mammal?",
        [("Shark", False), ("Whale", True), ("Trout", False), ("Crocodile", False)],
    ),
    (
        "What is the opposite of north?",
        [("East", False), ("West", False), ("Up", False), ("South", True)],
    ),
    (
        "How many days are in a leap year?",
        [("365", False), ("366", True), ("364", False), ("360", False)],
    ),
    (
        "Which language is widely spoken in Ethiopia?",
        [("Swahili", False), ("Zulu", False), ("Amharic", True), ("Yoruba", False)],
    ),
    (
        "What is 9 + 6?",
        [("14", False), ("16", False), ("13", False), ("15", True)],
    ),
    (
        "Which month has 28 days in a common year?",
        [("April", False), ("February", True), ("June", False), ("September", False)],
    ),
]


def _check_questions() -> None:
    if len(QUESTIONS) != QUESTION_COUNT:
        raise RuntimeError(f"Expected {QUESTION_COUNT} questions, found {len(QUESTIONS)}")
    for prompt, choices in QUESTIONS:
        correct = [label for label, is_correct in choices if is_correct]
        if len(choices) != 4 or len(correct) != 1:
            raise RuntimeError(f"Question must have four choices and one answer: {prompt}")


async def _replace_questions(session: AsyncSession, challenge_id: UUID) -> None:
    await session.execute(delete(Question).where(Question.challenge_id == challenge_id))
    for position, (prompt, choices) in enumerate(QUESTIONS, start=1):
        question = Question(challenge_id=challenge_id, position=position, prompt=prompt)
        session.add(question)
        await session.flush()
        for index, (label, is_correct) in enumerate(choices, start=1):
            session.add(
                Choice(
                    question_id=question.id,
                    position=index,
                    label=label,
                    is_correct=is_correct,
                )
            )


async def seed() -> None:
    _check_questions()
    async with SessionLocal() as session:
        user = await UserRepository(session).upsert_development_user()
        challenge = await session.scalar(
            select(Challenge).where(Challenge.title == CHALLENGE_TITLE)
        )
        now = datetime.now(UTC)
        if challenge is None:
            challenge = Challenge(
                title=CHALLENGE_TITLE,
                description="",
                question_count=QUESTION_COUNT,
                duration_seconds=DURATION_SECONDS,
                registration_opens_at=now,
                registration_closes_at=now + timedelta(days=1),
                starts_at=now,
                status=ChallengeStatus.LIVE,
            )
            session.add(challenge)
            await session.flush()
        challenge.description = (
            "Fifteen questions. Thirty seconds. Play now, even before 100 players. "
            "Your score is saved on the leaderboard. The prize is confirmed at 100."
        )
        challenge.question_count = QUESTION_COUNT
        challenge.duration_seconds = DURATION_SECONDS
        challenge.category = "general"
        challenge.status = ChallengeStatus.LIVE
        challenge.starts_at = now
        if challenge.registration_opens_at is None:
            challenge.registration_opens_at = now
        challenge.registration_closes_at = now + timedelta(days=1)
        started = await session.scalar(
            select(func.count()).select_from(Attempt).where(Attempt.challenge_id == challenge.id)
        )
        if started:
            logger.info("keeping existing questions because %s players already started", started)
        else:
            await _replace_questions(session, challenge.id)
        await session.commit()
        logger.info(
            "seeded challenge %s category=general questions=%s duration=%ss",
            challenge.id,
            QUESTION_COUNT,
            DURATION_SECONDS,
        )

        await _seed_category_challenges(session, now)
        logger.info(
            "development user %s telegram_id=%s username=%s name=%s %s",
            user.id,
            DEV_TELEGRAM_ID,
            DEV_USERNAME,
            DEV_FIRST_NAME,
            DEV_LAST_NAME,
        )


HISTORY_QUESTIONS: list[tuple[str, list[tuple[str, bool]]]] = [
    (
        "In which year did the historic Battle of Adwa take place?",
        [("1889", False), ("1896", True), ("1935", False), ("1902", False)],
    ),
    (
        "Who was the Ethiopian Emperor during the Battle of Adwa?",
        [
            ("Tewodros II", False),
            ("Menelik II", True),
            ("Yohannes IV", False),
            ("Haile Selassie", False),
        ],
    ),
    (
        "Which northern city is famous for its ancient giant stone stelae (obelisks)?",
        [("Gondar", False), ("Lalibela", False), ("Axum", True), ("Harar", False)],
    ),
    (
        "Which king carved the 11 rock-hewn monolithic churches of Roha?",
        [
            ("King Ezana", False),
            ("King Lalibela", True),
            ("King Kaleb", False),
            ("King Fasilides", False),
        ],
    ),
    (
        "Which legendary Ethiopian athlete won marathon gold barefoot at the 1960 Rome Olympics?",
        [
            ("Kenenisa Bekele", False),
            ("Haile Gebrselassie", False),
            ("Abebe Bikila", True),
            ("Miruts Yifter", False),
        ],
    ),
    (
        "The ancient walled city of Jugol is located in which historic region?",
        [("Harar", True), ("Jimma", False), ("Dire Dawa", False), ("Awash", False)],
    ),
    (
        "Which castle compound in Ethiopia was built by Emperor Fasilides in the 17th century?",
        [
            ("Ankober", False),
            ("Fasil Ghebbi (Gondar)", True),
            ("Tiya", False),
            ("Debre Damo", False),
        ],
    ),
    (
        "The 3.2-million-year-old fossil of Lucy (Dinkinesh) was discovered in which valley?",
        [
            ("Omo Valley", False),
            ("Awash Valley (Afar)", True),
            ("Rift Valley", False),
            ("Blue Nile Gorge", False),
        ],
    ),
    (
        "What was the major ancient seaport of the Kingdom of Aksum on the Red Sea?",
        [("Massawa", False), ("Adulis", True), ("Assab", False), ("Berbera", False)],
    ),
    (
        "Which river is known in Ethiopia as 'Abay' and originates at Lake Tana?",
        [("Awash River", False), ("Omo River", False), ("Blue Nile", True), ("Baro River", False)],
    ),
]

FOOTBALL_QUESTIONS: list[tuple[str, list[tuple[str, bool]]]] = [
    (
        "Which national team has won the most FIFA Men's World Cup trophies?",
        [("Germany", False), ("Brazil", True), ("Italy", False), ("Argentina", False)],
    ),
    (
        "Who captained Argentina to victory in the 2022 FIFA World Cup?",
        [
            ("Diego Maradona", False),
            ("Angel Di Maria", False),
            ("Lionel Messi", True),
            ("Sergio Aguero", False),
        ],
    ),
    (
        "Which club has won the most UEFA Champions League titles?",
        [
            ("Bayern Munich", False),
            ("AC Milan", False),
            ("Real Madrid", True),
            ("Liverpool", False),
        ],
    ),
    (
        "Who holds the record for most international goals in men's football history?",
        [("Pele", False), ("Cristiano Ronaldo", True), ("Ali Daei", False), ("Neymar", False)],
    ),
    (
        "What is the nickname of the Ethiopian national football team?",
        [
            ("The Pharaohs", False),
            ("The Walias", True),
            ("Super Eagles", False),
            ("The Black Stars", False),
        ],
    ),
    (
        "Which Ethiopian club has won the most Ethiopian Premier League titles?",
        [
            ("Ethiopian Coffee SC", False),
            ("Saint George SC", True),
            ("Fasil Kenema", False),
            ("Hawassa City", False),
        ],
    ),
    (
        "Which African country hosted the 2010 FIFA World Cup?",
        [("Nigeria", False), ("Egypt", False), ("South Africa", True), ("Morocco", False)],
    ),
    (
        "How many minutes is a standard regular professional football match?",
        [
            ("80 minutes", False),
            ("90 minutes", True),
            ("100 minutes", False),
            ("120 minutes", False),
        ],
    ),
    (
        "Which club pulled off the 5000-to-1 miracle to win the English Premier League in 2016?",
        [
            ("Tottenham", False),
            ("Leicester City", True),
            ("West Ham", False),
            ("Everton", False),
        ],
    ),
    (
        "In which country was the legendary stadium 'Maracanã' built?",
        [("Argentina", False), ("Uruguay", False), ("Brazil", True), ("Portugal", False)],
    ),
]


async def _seed_category_challenges(session: AsyncSession, now: datetime) -> None:
    from decimal import Decimal

    categories_to_seed = [
        (
            "Ethiopian History Championship",
            "Ten questions on Ethiopian emperors, Adwa, ancient heritage. Top score wins.",
            "history",
            Decimal("15"),
            50,
            Decimal("500"),
            Decimal("8"),
            10,
            30,
            HISTORY_QUESTIONS,
        ),
        (
            "Football Legends & World Cup Quiz",
            "Ten questions on international football, World Cup history, and Premier League stars.",
            "football",
            Decimal("20"),
            50,
            Decimal("750"),
            Decimal("10"),
            10,
            30,
            FOOTBALL_QUESTIONS,
        ),
    ]

    for title, desc, cat, fee, min_p, base_p, extra_p, q_cnt, dur, q_list in categories_to_seed:
        challenge = await session.scalar(select(Challenge).where(Challenge.title == title))
        if challenge is None:
            challenge = Challenge(
                title=title,
                description=desc,
                category=cat,
                entry_fee_etb=fee,
                minimum_participants=min_p,
                base_prize_etb=base_p,
                extra_prize_per_participant_etb=extra_p,
                question_count=q_cnt,
                duration_seconds=dur,
                registration_opens_at=now,
                registration_closes_at=now + timedelta(days=2),
                starts_at=now,
                status=ChallengeStatus.LIVE,
            )
            session.add(challenge)
            await session.flush()
            for position, (prompt, choices) in enumerate(q_list, start=1):
                q = Question(challenge_id=challenge.id, position=position, prompt=prompt)
                session.add(q)
                await session.flush()
                for idx, (label, is_corr) in enumerate(choices, start=1):
                    session.add(
                        Choice(
                            question_id=q.id,
                            position=idx,
                            label=label,
                            is_correct=is_corr,
                        )
                    )
            logger.info("seeded categorized challenge %s (%s)", title, cat)
        else:
            if challenge.category != cat:
                challenge.category = cat
    await session.commit()


def main() -> None:
    configure_logging()
    asyncio.run(seed())


if __name__ == "__main__":
    main()
