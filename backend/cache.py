"""Postgres-gestuetzter Status-Cache: seltene Schreibzugriffe, schnelle Reads.

Haeufig abgerufene Statusdaten (Agent-Zustand, Widget-Snapshots) werden
in der ``state_cache``-Tabelle vorgehalten und mit einer TTL gelesen.
Waehrend eines Chats entfaellt damit jede redundante Live-Abfrage —
der Chat-Handler liest ausschliesslich aus dem Cache.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import JSON, DateTime, String, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from .models import Base, utcnow


def _aware(value: datetime) -> datetime:
    """SQLite gibt naive DateTimes zurueck — als UTC interpretieren."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


class StateCacheEntry(Base):
    """Cache-Zeile: JSON-Wert mit Ablaufzeit (TTL)."""

    __tablename__ = "state_cache"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    value: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class StateCache:
    """Repository-Adapter ueber eine bestehende Async-Session."""

    def __init__(self, session: AsyncSession, default_ttl_seconds: int = 30) -> None:
        self._session = session
        self._ttl = default_ttl_seconds

    async def get(self, key: str) -> dict[str, object] | None:
        """Liefert den Cache-Wert oder None (abgelaufen == fehlt)."""
        entry = await self._session.get(StateCacheEntry, key)
        if entry is None:
            return None
        if _aware(entry.expires_at) <= utcnow():
            await self._session.delete(entry)
            await self._session.commit()
            return None
        return entry.value

    async def set(
        self, key: str, value: dict[str, object], ttl_seconds: int | None = None
    ) -> None:
        """Schreibt/ueberschreibt einen Cache-Wert (write-through)."""
        ttl = self._ttl if ttl_seconds is None else ttl_seconds
        entry = await self._session.get(StateCacheEntry, key)
        expires = utcnow() + timedelta(seconds=ttl)
        if entry is None:
            entry = StateCacheEntry(key=key, value=value, expires_at=expires)
            self._session.add(entry)
        else:
            entry.value = value
            entry.expires_at = expires
        await self._session.commit()

    async def invalidate(self, key: str) -> None:
        """Loescht genau einen Cache-Schluessel (idempotent)."""
        entry = await self._session.get(StateCacheEntry, key)
        if entry is not None:
            await self._session.delete(entry)
            await self._session.commit()

    async def keys(self) -> list[str]:
        """Alle aktiven Schluessel (Wartung/Debug-Endpoint)."""
        rows = await self._session.scalars(select(StateCacheEntry.key))
        return list(rows)
