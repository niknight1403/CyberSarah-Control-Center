from __future__ import annotations

import json
from collections.abc import Iterable

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    @property
    def clients(self) -> int:
        return len(self._connections)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self._connections:
            self._connections.discard(websocket)

    async def broadcast(self, payload: dict) -> None:
        for websocket in list(self._connections):
            await websocket.send_json(payload)

    async def send(self, websocket: WebSocket, payload: dict) -> None:
        await websocket.send_json(payload)


def encode_event(event_type: str, data: object, *, ts: int | None = None) -> str:
    event = {"type": event_type, "data": data}
    if ts is not None:
        event["ts"] = ts
    return json.dumps(event)


def _as_json(value: object) -> str:
    return json.dumps(value)
