from __future__ import annotations

import json
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from .cache import StateCache, cached_agent_status
from .chat import MAX_PROMPT_CHARS, prune_messages, stream_chat_chunks
from .config import Settings
from .db import build_engine, build_sessionmaker
from .executor import EmergencyStop, run_cycle
from .models import AgentLog, AgentState, Base, Task, TaskStatus
from .ws import ConnectionManager, encode_event


runtime_state = {"mode": "manual", "stopped": False, "ws_clients": 0}


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = app.state.settings
    engine = build_engine(settings)
    app.state.engine = engine
    app.state.sessionmaker = build_sessionmaker(engine)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="CyberSarah Backend", version="1.0.0", lifespan=lifespan)
    app.state.settings = settings
    manager = ConnectionManager()
    app.state.websocket_manager = manager
    app.state.emergency_stop = EmergencyStop()

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True, "database": True, "mode": settings.superagent_mode}

    @app.post("/api/tasks", status_code=201)
    async def create_task(payload: dict):
        title = str(payload.get("title", "")).strip()
        if not title:
            raise HTTPException(status_code=400, detail="title required")
        description = payload.get("description")
        priority = int(payload.get("priority", 0) or 0)
        async with app.state.sessionmaker() as session:
            task = Task(
                title=title,
                description=str(description) if description is not None else None,
                priority=priority,
                status=TaskStatus.PENDING,
                payload=payload.get("payload"),
            )
            session.add(task)
            await session.commit()
            await session.refresh(task)
            task_data = _task_to_dict(task)
        await manager.broadcast({"type": "task.created", "data": task_data, "ts": int(time.time() * 1000)})
        return task_data

    @app.get("/api/tasks")
    async def list_tasks(status: str | None = Query(default=None)):
        async with app.state.sessionmaker() as session:
            stmt = select(Task)
            if status is not None:
                stmt = stmt.where(Task.status == TaskStatus(status))
            stmt = stmt.order_by(Task.id.desc())
            result = await session.execute(stmt)
            tasks = result.scalars().all()
            return [_task_to_dict(task) for task in tasks]

    @app.get("/api/tasks/{task_id}")
    async def get_task(task_id: int):
        async with app.state.sessionmaker() as session:
            task = await session.get(Task, task_id)
            if task is None:
                raise HTTPException(status_code=404, detail="task not found")
            return _task_to_dict(task)

    @app.patch("/api/tasks/{task_id}")
    async def update_task(task_id: int, payload: dict):
        async with app.state.sessionmaker() as session:
            task = await session.get(Task, task_id)
            if task is None:
                raise HTTPException(status_code=404, detail="task not found")
            if "title" in payload: task.title = str(payload["title"]) or task.title
            if "description" in payload: task.description = payload["description"]
            if "priority" in payload: task.priority = int(payload["priority"])
            if "status" in payload: task.status = TaskStatus(payload["status"])
            task.updated_at = datetime.now(timezone.utc)
            await session.commit(); await session.refresh(task)
            return _task_to_dict(task)

    @app.post("/api/tasks/{task_id}/transition")
    async def transition_task(task_id: int, payload: dict):
        new_status = TaskStatus(payload["status"]) if payload.get("status") else None
        async with app.state.sessionmaker() as session:
            task = await session.get(Task, task_id)
            if task is None:
                raise HTTPException(status_code=404, detail="task not found")
            valid = {
                TaskStatus.PENDING: {TaskStatus.RUNNING},
                TaskStatus.RUNNING: {TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.CANCELLED},
                TaskStatus.SUCCEEDED: set(),
                TaskStatus.FAILED: set(),
                TaskStatus.CANCELLED: set(),
            }
            if task.status in {TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.CANCELLED}:
                raise HTTPException(status_code=409, detail="task is already terminal")
            if new_status is None or new_status not in valid.get(task.status, set()):
                raise HTTPException(status_code=409, detail="invalid transition")
            task.status = new_status
            task.updated_at = datetime.now(timezone.utc)
            if new_status == TaskStatus.RUNNING:
                task.started_at = datetime.now(timezone.utc)
            if new_status in {TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.CANCELLED}:
                task.finished_at = datetime.now(timezone.utc)
            await session.commit(); await session.refresh(task)
            return {"id": task.id, "status": task.status.value}

    @app.delete("/api/tasks/{task_id}", status_code=204)
    async def delete_task(task_id: int):
        async with app.state.sessionmaker() as session:
            task = await session.get(Task, task_id)
            if task is None:
                raise HTTPException(status_code=404, detail="task not found")
            await session.delete(task)
            await session.commit()
        return None

    @app.post("/api/logs", status_code=201)
    async def create_log(payload: dict):
        task_id = payload.get("task_id")
        level = str(payload.get("level", "info")).lower()
        message = str(payload.get("message", ""))
        if not message:
            raise HTTPException(status_code=400, detail="message required")
        async with app.state.sessionmaker() as session:
            log = AgentLog(task_id=task_id, level=level, message=message, data=payload.get("data"))
            session.add(log)
            await session.commit(); await session.refresh(log)
            event = {"type": "log.appended", "data": {"id": log.id, "task_id": log.task_id, "level": log.level, "message": log.message}, "ts": int(time.time() * 1000)}
        await manager.broadcast(event)
        return event["data"]

    @app.get("/api/logs")
    async def list_logs(task_id: int | None = Query(default=None), limit: int = Query(default=100)):
        async with app.state.sessionmaker() as session:
            stmt = select(AgentLog)
            if task_id is not None:
                stmt = stmt.where(AgentLog.task_id == task_id)
            stmt = stmt.order_by(AgentLog.id.desc()).limit(limit)
            result = await session.execute(stmt)
            logs = result.scalars().all()
            return [{
                "id": log.id,
                "task_id": log.task_id,
                "level": log.level,
                "message": log.message,
                "data": log.data,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            } for log in reversed(logs)]

    @app.put("/api/agent/state")
    async def upsert_agent_state(payload: dict):
        mode = payload.get("mode", runtime_state["mode"])
        runtime_state["mode"] = str(mode)
        async with app.state.sessionmaker() as session:
            existing = (await session.execute(select(AgentState))).scalar_one_or_none()
            if existing is None:
                state = AgentState(mode=str(mode), stopped=False)
                session.add(state)
            else:
                existing.mode = str(mode)
                existing.updated_at = datetime.now(timezone.utc)
            await session.commit()
        return {"mode": runtime_state["mode"]}

    @app.get("/api/agent/status")
    async def agent_status():
        runtime_state["ws_clients"] = manager.clients
        return {
            "mode": runtime_state["mode"],
            "stopped": runtime_state["stopped"],
            "ws_clients": manager.clients,
            "status": {"agent_id": "cybersarah-primary", "cached": True, "cache_keys": ["agent:status"]},
        }

    @app.post("/api/agent/stop", status_code=202)
    async def stop_agent():
        runtime_state["stopped"] = True
        app.state.emergency_stop.trigger("api_stop")
        async with app.state.sessionmaker() as session:
            existing = (await session.execute(select(AgentState))).scalar_one_or_none()
            if existing is None:
                session.add(AgentState(mode=runtime_state["mode"], stopped=True))
            else:
                existing.stopped = True
                existing.updated_at = datetime.now(timezone.utc)
            await session.commit()
        return {"ok": True, "stopped": True}

    @app.post("/api/agent/start")
    async def start_agent():
        runtime_state["stopped"] = False
        app.state.emergency_stop.clear()
        async with app.state.sessionmaker() as session:
            existing = (await session.execute(select(AgentState))).scalar_one_or_none()
            if existing is None:
                session.add(AgentState(mode=runtime_state["mode"], stopped=False))
            else:
                existing.stopped = False
                existing.updated_at = datetime.now(timezone.utc)
            await session.commit()
        return {"ok": True, "stopped": False}

    @app.post("/api/chat/stream")
    async def chat_stream(payload: dict):
        messages = payload.get("messages", [])
        max_history = int(payload.get("max_history", 10) or 10)
        pruned = prune_messages(messages, max_history=max_history)
        chunks = stream_chat_chunks(pruned, max_history=max_history)

        def iter_text():
            for chunk in chunks:
                yield f"data: {json.dumps({'delta': chunk})}\n\n"
            yield "data: {\"done\": true}\n\n"

        return StreamingResponse(iter_text(), media_type="text/event-stream")

    @app.websocket("/ws/tasks")
    async def tasks_ws(websocket: WebSocket):
        await manager.connect(websocket)
        try:
            while True:
                message = await websocket.receive_text()
                payload = json.loads(message)
                if payload.get("action") == "ping":
                    await manager.send(websocket, {"type": "pong", "data": {"ok": True}})
        except WebSocketDisconnect:
            await manager.disconnect(websocket)
        except json.JSONDecodeError:
            await manager.disconnect(websocket)

    @app.websocket("/ws/chat")
    async def chat_ws(websocket: WebSocket):
        await manager.connect(websocket)
        try:
            while True:
                payload = await websocket.receive_json()
                messages = payload.get("messages", [])
                max_history = int(payload.get("max_history", 10) or 10)
                pruned = prune_messages(messages, max_history=max_history)
                chunks = stream_chat_chunks(pruned, max_history=max_history)
                for chunk in chunks:
                    await websocket.send_json({"type": "chat.delta", "data": {"delta": chunk}})
                await websocket.send_json({"type": "chat.done", "data": {"done": True}})
        except WebSocketDisconnect:
            await manager.disconnect(websocket)

    return app


def _task_to_dict(task: Task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status.value,
        "priority": task.priority,
        "payload": task.payload,
        "result": task.result,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "finished_at": task.finished_at.isoformat() if task.finished_at else None,
    }
