"""CyberSarah Revenue OS — Zentrale Konfiguration.

Lädt Umgebungsvariablen aus .env / Umgebung mit Validierung via pydantic-settings.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, PostgresDsn, SecretStr


class Settings(BaseSettings):
    """Application-Konfiguration — Werte aus .env oder Umgebungsvariablen."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──
    APP_NAME: str = "CyberSarah Revenue OS"
    APP_VERSION: str = "3.0.0"
    DEBUG: bool = False
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    PORT: int = 8000
    CORS_ORIGINS: list[str] = ["*"]

    # ── PostgreSQL ──
    DATABASE_URL: PostgresDsn = Field(
        default="postgresql+asyncpg://neondb_owner:npg_fW5jIqBbRvs8@ep-gentle-credit-zamfgpk9-pooler.c-2.eu-west-2.aws.neon.tech/neondb",
    )
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10

    # ── Redis ──
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── JWT ──
    JWT_SECRET_KEY: SecretStr = Field(
        default="super-secret-key-change-in-production-32chars",
        min_length=32,
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Stripe ──
    STRIPE_SECRET_KEY: SecretStr | None = None
    STRIPE_PUBLISHABLE_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None

    # ── OpenAI ──
    OPENAI_API_KEY: SecretStr | None = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_MAX_TOKENS: int = 2000

    # ── Digistore24 ──
    DIGISTORE24_API_KEY: SecretStr | None = None
    DIGISTORE24_AFFILIATE_ID: str | None = None

    # ── Resend (E-Mail) ──
    RESEND_API_KEY: SecretStr | None = None
    RESEND_FROM_EMAIL: str = "noreply@cybersarah.app"

    # ── Firebase ──
    FIREBASE_SERVER_KEY: SecretStr | None = None

    # ── Celery ──
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # ── API Keys ──
    GEMINI_API_KEY: SecretStr | None = None
    GEMINI_BACKUP_KEY: SecretStr | None = None

    # ── Push ──
    PUBLIC_APP_URL: str = "https://cybersarah.app"

    @property
    def jwt_secret_key_bytes(self) -> bytes:
        return str(self.JWT_SECRET_KEY).encode("utf-8")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def database_url_str(self) -> str:
        return str(self.DATABASE_URL).replace("postgresql+asyncpg://", "postgresql+asyncpg://")


@lru_cache
def get_settings() -> Settings:
    """Gecachte Settings-Instanz (Singleton)."""
    return Settings()


settings = get_settings()
