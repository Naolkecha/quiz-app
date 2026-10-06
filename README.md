# Challenge

Timed skill competitions inside a Telegram Mini App.

The current local build includes accounts, multiple open challenges, persistent terms acceptance,
timed questions, server-side scoring, per-challenge leaderboards, and an auditable wallet ledger.
Development uses a clearly labelled Telebirr sandbox; it never represents real money.

## Layout

```
apps/api    FastAPI, SQLAlchemy, Alembic
apps/web    Next.js Mini App
apps/bot    aiogram bot (long polling)
infra       PostgreSQL init script for the test database
```

PostgreSQL holds users and challenges. Redis is not part of this phase.

## Setup

Install Docker, Python 3.12+, and Node.js 22+.

```powershell
copy .env.example .env
docker compose up -d
```

Edit `.env` and set `SECRET_KEY` to a random string of at least 32 characters. Put the bot token from BotFather in `TELEGRAM_BOT_TOKEN`. Leave it blank if you only want browser development sign-in. The token stays in `.env`. The Mini App never receives it.

### API

```powershell
cd apps/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

- API: http://127.0.0.1:8000
- OpenAPI: http://127.0.0.1:8000/docs

`python -m app.seed` creates the development user and a 15-question, 30-second test
challenge. Entry is 20 ETB, the minimum is 100 players, the base prize is 1,000 ETB,
and each player above 100 adds 10 ETB. Running the seed again does not duplicate them.

Schema changes go through Alembic only.

### Mini App

```powershell
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000. The web app reads `NEXT_PUBLIC_API_URL` and `APP_ENV` from the repository `.env`.

Outside Telegram, with `APP_ENV=development`, use **Continue as development user**. Inside Telegram, the app sends raw `initData` to `POST /api/auth/telegram`. The API checks the signature with the bot token and then creates a backend session. `initDataUnsafe` is not accepted.

`POST /api/auth/dev` exists only when `APP_ENV=development`. Production does not mount that route, and real Telegram validation is required there.

Home reads `GET /api/challenges` and can show multiple open challenges. Joining stores the
accepted terms in PostgreSQL; it does not start the timer. Opening the question page starts the
single timed attempt. Finished attempts are scored by the API and ranked by score, elapsed time,
then finish time.

The Wallet tab supports sandbox deposits and withdrawals in development. Production fails closed
until Telebirr merchant credentials, private signing key, callback public key, HTTPS notify URL,
and separate B2C payout approval are configured. A production deposit must only credit the ledger
after a verified server callback and order-status confirmation.

### Bot

```powershell
cd apps/bot
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
python bot/main.py
```

The bot uses long polling. `/start`, `/help`, `/challenge`, `/invite`, and `/myresults` are registered. `/start` supports referral links (`/start ref_<telegram_id>`). `/start` and `/challenge` attach an **Open Challenge** button when `WEBAPP_URL` is HTTPS. Telegram rejects an `http://` web app button, so a local URL is sent as text instead.

## Tests

PostgreSQL must be running (`docker compose up -d`). Pytest creates `challenge_test` if needed and applies the Alembic migrations.

```powershell
cd apps/api
.\.venv\Scripts\Activate.ps1
pytest
ruff check app alembic
mypy app
```

Covered behavior:

- database connection and migrated tables
- Telegram initData signature, expiry, and tampering
- user creation from a valid login
- the same Telegram user logging in twice
- development login creating one local user
- development login not being mounted outside development
- joining before starting, persistent participant counts, server-side scoring, and ranking

## Prize rule

For the default challenge, 100 or fewer players produce a 1,000 ETB prize. Each player after that adds 10 ETB. The challenge is confirmed only once the joined count reaches the minimum. The API field `is_confirmed` carries that fact.

## Next phase

Complete the certified Telebirr C2B adapter and signed callback after Ethio telecom provides the
merchant package. Complete withdrawals only after separate B2C payout approval. Do not treat a
browser redirect or client-side success result as proof of payment.
