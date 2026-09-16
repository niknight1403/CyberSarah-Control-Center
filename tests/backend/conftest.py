"""Gemeinsame Fixtures: isolierte App + HTTPX-Client je Test."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from backend.app import create_app
from backend.config import Settings


@pytest.fixture
def backend_settings(tmp_path: object) -> Settings:
    """SQLite-Test-DB je Test — kein Render-Postgres noetig."""
    return Settings(
        database_url=f"sqlite+aiosqlite:///{tmp_path}/cybersarah-test.db",
        superagent_mode="manual",
    )


@pytest.fixture
async def client(backend_settings: Settings) -> AsyncIterator[AsyncClient]:
    """Lifespan-gestuetzter ASGI-Client (Startup laeuft create_all)."""
    app = create_app(backend_settings)
    async with LifespanManager(app) as manager:
        transport = ASGITransport(app=manager.app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as http:
            yield http
