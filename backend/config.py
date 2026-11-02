from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Literal

_DEFAULT_DATABASE_URL = "sqlite+aiosqlite:///./cybersarah.db"
_DEFAULT_SUPERAGENT_MODE: Literal["manual", "autonomous"] = "manual"
_DEFAULT_HOST = "0.0.0.0"
_DEFAULT_PORT = 8000
_ALLOWED_HOSTS = {"0.0.0.0", "127.0.0.1", "localhost"}


def _normalize_host(value: str | None) -> str:
    host = (value or _DEFAULT_HOST).strip()
    if not host:
        return _DEFAULT_HOST
    normalized = host.lower()
    if normalized in _ALLOWED_HOSTS:
        return normalized
    return _DEFAULT_HOST


def _normalize_port(value: int | str | None) -> int:
    try:
        port = int(value if value is not None else _DEFAULT_PORT)
    except (TypeError, ValueError):
        return _DEFAULT_PORT
    if not 1 <= port <= 65535:
        return _DEFAULT_PORT
    return port


@dataclass(slots=True)
class Settings:
    host: str = field(default_factory=lambda: os.getenv("CYBERSARAH_HOST", _DEFAULT_HOST))
    port: int = field(default_factory=lambda: _normalize_port(os.getenv("CYBERSARAH_PORT", _DEFAULT_PORT)))
    database_url: str = field(
        default_factory=lambda: os.getenv("CYBERSARAH_DATABASE_URL", _DEFAULT_DATABASE_URL)
    )
    superagent_mode: Literal["manual", "autonomous"] = field(
        default_factory=lambda: os.getenv("CYBERSARAH_SUPERAGENT_MODE", _DEFAULT_SUPERAGENT_MODE)
    )

    def __post_init__(self) -> None:
        self.host = _normalize_host(self.host)
        self.port = _normalize_port(self.port)
        if not self.database_url:
            self.database_url = _DEFAULT_DATABASE_URL
        mode = str(self.superagent_mode).lower()
        if mode not in {"manual", "autonomous"}:
            self.superagent_mode = _DEFAULT_SUPERAGENT_MODE
        else:
            self.superagent_mode = mode  # type: ignore[assignment]
