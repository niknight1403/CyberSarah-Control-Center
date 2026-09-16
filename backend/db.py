"""Datenbank-Engine und Sitzungsverwaltung (async SQLAlchemy 2.0)."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import Settings


def build_engine(settings: Settings) -> AsyncEngine:
    """Erzeugt die Async-Engine; SQLite (Tests) braucht kein Pool-Pre-Ping."""
    url = settings.sqlalchemy_url
    kwargs: dict[str, object] = {}
    if url.startswith("sqlite"):
        # SQLite-Datei-DBs (lokale Entwicklung) via check_same_thread absichern.
        kwargs["connect_args"] = {"timeout": 30}
    return create_async_engine(
        url, pool_pre_ping=not url.startswith("sqlite"), **kwargs
    )


def build_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Session-Factory mit begin-once-Semantik pro Request/Handler."""
    return async_sessionmaker(engine, expire_on_commit=False)


async def session_scope(
    maker: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    """Yielded eine Session und schliesst sie garantiert (FastAPI-Depends)."""
    async with maker() as session:
        yield session
