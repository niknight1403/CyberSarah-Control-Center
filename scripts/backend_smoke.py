#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from httpx import ASGITransport, AsyncClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app import create_app
from backend.config import Settings


async def main() -> None:
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:", superagent_mode="manual"))
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            health = await client.get("/api/health")
            assert health.status_code == 200, health.text
            health_body = health.json()
            assert health_body["ok"] is True
            assert health_body["database"] is True
            assert health_body["mode"] == "manual"

            created = await client.post("/api/tasks", json={"title": "Smoke-Task", "priority": 5})
            assert created.status_code == 201, created.text
            task = created.json()
            task_id = task["id"]
            assert task["status"] == "pending"

            listed = await client.get("/api/tasks", params={"status": "pending"})
            assert listed.status_code == 200, listed.text
            assert any(item["id"] == task_id for item in listed.json())

            log_resp = await client.post(
                "/api/logs",
                json={"task_id": task_id, "level": "info", "message": "Smoke test log"},
            )
            assert log_resp.status_code == 201, log_resp.text

            logs = await client.get("/api/logs", params={"task_id": task_id})
            assert logs.status_code == 200, logs.text
            assert any(item["message"] == "Smoke test log" for item in logs.json())

            state = await client.put("/api/agent/state", json={"mode": "autonomous"})
            assert state.status_code == 200, state.text
            assert state.json()["mode"] == "autonomous"

            stop = await client.post("/api/agent/stop")
            assert stop.status_code == 202, stop.text
            assert stop.json()["stopped"] is True

            stream = await client.post(
                "/api/chat/stream",
                json={"messages": [{"role": "user", "content": "Statusbericht"}]},
            )
            assert stream.status_code == 200, stream.text
            assert "text/event-stream" in stream.headers["content-type"]

            frames = [
                json.loads(line.removeprefix("data: ").strip())
                for line in stream.text.splitlines()
                if line.startswith("data:")
            ]
            deltas = [frame["delta"] for frame in frames if "delta" in frame]
            assert deltas, "No SSE deltas returned"
            assert frames[-1] == {"done": True}
            assert any("Offline-Modus" in delta for delta in deltas)

    print("backend smoke checks passed")


if __name__ == "__main__":
    asyncio.run(main())
