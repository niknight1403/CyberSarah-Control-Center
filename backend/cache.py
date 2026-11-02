from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .models import StateCacheEntry


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class StateCache:
    def __init__(self, session, default_ttl_seconds: int = 60) -> None:
        self.session = session
        self.default_ttl_seconds = default_ttl_seconds

    async def set(self, key: str, value, ttl_seconds: int | None = None) -> None:
        ttl = ttl_seconds if ttl_seconds is not None else self.default_ttl_seconds
        expires_at = _aware_utc(datetime.now(timezone.utc) + timedelta(seconds=ttl))
        row = (await self.session.execute(select(StateCacheEntry).where(StateCacheEntry.key == key))).scalar_one_or_none()
        if row is None:
            row = StateCacheEntry(key=key, value=value, expires_at=expires_at)
            self.session.add(row)
        else:
            row.value = value
            row.expires_at = expires_at
        await self.session.commit()

    async def get(self, key: str):
        row = (await self.session.execute(select(StateCacheEntry).where(StateCacheEntry.key == key))).scalar_one_or_none()
        if row is None:
            return None
        if _aware_utc(row.expires_at) <= datetime.now(timezone.utc):
            await self.session.delete(row)
            await self.session.commit()
            return None
        return row.value

    async def invalidate(self, key: str) -> None:
        row = (await self.session.execute(select(StateCacheEntry).where(StateCacheEntry.key == key))).scalar_one_or_none()
        if row is not None:
            await self.session.delete(row)
            await self.session.commit()


async def cached_agent_status(cache: StateCache, agent_id: str):
    status = {"agent_id": agent_id, "cached": True, "cache_keys": [f"agent:{agent_id}:status"]}
    await cache.set(f"agent:{agent_id}:status", status)
    return status
