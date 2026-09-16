"""Chat-Tests: SSE-Streaming, Prompt-Pruning und Cache-First-Status."""

from __future__ import annotations

import json

from httpx import AsyncClient

from backend.chat import MAX_PROMPT_CHARS, prune_messages, cached_agent_status
from backend.config import Settings
from backend.cache import StateCache


def _messages(count: int, content: str = "Hallo") -> list[dict[str, str]]:
    return [{"role": "user", "content": f"{content} {i}"} for i in range(count)]


def test_prune_keeps_system_prompt_first() -> None:
    pruned = prune_messages(_messages(3), max_history=10)
    assert pruned[0]["role"] == "system"
    assert len(pruned) == 4  # 1 System + 3 Nutzer


def test_prune_limits_history() -> None:
    pruned = prune_messages(_messages(20), max_history=5)
    assert len(pruned) == 6  # System + die 5 neuesten
    assert pruned[-1]["content"] == "Hallo 19"


def test_prune_drops_client_system_messages() -> None:
    messages = [
        {"role": "system", "content": "boesees client-system"},
        {"role": "user", "content": "Frage?"},
    ]
    pruned = prune_messages(messages, max_history=10)
    assert all(m["content"] != "boesees client-system" for m in pruned)


def test_prune_respects_char_budget() -> None:
    long_msgs = [
        {"role": "user", "content": "x" * 3000} for _ in range(10)
    ]
    pruned = prune_messages(long_msgs, max_history=10)
    total = sum(len(m["content"]) for m in pruned)
    assert total <= MAX_PROMPT_CHARS


async def test_sse_stream_deltas_and_done(client: AsyncClient) -> None:
    response = await client.post(
        "/api/chat/stream",
        json={"messages": [{"role": "user", "content": "Statusbericht"}]},
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]

    frames = [
        json.loads(line.removeprefix("data: ").strip())
        for line in response.text.splitlines()
        if line.startswith("data:")
    ]
    deltas = [f["delta"] for f in frames if "delta" in f]
    assert deltas, "Stream muss Deltas liefern"
    assert frames[-1] == {"done": True}
    assert any("Offline-Modus" in d for d in deltas)


async def test_cache_roundtrip(backend_settings: Settings) -> None:
    # Cache-First-Status: Statusdaten landen in der DB statt Redundanz-Queries.
    from backend.db import build_engine, build_sessionmaker
    from backend.models import Base

    engine = build_engine(backend_settings)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = build_sessionmaker(engine)
    async with maker() as session:
        cache = StateCache(session, default_ttl_seconds=60)
        await cache.set("agent:status", {"mode": "autonomous", "tasks": 3})
        assert await cache.get("agent:status") == {"mode": "autonomous", "tasks": 3}
        await cache.invalidate("agent:status")
        assert await cache.get("agent:status") is None
    await engine.dispose()


async def test_cached_agent_status_shape(backend_settings: Settings) -> None:
    from backend.db import build_engine, build_sessionmaker
    from backend.models import Base

    engine = build_engine(backend_settings)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = build_sessionmaker(engine)
    async with maker() as session:
        cache = StateCache(session)
        status = await cached_agent_status(cache, "cybersarah-primary")
        assert status["agent_id"] == "cybersarah-primary"
        assert status["cached"] is True
    await engine.dispose()
