#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.config import Settings


def validate() -> None:
    host = os.getenv("CYBERSARAH_HOST", "0.0.0.0")
    port = os.getenv("CYBERSARAH_PORT", "8000")
    url = os.getenv("CYBERSARAH_DATABASE_URL", "sqlite+aiosqlite:///./cybersarah.db")
    mode = os.getenv("CYBERSARAH_SUPERAGENT_MODE", "manual")

    assert host in {"0.0.0.0", "127.0.0.1", "localhost"}, f"Unsupported host: {host}"
    try:
        int(port)
    except ValueError as exc:
        raise AssertionError(f"CYBERSARAH_PORT must be an integer, got {port!r}") from exc

    settings = Settings(database_url=url, superagent_mode=mode)
    print({
        "host": host,
        "port": port,
        "database_url": settings.database_url,
        "superagent_mode": settings.superagent_mode,
    })
    print("backend env check passed")


if __name__ == "__main__":
    validate()
