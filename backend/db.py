from __future__ import annotations

from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import Settings


def _normalize_database_url(database_url: str) -> str:
    try:
        url = make_url(database_url)
    except Exception:
        return database_url

    if url.get_backend_name() != "sqlite":
        return database_url

    db_name = url.database
    if not db_name or db_name == ":memory:":
        return database_url

    path = Path(db_name)
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)

    url = url.set(database=str(path))
    return str(url)


def build_engine(settings: Settings):
    database_url = _normalize_database_url(settings.database_url)
    return create_async_engine(database_url, echo=False, future=True)


def build_sessionmaker(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_sessionmaker(settings: Settings):
    engine = build_engine(settings)
    maker = build_sessionmaker(engine)
    async with maker() as session:
        yield session
    await engine.dispose()
