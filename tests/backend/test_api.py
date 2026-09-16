"""REST-API-Tests: Task-Ledger (CRUD + FSM), Logs, Agent-State, Health."""

from __future__ import annotations

from httpx import AsyncClient


async def test_health(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["database"] is True
    assert body["mode"] == "manual"


async def test_create_and_list_tasks(client: AsyncClient) -> None:
    created = await client.post(
        "/api/tasks", json={"title": "Server-Check", "priority": 7}
    )
    assert created.status_code == 201
    task = created.json()
    assert task["status"] == "pending"
    assert task["priority"] == 7

    listed = await client.get("/api/tasks", params={"status": "pending"})
    assert listed.status_code == 200
    assert [t["title"] for t in listed.json()] == ["Server-Check"]


async def test_get_task_404(client: AsyncClient) -> None:
    response = await client.get("/api/tasks/999")
    assert response.status_code == 404


async def test_update_task(client: AsyncClient) -> None:
    created = await client.post("/api/tasks", json={"title": "Alt"})
    task_id = created.json()["id"]
    patched = await client.patch(
        f"/api/tasks/{task_id}", json={"title": "Neu", "priority": 1}
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["title"] == "Neu"
    assert body["priority"] == 1


async def test_transition_fsm_valid(client: AsyncClient) -> None:
    created = await client.post("/api/tasks", json={"title": "T1"})
    task_id = created.json()["id"]

    running = await client.post(
        f"/api/tasks/{task_id}/transition", json={"status": "running"}
    )
    assert running.status_code == 200
    assert running.json()["status"] == "running"

    done = await client.post(
        f"/api/tasks/{task_id}/transition", json={"status": "succeeded"}
    )
    assert done.status_code == 200


async def test_transition_fsm_rejects_invalid(client: AsyncClient) -> None:
    created = await client.post("/api/tasks", json={"title": "T2"})
    task_id = created.json()["id"]

    # pending -> succeeded ist kein erlaubter Uebergang: 409.
    rejected = await client.post(
        f"/api/tasks/{task_id}/transition", json={"status": "succeeded"}
    )
    assert rejected.status_code == 409


async def test_delete_task(client: AsyncClient) -> None:
    created = await client.post("/api/tasks", json={"title": "Weg damit"})
    task_id = created.json()["id"]
    deleted = await client.delete(f"/api/tasks/{task_id}")
    assert deleted.status_code == 204
    assert (await client.get(f"/api/tasks/{task_id}")).status_code == 404


async def test_logs_roundtrip(client: AsyncClient) -> None:
    created = await client.post("/api/tasks", json={"title": "Mit Log"})
    task_id = created.json()["id"]

    posted = await client.post(
        "/api/logs", json={"task_id": task_id, "level": "warn", "message": "Test-Warnung"}
    )
    assert posted.status_code == 201

    listed = await client.get("/api/logs", params={"task_id": task_id})
    body = listed.json()
    assert len(body) == 1
    assert body[0]["level"] == "warn"
    assert body[0]["message"] == "Test-Warnung"


async def test_agent_state_upsert_and_stop(client: AsyncClient) -> None:
    put = await client.put("/api/agent/state", json={"mode": "autonomous"})
    assert put.status_code == 200
    assert put.json()["mode"] == "autonomous"

    stopped = await client.post("/api/agent/stop")
    assert stopped.status_code == 202
    assert stopped.json()["stopped"] is True

    status = await client.get("/api/agent/status")
    body = status.json()
    assert body["stopped"] is True
    assert body["ws_clients"] == 0

    started = await client.post("/api/agent/start")
    assert started.json()["stopped"] is False
