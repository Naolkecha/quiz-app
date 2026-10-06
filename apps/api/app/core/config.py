"""Application settings. Secrets come from the environment, never from the client."""

from functools import lru_cache
from pathlib import Path
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_API_ROOT = Path(__file__).resolve().parents[2]
_REPO_ROOT = Path(__file__).resolve().parents[4]


def _env_files() -> tuple[str, ...]:
    candidates = (_REPO_ROOT / ".env", _API_ROOT / ".env")
    return tuple(str(path) for path in candidates if path.is_file())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "test", "production"] = "development"
    app_name: str = "Challenge"
    database_url: str
    secret_key: str = Field(min_length=32)
    session_ttl_seconds: int = Field(default=86_400, gt=0, le=60 * 60 * 24 * 30)
    telegram_bot_token: str = ""
    telegram_bot_username: str = ""
    webapp_url: str = "http://localhost:3000"
    init_data_max_age_seconds: int = Field(default=86_400, gt=0)
    init_data_clock_skew_seconds: int = Field(default=30, ge=0, le=300)
    cors_origins: str = "http://localhost:3000"
    verify_et_base_url: str = "https://verify.et"
    verify_et_api_key: str = ""
    verify_et_webhook_secret: str = ""
    telebirr_settlement_account: str = ""
    telebirr_account_name: str = "Naol Kecha"
    admin_api_key: str = ""

    @field_validator(
        "secret_key",
        "telegram_bot_token",
        "telegram_bot_username",
        "webapp_url",
        "verify_et_api_key",
        "verify_et_webhook_secret",
        "telebirr_settlement_account",
        "telebirr_account_name",
        "admin_api_key",
        "verify_et_base_url",
    )
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        url = value.strip()
        if url.startswith("postgres://"):
            url = "postgresql+asyncpg://" + url[len("postgres://") :]
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://") :]
        if "sslmode=" in url or "channel_binding=" in url:
            from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

            parsed = urlsplit(url)
            query_pairs = []
            for k, v in parse_qsl(parsed.query):
                if k == "channel_binding":
                    continue
                if k == "sslmode":
                    query_pairs.append(("ssl", "require"))
                else:
                    query_pairs.append((k, v))
            url = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query_pairs), parsed.fragment))
        return url

    @model_validator(mode="after")
    def production_requires_bot_token(self) -> Self:
        if self.app_env == "production" and not self.telegram_bot_token:
            raise ValueError("TELEGRAM_BOT_TOKEN is required when APP_ENV=production")
        if self.app_env == "production" and not self.verify_et_api_key:
            raise ValueError("VERIFY_ET_API_KEY is required when APP_ENV=production")
        if len(self.secret_key) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def dev_auth_enabled(self) -> bool:
        return self.app_env == "development"

    @property
    def verify_et_configured(self) -> bool:
        return bool(self.verify_et_api_key)

    @property
    def deposits_enabled(self) -> bool:
        return self.verify_et_configured or self.app_env in {"development", "test"}

    @property
    def withdrawals_enabled(self) -> bool:
        return True

    @property
    def deposit_mode(self) -> str:
        if self.verify_et_configured:
            return "verify_et"
        if self.app_env in {"development", "test"}:
            return "local_stub"
        return "credentials_required"


@lru_cache
def get_settings() -> Settings:
    return Settings()
