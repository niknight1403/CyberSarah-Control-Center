"""WebSocket-Verbindungsmanager: Echtzeit-Events an die Expo-App.

Protokoll (JSON, bidirektional):
  Server -> Client: {"type": "<event>", "data": {...}, "ts": <epoch_ms>}
  Client -> Server: {"action": "ping"} | {"action": "subscribe"}
Events: task.created, task.updated, task.transition, log.appended,
        agent.state, chat.delta (pro Token-Chunk), chat.done, chat.error.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import time
from typing import Any

from fastapi import WebSocket


def _now_ms() -> int:
    return int(time.time() * 1000)


def make_event(event_type: str, data: Any) -> str:
    """Serialisiert ein Event deterministisch (eine Zeile, ein Frame)."""
    return json.dumps({"type": event_type, "data": data, "ts": _now_ms()}, ensure_ascii=False)


class ConnectionManager:
    """Haelte alle aktiven WS-Clients und fan-out Events an alle.

    Ein fehlgeschlagener Send wird ignoriert (Client haengt) — das
    Disconnect-Cleanup uebernimmt FastAPI im ``finally``-Zweig des
    Handlers.
    """

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    @property
    def active(self) -> int:
        """Anzahl verbundener Clients (fuer /api/agent/status)."""
        return len(self._connections)

    async def connect(self, websocket: WebSocket) -> None:
        """Handshake ausfuehren und Client registrieren."""
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        """Client deregistrieren (idempotent)."""
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, event_type: str, data: Any) -> None:
        """Event an alle Clients senden; tote Verbindungen fallen raus."""
        frame = make_event(event_type, data)
        async with self._lock:
            targets = list(self._connections)
        for ws in targets:
            with contextlib.suppress(Exception):
                await ws.send_text(frame)

    async def send(self, websocket: WebSocket, event_type: str, data: Any) -> None:
        """Event an genau einen Client (z. B. private Chat-Streams)."""
        await websocket.send_text(make_event(event_type, data))

    async def close_all(self, code: int = 1001) -> None:
        """Beim Shutdown alle Sockets ordentlich schliessen."""
        async with self._lock:
            targets = list(self._connections)
            self._connections.clear()
        for ws in targets:
            with contextlib.suppress(Exception):
                await ws.close(code=code)
