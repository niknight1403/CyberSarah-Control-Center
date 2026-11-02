#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from httpx import ASGITransport, AsyncClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app import create_app
from backend.config import Settings


async def main() -> None:
    settings = Settings(
        database_url=os.getenv("CYBERSARAH_DATABASE_URL", "sqlite+aiosqlite:///./cybersarah-health.db"),
        superagent_mode=os.getenv("CYBERSARAH_SUPERAGENT_MODE", "manual"),
    )
    app = create_app(settings)
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/health")
        print(response.status_code)
        print(response.json())
        assert response.status_code == 200
        assert response.json()["ok"] is True

    print("backend health check passed")


if __name__ == "__main__":
    asyncio.run(main())
