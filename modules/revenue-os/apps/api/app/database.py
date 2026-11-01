"""Async-SQLAlchemy-Engine & Session-Management mit PostgreSQL (Neon)."""

from __future__ import annotations

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from loguru import logger

from app.settings import settings


# ─── Engine & Session ─────────────────────────────────────────────
engine = create_async_engine(
    settings.database_url_str,
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=settings.DEBUG,
    connect_args={
        "ssl": "require" if settings.is_production else "prefer",
        "statement_cache_size": 0,
    },
)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ─── Base Model ──────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ─── Session-Dependency ─────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI-Dependency: liefert eine asynchrone DB-Session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Erstellt alle Tabellen (nur für Entwicklung)."""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("DB-Initialisierung: Alle Tabellen erstellt")
    except Exception as exc:
        logger.error(f"DB-Initialisierung fehlgeschlagen: {exc}")
        raise


async def close_db() -> None:
    """Schließt die Engine beim Server-Shutdown."""
    await engine.dispose()
    logger.info("DB-Engine geschlossen")
