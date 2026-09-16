"""Zentrale Konfiguration des CyberSarah-Backends.

Alle Werte kommen aus Umgebungsvariablen (Render injiziert sie beim
Blueprint-Deploy). Fallbacks halten lokale Entwicklung und Tests ohne
 weitere Einrichtung lauffaehig.
"""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalize_database_url(url: str) -> str:
    """Uebersetzt Render-/Neon-Connection-Strings in SQLAlchemy-Async-URLs.

    Render liefert ``postgresql://user:pass@host/db``. Fuer den asyncpg-
    Treiber benoetigt SQLAlchemy ``postgresql+asyncpg://``. SQLite-URLs
    (Tests) bleiben unangetastet.
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


class Settings(BaseSettings):
    """Typsichere Backend-Konfiguration (Pydantic v2)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Render Postgres (Blueprint: fromDatabase cybersarah-db).
    database_url: str = "sqlite+aiosqlite:///./cybersarah.db"

    # "autonomous" aktiviert die Superagent-Executor-Loop (Blueprint-Default).
    superagent_mode: str = "manual"

    # Abstand zwischen Executor-Zyklen in Sekunden.
    superagent_interval: float = 5.0

    # CORS: Expo-Web-Export auf Render + lokale Entwicklung.
    allowed_origins: str = "*"

    # Optionaler Managed-LLM-Key (OPENAI_API_KEY) — ohne Key laeuft ein
    # deterministischer Offline-Executor, damit der Task-Ledger trotzdem
    # vollstaendig durchlaeuft.
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"

    @property
    def sqlalchemy_url(self) -> str:
        """DATABASE_URL in Treiber-Form fuer async SQLAlchemy."""
        return _normalize_database_url(self.database_url)

    @property
    def origins(self) -> list[str]:
        if self.allowed_origins.strip() == "*":
            return ["*"]
        return [
            origin.strip()
            for origin in self.allowed_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    """Prozessweite Settings-Instanz (in FastAPI via Depends injizierbar)."""
    env = os.environ.get("CYBERSARAH_TEST_DATABASE_URL")
    if env:
        # Testmodus: bewusst keine Cache-Wiederverwendung zwischen Runs.
        get_settings.cache_clear()
        return Settings(database_url=env)
    return Settings()
