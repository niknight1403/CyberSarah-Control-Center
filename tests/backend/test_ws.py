"""WebSocket-Tests: Live-Events, Ping/Pong und Chat-Stream (sync TestClient)."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import Settings


def _make_app(tmp_path: object) -> TestClient:
    settings = Settings(
        database_url=f"sqlite+aiosqlite:///{tmp_path}/ws-test.db",
        superagent_mode="manual",
    )
    app = create_app(settings)
    # Lifespan (create_all) wird vom TestClient-Kontextmanager ausgefuehrt.
    return TestClient(app)  # type: ignore[arg-type]


def test_task_creation_broadcasts_to_ws(tmp_path: object) -> None:
    with _make_app(tmp_path) as client:
        with client.websocket_connect("/ws/tasks") as ws:
            created = client.post("/api/tasks", json={"title": "Live-Task"})
            assert created.status_code == 201

            event = json.loads(ws.receive_text())
            assert event["type"] == "task.created"
            assert event["data"]["title"] == "Live-Task"
            assert "ts" in event


def test_ws_ping_pong(tmp_path: object) -> None:
    with _make_app(tmp_path) as client:
        with client.websocket_connect("/ws/tasks") as ws:
            ws.send_text(json.dumps({"action": "ping"}))
            event = json.loads(ws.receive_text())
            assert event["type"] == "pong"
            assert event["data"] == {"ok": True}


def test_log_creation_broadcasts(tmp_path: object) -> None:
    with _make_app(tmp_path) as client:
        with client.websocket_connect("/ws/tasks") as ws:
            posted = client.post(
                "/api/logs", json={"level": "error", "message": "Terminal-Test"}
            )
            assert posted.status_code == 201
            event = json.loads(ws.receive_text())
            assert event["type"] == "log.appended"
            assert event["data"]["level"] == "error"


def test_ws_chat_stream(tmp_path: object) -> None:
    with _make_app(tmp_path) as client:
        with client.websocket_connect("/ws/chat") as ws:
            ws.send_text(
                json.dumps(
                    {
                        "messages": [{"role": "user", "content": "Kurz antworten"}],
                        "max_history": 4,
                    }
                )
            )
            deltas: list[str] = []
            while True:
                event = json.loads(ws.receive_text())
                if event["type"] == "chat.done":
                    break
                if event["type"] == "chat.delta":
                    deltas.append(event["data"]["delta"])
            assert deltas, "WS-Chat-Stream muss Deltas liefern"
            assert any("Offline-Modus" in d for d in deltas)
