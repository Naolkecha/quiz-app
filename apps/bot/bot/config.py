"""Bot settings. The token never leaves this process."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BOT_ROOT = Path(__file__).resolve().parents[1]
_REPO_ROOT = Path(__file__).resolve().parents[3]


def _env_files() -> tuple[str, ...]:
    candidates = (_REPO_ROOT / ".env", _BOT_ROOT / ".env")
    return tuple(str(path) for path in candidates if path.is_file())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    telegram_bot_token: str = ""
    telegram_bot_username: str = ""
    webapp_url: str = "http://localhost:3000"

    # Optional proxy for networks that block api.telegram.org.
    # Set one of these in .env, e.g.:
    #   HTTPS_PROXY=http://user:pass@host:port
    #   SOCKS5_PROXY=socks5://user:pass@host:port
    # SOCKS5 requires: pip install aiohttp-socks
    https_proxy: str = ""
    socks5_proxy: str = ""

    @property
    def mini_app_url(self) -> str:
        return self.webapp_url.rstrip("/") or "http://localhost:3000"

    @property
    def proxy_url(self) -> str:
        """Return the proxy URL to use, or empty string if none."""
        return self.socks5_proxy.strip() or self.https_proxy.strip()


@lru_cache
def get_settings() -> Settings:
    return Settings()
