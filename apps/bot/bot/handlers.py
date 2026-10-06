"""Telegram commands. Polling is used for local development."""

from urllib.parse import quote

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

from bot.config import get_settings

router = Router()

# In-memory language selection cache: user_id -> "en" | "am" | "om"
user_languages: dict[int, str] = {}
# In-memory referral tracking: user_id -> referral_code (e.g. "ref_123456789")
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

LANGUAGE_CONFIRMATIONS = {
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

SPIN_TEXT = {
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


def language_picker_keyboard(base_url: str, start_param: str | None = None) -> InlineKeyboardMarkup:
    buttons = [
        [
            InlineKeyboardButton(text="🇬🇧 English", callback_data="lang:en"),
            InlineKeyboardButton(text="🇪🇹 አማርኛ", callback_data="lang:am"),
            InlineKeyboardButton(text="🌳 Oromoo", callback_data="lang:om"),
        ],
    ]
    if base_url.startswith("https://"):
        launch_url = _build_url(base_url, start_param=start_param)
        buttons.append([
            InlineKeyboardButton(
                text="🎮 Open Challenge | ክፈት",
                web_app=WebAppInfo(url=launch_url),
            )
        ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def localized_launch_keyboard(
    base_url: str,
    lang: str,
    start_param: str | None = None,
) -> InlineKeyboardMarkup:
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

    buttons = []
    if base_url.startswith("https://"):
        buttons.append([
            InlineKeyboardButton(text=play_label, web_app=WebAppInfo(url=url_with_params))
        ])
    buttons.append([
        InlineKeyboardButton(text=change_label, callback_data="choose_lang")
    ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def _with_local_link(
    text: str,
    lang: str | None = None,
    start_param: str | None = None,
) -> str:
    url = _build_url(get_settings().mini_app_url, lang=lang, start_param=start_param)
    if url.startswith("https://"):
        return text
    return f"{text}\n\nLocal app: {url}\nTelegram only attaches the Open button when this URL is HTTPS."


@router.message(CommandStart())
async def start(message: Message, command: CommandObject) -> None:
    url = get_settings().mini_app_url
    user_id = message.from_user.id if message.from_user else 0
    raw_args = (command.args or "").strip()
    args_lower = raw_args.lower()

    # Detect referral deep link (e.g. /start ref_123456789 or /start r_123456789)
    is_referral = False
    if args_lower.startswith(("ref_", "r_")):
        user_referrals[user_id] = raw_args
        is_referral = True
    elif raw_args.isdigit():
        user_referrals[user_id] = f"ref_{raw_args}"
        is_referral = True

    ref_param = user_referrals.get(user_id)

    # Check language shortcut e.g. /start lang_am or /start am
    if args_lower in ("am", "lang_am"):
        user_languages[user_id] = "am"
        await message.answer(
            _with_local_link(LANGUAGE_CONFIRMATIONS["am"], "am", ref_param),
            reply_markup=localized_launch_keyboard(url, "am", ref_param),
        )
        return
    if args_lower in ("om", "lang_om"):
        user_languages[user_id] = "om"
        await message.answer(
            _with_local_link(LANGUAGE_CONFIRMATIONS["om"], "om", ref_param),
            reply_markup=localized_launch_keyboard(url, "om", ref_param),
        )
        return
    if args_lower in ("en", "lang_en"):
        user_languages[user_id] = "en"
        await message.answer(
            _with_local_link(LANGUAGE_CONFIRMATIONS["en"], "en", ref_param),
            reply_markup=localized_launch_keyboard(url, "en", ref_param),
        )
        return

    # If user previously chose a language, greet them in that language
    saved_lang = user_languages.get(user_id)
    if saved_lang and saved_lang in LANGUAGE_CONFIRMATIONS:
        await message.answer(
            _with_local_link(LANGUAGE_CONFIRMATIONS[saved_lang], saved_lang, ref_param),
            reply_markup=localized_launch_keyboard(url, saved_lang, ref_param),
        )
        return

    # First time: show prompt (customized if joined via referral)
    prompt_text = REFERRAL_WELCOME if is_referral else WELCOME_PROMPT
    await message.answer(
        _with_local_link(prompt_text, start_param=ref_param),
        reply_markup=language_picker_keyboard(url, start_param=ref_param),
    )


@router.message(Command("invite", "referral", "ref"))
async def invite_command(message: Message) -> None:
    user_id = message.from_user.id if message.from_user else 0
    bot_settings = get_settings()
    bot_username = bot_settings.telegram_bot_username.strip().lstrip("@") or "ChallengeQuizBot"
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
        [
            InlineKeyboardButton(text="📲 Share with Friends | አጋራ", url=share_url),
        ],
    ]
    if bot_settings.mini_app_url.startswith("https://"):
        buttons.append([
            InlineKeyboardButton(
                text="🎮 Open Challenge",
                web_app=WebAppInfo(url=bot_settings.mini_app_url),
            )
        ])

    keyboard = InlineKeyboardMarkup(inline_keyboard=buttons)
    await message.answer(text, reply_markup=keyboard, parse_mode="HTML")


@router.message(Command("language", "lang"))
async def choose_language_command(message: Message) -> None:
    url = get_settings().mini_app_url
    user_id = message.from_user.id if message.from_user else 0
    ref_param = user_referrals.get(user_id)
    await message.answer(
        _with_local_link(WELCOME_PROMPT, start_param=ref_param),
        reply_markup=language_picker_keyboard(url, start_param=ref_param),
    )


@router.callback_query(F.data.startswith("lang:"))
async def on_language_chosen(callback: CallbackQuery) -> None:
    code = callback.data.split(":")[1] if callback.data else "en"
    if code not in ("en", "am", "om"):
        code = "en"

    user_id = callback.from_user.id
    user_languages[user_id] = code
    ref_param = user_referrals.get(user_id)

    feedback_toasts = {
        "en": "English selected ✓",
        "am": "አማርኛ ተመርጧል ✓",
        "om": "Afaan Oromoo filatameera ✓",
    }
    await callback.answer(feedback_toasts.get(code, "Saved ✓"))

    url = get_settings().mini_app_url
    message_text = _with_local_link(LANGUAGE_CONFIRMATIONS[code], code, ref_param)
    keyboard = localized_launch_keyboard(url, code, ref_param)

    if callback.message and isinstance(callback.message, Message):
        try:
            await callback.message.edit_text(message_text, reply_markup=keyboard)
        except Exception:
            await callback.message.answer(message_text, reply_markup=keyboard)


@router.callback_query(F.data == "choose_lang")
async def on_choose_lang_callback(callback: CallbackQuery) -> None:
    await callback.answer()
    url = get_settings().mini_app_url
    user_id = callback.from_user.id
    ref_param = user_referrals.get(user_id)
    message_text = _with_local_link(WELCOME_PROMPT, start_param=ref_param)
    keyboard = language_picker_keyboard(url, start_param=ref_param)

    if callback.message and isinstance(callback.message, Message):
        try:
            await callback.message.edit_text(message_text, reply_markup=keyboard)
        except Exception:
            await callback.message.answer(message_text, reply_markup=keyboard)


@router.message(Command("spin"))
async def spin_command(message: Message) -> None:
    url = get_settings().mini_app_url
    user_id = message.from_user.id if message.from_user else 0
    lang = user_languages.get(user_id, "en")
    ref_param = user_referrals.get(user_id)
    text = SPIN_TEXT.get(lang, SPIN_TEXT["en"])
    spin_url = f"{url.rstrip('/')}/spin" if url else url
    await message.answer(
        _with_local_link(text, lang, ref_param),
        reply_markup=localized_launch_keyboard(spin_url, lang, ref_param),
    )


@router.message(Command("help"))
async def help_command(message: Message) -> None:
    await message.answer(_with_local_link(HELP_TEXT))


@router.message(Command("challenge"))
async def challenge(message: Message) -> None:
    url = get_settings().mini_app_url
    user_id = message.from_user.id if message.from_user else 0
    lang = user_languages.get(user_id, "en")
    ref_param = user_referrals.get(user_id)
    await message.answer(
        _with_local_link(CHALLENGE_TEXT, lang, ref_param),
        reply_markup=localized_launch_keyboard(url, lang, ref_param),
    )


@router.message(Command("myresults"))
async def my_results(message: Message) -> None:
    await message.answer(
        _with_local_link(
            "Your results and ranking appear in the Mini App right after you compete.\n\n"
            "ውጤትዎ እንደጨረሱ ወዲያውኑ በመተግበሪያው የደረጃ ሰንጠረዥ ላይ ይታያል።\n\n"
            "Bu'aan keessan dorgommii xumuruun booda yeruma sana Mini App keessatti mul'ata."
        )
    )


@router.message()
async def fallback_handler(message: Message) -> None:
    url = get_settings().mini_app_url
    user_id = message.from_user.id if message.from_user else 0
    lang = user_languages.get(user_id, "en")
    ref_param = user_referrals.get(user_id)
    await message.answer(
        _with_local_link(
            "🎮 Tap below to open Challenge / ለመጫወት ከታች ይጫኑ / Taphachuuf as tuqaa:",
            lang,
            ref_param,
        ),
        reply_markup=localized_launch_keyboard(url, lang, ref_param),
    )
