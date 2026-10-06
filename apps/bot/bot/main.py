"""Run the bot with long polling.

From apps/bot:

    python bot/main.py
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aiogram import Bot, Dispatcher
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.types import BotCommand, MenuButtonWebApp, WebAppInfo

from bot.config import get_settings
from bot.handlers import router


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    settings = get_settings()
    if not settings.telegram_bot_token:
        raise SystemExit("Set TELEGRAM_BOT_TOKEN in the repository .env before starting the bot.")

    proxy = settings.proxy_url
    if proxy:
        logging.info("Using proxy: %s", proxy)
        session = AiohttpSession(proxy=proxy)
    else:
        session = AiohttpSession()

    bot = Bot(token=settings.telegram_bot_token, session=session)
    dispatcher = Dispatcher()
    dispatcher.include_router(router)
    await bot.set_my_commands(
        [
            BotCommand(command="start", description="Open Challenge"),
            BotCommand(command="spin", description="Daily Lucky Spin / የዕድል እሽክርክሪት"),
            BotCommand(command="help", description="How Challenge works"),
            BotCommand(command="challenge", description="Today's challenge"),
            BotCommand(command="myresults", description="Your results"),
        ]
    )
    if settings.mini_app_url.startswith("https://"):
        try:
            await bot.set_chat_menu_button(
                menu_button=MenuButtonWebApp(
                    text="Open Challenge",
                    web_app=WebAppInfo(url=settings.mini_app_url),
                )
            )
        except Exception as exc:
            logging.warning("Could not set chat menu button: %s", exc)

    try:
        await dispatcher.start_polling(bot)
    finally:
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
