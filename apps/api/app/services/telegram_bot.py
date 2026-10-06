"""Telegram Bot Webhook Service.

Handles inbound Telegram updates directly in the FastAPI backend on Render,
eliminating the need to run local polling processes.
"""

from __future__ import annotations

import logging
from urllib.parse import quote
from typing import Any

import httpx

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

user_languages: dict[int, str] = {}
user_referrals: dict[int, str] = {}

WELCOME_PROMPT = (
    "🎯 Welcome to Challenge!\n"
    "እንኳን ወደ Challenge በደህና መጡ!\n"
    "Baga nagaan gara Challenge dhuftan!\n\n"
    "Please choose your language / እባክዎ ቋንቋዎን ይምረጡ / Maaloo afaan keessan filadhaa:"
)

REFERRAL_WELCOME = (
    "🎁 Welcome to Challenge! You were invited by a friend.\n"
    "Play your first challenge to earn cash prizes and help your friend get rewarded!\n\n"
    "🎁 እንኳን ደህና መጡ! በጓደኛዎ ተጋብዘዋል።\n"
    "የመጀመሪያ ውድድርዎን በማጠናቀቅ የገንዘብ ሽልማት ያሸንፉ፤ ጓደኛዎም ጉርሻ ያገኛል!\n\n"
    "🎁 Baga nagaan dhuftan! Hiriyaa keessaniin afeeramtan.\n"
    "Dorgommii jalqabaa taphadhaatii badhaafamaa!\n\n"
    "Please choose your language / እባክዎ ቋንቋዎን ይምረጡ / Maaloo afaan keessan filadhaa:"
)

LANGUAGE_CONFIRMATIONS: dict[str, str] = {
    "en": (
        "🇬🇧 Language set to English!\n\n"
        "Challenge is a timed skill competition with Telebirr cash prizes. "
        "Answer fast, score high, and climb the leaderboard.\n\n"
        "👇 Tap below to enter today's challenge:"
    ),
    "am": (
        "🇪🇹 ቋንቋዎ ወደ አማርኛ ተቀይሯል!\n\n"
        "Challenge ፈጣን የጥያቄና መልስ ውድድር ሲሆን የቴሌብር የገንዘብ ሽልማቶችን ያዘጋጃል። "
        "ፈጥነው ይመልሱ፣ ከፍተኛ ውጤት ያስመዝግቡ እና ያሸንፉ!\n\n"
        "👇 ውድድሩን ለመጀመር ከታች ያለውን ይጫኑ፡"
    ),
    "om": (
        "🌳 Afaan gara Afaan Oromootti jijjiirameera!\n\n"
        "Challenge dorgommii beekumsaa fi dandeettii yeroon daangeffamee badhaasa qarshii Telebirr qabudha. "
        "Saffisaan deebisaatii badhaasa injifadhaa!\n\n"
        "👇 Dorgommii jalqabuuf as tuqaa:"
    ),
}

HELP_TEXT = (
    "📖 Commands / ትዕዛዞች / Ajajoota:\n\n"
    "/start — Open Mini App & choose language / መተግበሪያውን ክፈት\n"
    "/spin — Daily Lucky Spin & Win / የዕለቱ የዕድል እሽክርክሪት\n"
    "/invite — Invite friends & earn bonus ETB / ጓደኞችን ጋብዘው የብር ጉርሻ ያግኙ\n"
    "/language — Change language / ቋንቋ ቀይር / Afaan jijjiiri\n"
    "/challenge — Today's rules / የውድድር ደንቦች\n"
    "/help — This help guide / የእርዳታ መመሪያ\n\n"
    "ℹ️ No password needed. You are automatically signed in with Telegram.\n"
    "የይለፍ ቃል አያስፈልግም፤ በቴሌግራም መለያዎ በቀጥታ ይከፈታል።\n"
    "Jecha icciitii hin barbaachisu; appichi herrega Telegram keessaniin banama."
)

SPIN_TEXT: dict[str, str] = {
    "en": (
        "🎡 Daily Lucky Spin!\n\n"
        "Spin the wheel once every 24h to win free ETB cash prizes credited directly to your wallet!\n\n"
        "👇 Tap below to spin the wheel:"
    ),
    "am": (
        "🎡 የዕለቱ የዕድል እሽክርክሪት!\n\n"
        "በየቀኑ አንድ ጊዜ በማሽከርከር ነፃ የብር ሽልማቶችን በቀጥታ ወደ ቦርሳዎ ያሸንፉ!\n\n"
        "👇 ለማሽከርከር ከታች ይጫኑ፡"
    ),
    "om": (
        "🎡 Geengoo Carraa Guyyaa!\n\n"
        "Sa'aatii 24 keessatti al tokko naannessuun badhaasa qarshii tolaa boorsaa keetti injiffadhu!\n\n"
        "👇 Naannessuuf as tuqaa:"
    ),
}

CHALLENGE_TEXT = (
    "🏆 Challenge Rules / የውድድር ደንቦች:\n\n"
    "• Free & cash rounds available / ነፃ እና የሚከፈልባቸው ዙሮች አሉ\n"
    "• Fast trivia questions with a countdown timer / ፈጣን ጥያቄዎች በሰዓት ቆጣሪ\n"
    "• Highest score & fastest finish takes the prize / ከፍተኛ ውጤት በፈጣን ጊዜ ያሸንፋል\n\n"
    "Open the Mini App to view live competitions!"
)


def _build_url(base_url: str, lang: str | None = None, start_param: str | None = None) -> str:
    params: list[str] = []
    if lang:
        params.append(f"lang={lang}")
    if start_param:
        params.append(f"startapp={start_param}")
    if params:
        sep = "&" if "?" in base_url else "?"
        return f"{base_url}{sep}{'&'.join(params)}"
    return base_url


def language_picker_keyboard(base_url: str, start_param: str | None = None) -> dict[str, Any]:
    buttons: list[list[dict[str, Any]]] = [
        [
            {"text": "🇬🇧 English", "callback_data": "lang:en"},
            {"text": "🇪🇹 አማርኛ", "callback_data": "lang:am"},
            {"text": "🌳 Oromoo", "callback_data": "lang:om"},
        ],
    ]
    if base_url.startswith("https://"):
        launch_url = _build_url(base_url, start_param=start_param)
        buttons.append([
            {
                "text": "🎮 Open Challenge | ክፈት",
                "web_app": {"url": launch_url},
            }
        ])
    return {"inline_keyboard": buttons}


def localized_launch_keyboard(
    base_url: str,
    lang: str,
    start_param: str | None = None,
) -> dict[str, Any]:
    url_with_params = _build_url(base_url, lang=lang, start_param=start_param)
    if lang == "am":
        play_label = "🎮 ውድድሩን ክፈት (Open)"
        change_label = "🌐 ቋንቋ ቀይር / Change Language"
    elif lang == "om":
        play_label = "🎮 Dorgommii Bani (Open)"
        change_label = "🌐 Afaan Jijjiiri / Change Language"
    else:
        play_label = "🎮 Open Challenge"
        change_label = "🌐 Change Language / ቋንቋ ቀይር"

    buttons: list[list[dict[str, Any]]] = []
    if base_url.startswith("https://"):
        buttons.append([
            {"text": play_label, "web_app": {"url": url_with_params}}
        ])
    buttons.append([
        {"text": change_label, "callback_data": "choose_lang"}
    ])
    return {"inline_keyboard": buttons}


class TelegramBotService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    @property
    def token(self) -> str:
        return self.settings.telegram_bot_token

    @property
    def base_api_url(self) -> str:
        return f"https://api.telegram.org/bot{self.token}"

    @property
    def webapp_url(self) -> str:
        return self.settings.webapp_url.rstrip("/")

    async def _post(self, method: str, payload: dict[str, Any]) -> bool:
        if not self.token:
            return False
        url = f"{self.base_api_url}/{method}"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code >= 400:
                    logger.warning("Telegram %s failed %d: %s", method, resp.status_code, resp.text)
                    return False
                return True
        except Exception as exc:
            logger.warning("Telegram %s request error: %s", method, exc)
            return False

    async def send_message(
        self,
        chat_id: int,
        text: str,
        reply_markup: dict[str, Any] | None = None,
        parse_mode: str | None = None,
    ) -> bool:
        payload: dict[str, Any] = {"chat_id": chat_id, "text": text}
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        if parse_mode is not None:
            payload["parse_mode"] = parse_mode
        return await self._post("sendMessage", payload)

    async def edit_message_text(
        self,
        chat_id: int,
        message_id: int,
        text: str,
        reply_markup: dict[str, Any] | None = None,
        parse_mode: str | None = None,
    ) -> bool:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
        }
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        if parse_mode is not None:
            payload["parse_mode"] = parse_mode
        return await self._post("editMessageText", payload)

    async def answer_callback_query(self, callback_query_id: str, text: str | None = None) -> bool:
        payload: dict[str, Any] = {"callback_query_id": callback_query_id}
        if text:
            payload["text"] = text
        return await self._post("answerCallbackQuery", payload)

    async def set_webhook(self, webhook_url: str) -> bool:
        payload = {"url": webhook_url, "allowed_updates": ["message", "callback_query"]}
        return await self._post("setWebhook", payload)

    async def set_menu_button(self) -> bool:
        if not self.webapp_url.startswith("https://"):
            return False
        payload = {
            "menu_button": {
                "type": "web_app",
                "text": "Open Challenge",
                "web_app": {"url": self.webapp_url},
            }
        }
        return await self._post("setChatMenuButton", payload)

    async def handle_update(self, update: dict[str, Any]) -> None:
        if "callback_query" in update:
            await self._handle_callback(update["callback_query"])
        elif "message" in update:
            await self._handle_message(update["message"])

    async def _handle_callback(self, cb: dict[str, Any]) -> None:
        cb_id = str(cb.get("id", ""))
        data = str(cb.get("data", ""))
        user = cb.get("from", {})
        user_id = user.get("id", 0)
        message = cb.get("message", {})
        chat_id = message.get("chat", {}).get("id", user_id)
        message_id = message.get("message_id")

        if data.startswith("lang:"):
            code = data.split(":")[1] if ":" in data else "en"
            if code not in ("en", "am", "om"):
                code = "en"
            user_languages[user_id] = code
            ref_param = user_referrals.get(user_id)

            feedback_toasts = {
                "en": "English selected ✓",
                "am": "አማርኛ ተመርጧል ✓",
                "om": "Afaan Oromoo filatameera ✓",
            }
            await self.answer_callback_query(cb_id, feedback_toasts.get(code, "Saved ✓"))

            msg_text = LANGUAGE_CONFIRMATIONS.get(code, LANGUAGE_CONFIRMATIONS["en"])
            keyboard = localized_launch_keyboard(self.webapp_url, code, ref_param)
            if message_id:
                success = await self.edit_message_text(chat_id, message_id, msg_text, reply_markup=keyboard)
                if not success:
                    await self.send_message(chat_id, msg_text, reply_markup=keyboard)
            else:
                await self.send_message(chat_id, msg_text, reply_markup=keyboard)

        elif data == "choose_lang":
            await self.answer_callback_query(cb_id)
            ref_param = user_referrals.get(user_id)
            keyboard = language_picker_keyboard(self.webapp_url, start_param=ref_param)
            if message_id:
                success = await self.edit_message_text(chat_id, message_id, WELCOME_PROMPT, reply_markup=keyboard)
                if not success:
                    await self.send_message(chat_id, WELCOME_PROMPT, reply_markup=keyboard)
            else:
                await self.send_message(chat_id, WELCOME_PROMPT, reply_markup=keyboard)
        else:
            await self.answer_callback_query(cb_id)

    async def _handle_message(self, msg: dict[str, Any]) -> None:
        chat_id = msg.get("chat", {}).get("id")
        user = msg.get("from", {})
        user_id = user.get("id", 0)
        text = str(msg.get("text", "")).strip()

        if not chat_id or not text:
            return

        parts = text.split(maxsplit=1)
        command = parts[0].lower()
        args = parts[1].strip() if len(parts) > 1 else ""

        if command.startswith("/start"):
            await self._handle_start(chat_id, user_id, args)
        elif command.startswith(("/invite", "/referral", "/ref")):
            await self._handle_invite(chat_id, user_id)
        elif command.startswith(("/language", "/lang")):
            ref_param = user_referrals.get(user_id)
            keyboard = language_picker_keyboard(self.webapp_url, start_param=ref_param)
            await self.send_message(chat_id, WELCOME_PROMPT, reply_markup=keyboard)
        elif command.startswith("/spin"):
            lang = user_languages.get(user_id, "en")
            ref_param = user_referrals.get(user_id)
            spin_url = f"{self.webapp_url}/spin"
            keyboard = localized_launch_keyboard(spin_url, lang, ref_param)
            await self.send_message(chat_id, SPIN_TEXT.get(lang, SPIN_TEXT["en"]), reply_markup=keyboard)
        elif command.startswith("/help"):
            await self.send_message(chat_id, HELP_TEXT)
        elif command.startswith("/challenge"):
            lang = user_languages.get(user_id, "en")
            ref_param = user_referrals.get(user_id)
            keyboard = localized_launch_keyboard(self.webapp_url, lang, ref_param)
            await self.send_message(chat_id, CHALLENGE_TEXT, reply_markup=keyboard)
        elif command.startswith("/myresults"):
            results_msg = (
                "Your results and ranking appear in the Mini App right after you compete.\n\n"
                "ውጤትዎ እንደጨረሱ ወዲያውኑ በመተግበሪያው የደረጃ ሰንጠረዥ ላይ ይታያል።\n\n"
                "Bu'aan keessan dorgommii xumuruun booda yeruma sana Mini App keessatti mul'ata."
            )
            await self.send_message(chat_id, results_msg)
        else:
            lang = user_languages.get(user_id, "en")
            ref_param = user_referrals.get(user_id)
            keyboard = localized_launch_keyboard(self.webapp_url, lang, ref_param)
            fallback_text = "🎮 Tap below to open Challenge / ለመጫወት ከታች ይጫኑ / Taphachuuf as tuqaa:"
            await self.send_message(chat_id, fallback_text, reply_markup=keyboard)

    async def _handle_start(self, chat_id: int, user_id: int, args: str) -> None:
        args_lower = args.lower()
        is_referral = False
        if args_lower.startswith(("ref_", "r_")):
            user_referrals[user_id] = args
            is_referral = True
        elif args.isdigit():
            user_referrals[user_id] = f"ref_{args}"
            is_referral = True

        ref_param = user_referrals.get(user_id)

        if args_lower in ("am", "lang_am"):
            user_languages[user_id] = "am"
            keyboard = localized_launch_keyboard(self.webapp_url, "am", ref_param)
            await self.send_message(chat_id, LANGUAGE_CONFIRMATIONS["am"], reply_markup=keyboard)
            return
        if args_lower in ("om", "lang_om"):
            user_languages[user_id] = "om"
            keyboard = localized_launch_keyboard(self.webapp_url, "om", ref_param)
            await self.send_message(chat_id, LANGUAGE_CONFIRMATIONS["om"], reply_markup=keyboard)
            return
        if args_lower in ("en", "lang_en"):
            user_languages[user_id] = "en"
            keyboard = localized_launch_keyboard(self.webapp_url, "en", ref_param)
            await self.send_message(chat_id, LANGUAGE_CONFIRMATIONS["en"], reply_markup=keyboard)
            return

        saved_lang = user_languages.get(user_id)
        if saved_lang and saved_lang in LANGUAGE_CONFIRMATIONS:
            keyboard = localized_launch_keyboard(self.webapp_url, saved_lang, ref_param)
            await self.send_message(chat_id, LANGUAGE_CONFIRMATIONS[saved_lang], reply_markup=keyboard)
            return

        prompt_text = REFERRAL_WELCOME if is_referral else WELCOME_PROMPT
        keyboard = language_picker_keyboard(self.webapp_url, start_param=ref_param)
        await self.send_message(chat_id, prompt_text, reply_markup=keyboard)

    async def _handle_invite(self, chat_id: int, user_id: int) -> None:
        bot_username = self.settings.telegram_bot_username.strip().lstrip("@") or "Ethioquiz_bot"
        ref_link = f"https://t.me/{bot_username}?start=ref_{user_id}"
        share_text = (
            "🎮 Join me on Challenge! Test your speed and trivia skills to win Telebirr cash prizes. "
            "Free and cash rounds available every day!"
        )
        share_url = f"https://t.me/share/url?url={quote(ref_link)}&text={quote(share_text)}"

        text = (
            "🎁 <b>Invite Friends & Earn 1.00 ETB!</b>\n"
            "ጓደኞችን ይጋብዙ እና 1.00 ብር ያግኙ!\n"
            "Hiriyaa keessan afeeraatii 1.00 ETB badhaafamaa!\n\n"
            "Earn <b>1.00 ETB</b> in your wallet whenever a new friend joins using your link "
            "and finishes their first challenge!\n\n"
            f"🔗 <b>Your Personal Invite Link:</b>\n{ref_link}"
        )
        buttons = [
            [{"text": "📲 Share with Friends | አጋራ", "url": share_url}],
        ]
        if self.webapp_url.startswith("https://"):
            buttons.append([
                {"text": "🎮 Open Challenge", "web_app": {"url": self.webapp_url}}
            ])
        keyboard = {"inline_keyboard": buttons}
        await self.send_message(chat_id, text, reply_markup=keyboard, parse_mode="HTML")
