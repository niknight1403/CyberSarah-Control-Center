"""HTTP-API (FastAPI-Routers): Tasks, Logs, Agent, Chat-SSE, Health."""


import json
import time
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from .cache import StateCache
from .chat import cached_agent_status, prune_messages, stream_llm_answer
from .config import Settings
from .db import session_scope
from .executor import EmergencyStop, log_step
from .models import AgentLog, AgentState, Task, TaskStatus, utcnow
from .schemas import (
    AgentLogCreate,
    AgentLogRead,
    AgentStateRead,
    AgentStateWrite,
    ChatRequest,
    HealthRead,
    TaskCreate,
    TaskRead,
    TaskTransition,
    TaskUpdate,
)
from .ws import ConnectionManager


def build_router(
    maker: async_sessionmaker[AsyncSession],
    settings: Settings,
    manager: ConnectionManager,
    stop: EmergencyStop,
) -> APIRouter:
    """Erzeugt den Haupt-Router mit allen Abhaengigkeiten geschlossen drin."""
    router = APIRouter(prefix="/api")

    async def get_session() -> AsyncIterator[AsyncSession]:
        async for s in session_scope(maker):
            yield s

    SessionDep = Annotated[AsyncSession, Depends(get_session)]

    @router.get("/health", response_model=HealthRead)
    async def health(session: SessionDep) -> HealthRead:
        database = False
        try:
            await session.execute(text("SELECT 1"))
            database = True
        except Exception:  # noqa: BLE001 — Health soll nie 500 werfen
            database = False
        return HealthRead(
            ok=database, database=database,
            mode=settings.superagent_mode, timestamp=int(time.time() * 1000),
        )

    @router.get("/tasks", response_model=list[TaskRead])
    async def list_tasks(
        session: SessionDep,
        status: TaskStatus | None = Query(default=None),
        limit: int = Query(default=50, ge=1, le=200),
    ) -> list[Task]:
        stmt = (
            select(Task)
            .order_by(Task.created_at.desc())
            .limit(limit)
        )
        if status is not None:
            stmt = stmt.where(Task.status == status)
        rows = await session.scalars(stmt)
        return list(rows)

    @router.post("/tasks", response_model=TaskRead, status_code=201)
    async def create_task(body: TaskCreate, session: SessionDep) -> Task:
        task = Task(
            title=body.title,
            description=body.description,
            priority=body.priority,
            payload=body.payload,
        )
        session.add(task)
        await session.commit()
        await session.refresh(task)
        await manager.broadcast(
            "task.created", TaskRead.model_validate(task).model_dump(mode="json")
        )
        return task

    @router.get("/tasks/{task_id}", response_model=TaskRead)
    async def get_task(
        task_id: int, session: SessionDep
    ) -> Task:
        task = await session.get(Task, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Task nicht gefunden")
        return task

    @router.patch("/tasks/{task_id}", response_model=TaskRead)
    async def update_task(task_id: int, body: TaskUpdate, session: SessionDep) -> Task:
        task = await session.get(Task, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Task nicht gefunden")
        if body.title is not None:
            task.title = body.title
        if body.description is not None:
            task.description = body.description
        if body.priority is not None:
            task.priority = body.priority
        task.updated_at = utcnow()
        await session.commit()
        await session.refresh(task)
        await manager.broadcast(
            "task.updated", TaskRead.model_validate(task).model_dump(mode="json")
        )
        return task

    @router.post("/tasks/{task_id}/transition", response_model=TaskRead)
    async def transition_task(
        task_id: int, body: TaskTransition, session: SessionDep
    ) -> Task:
        task = await session.get(Task, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Task nicht gefunden")
        new_status = TaskStatus(body.status).value
        if not task.may_transition(new_status):
            raise HTTPException(
                status_code=409,
                detail=f"Uebergang {TaskStatus(task.status).value} -> {new_status} nicht erlaubt",
            )
        task.status = body.status
        if new_status == TaskStatus.RUNNING.value:
            task.started_at = utcnow()
        if new_status in (
            TaskStatus.SUCCEEDED.value,
            TaskStatus.FAILED.value,
            TaskStatus.CANCELLED.value,
        ):
            task.finished_at = utcnow()
        await session.commit()
        await session.refresh(task)
        await manager.broadcast(
            "task.transition", TaskRead.model_validate(task).model_dump(mode="json")
        )
        return task

    @router.delete("/tasks/{task_id}", status_code=204)
    async def delete_task(task_id: int, session: SessionDep) -> None:
        task = await session.get(Task, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Task nicht gefunden")
        await session.delete(task)
        await session.commit()

    @router.get("/logs", response_model=list[AgentLogRead])
    async def list_logs(
        session: SessionDep,
        task_id: int | None = Query(default=None),
        level: str | None = Query(default=None),
        limit: int = Query(default=100, ge=1, le=500),
    ) -> list[AgentLog]:
        stmt = (
            select(AgentLog)
            .order_by(AgentLog.created_at.desc(), AgentLog.id.desc())
            .limit(limit)
        )
        if task_id is not None:
            stmt = stmt.where(AgentLog.task_id == task_id)
        if level is not None:
            stmt = stmt.where(AgentLog.level == level)
        rows = await session.scalars(stmt)
        return list(rows)

    @router.post("/logs", response_model=AgentLogRead, status_code=201)
    async def create_log(body: AgentLogCreate, session: SessionDep) -> AgentLog:
        return await log_step(session, manager, body.task_id, body.level, body.message, body.data)

    @router.get("/agent/state", response_model=AgentStateRead | None)
    async def get_agent_state(session: SessionDep) -> AgentState | None:
        state = (
            await session.execute(select(AgentState).limit(1))
        ).scalar_one_or_none()
        return state

    @router.put("/agent/state", response_model=AgentStateRead)
    async def put_agent_state(body: AgentStateWrite, session: SessionDep) -> AgentState:
        state = (
            await session.execute(select(AgentState).limit(1))
        ).scalar_one_or_none()
        if state is None:
            state = AgentState(agent_id="cybersarah-primary", mode=body.mode or "manual")
            session.add(state)
        if body.mode is not None:
            settings.superagent_mode = body.mode
            state.mode = body.mode
        if body.context is not None:
            state.context = body.context
        await session.commit()
        await session.refresh(state)
        await manager.broadcast(
            "agent.state", AgentStateRead.model_validate(state).model_dump(mode="json")
        )
        return state

    @router.get("/agent/status")
    async def agent_status(session: SessionDep) -> dict[str, object]:
        cache = StateCache(session)
        return {
            "mode": settings.superagent_mode,
            "stopped": stop.stopped,
            "ws_clients": manager.active,
            "status": await cached_agent_status(cache, "cybersarah-primary"),
        }

    @router.post("/agent/stop", status_code=202)
    async def agent_stop(session: SessionDep, reason: str = "Emergency Stop") -> dict[str, object]:
        stop.trigger(reason)
        await log_step(session, manager, None, "warn", f"Emergency Stop ausgeloest: {reason}")
        settings.superagent_mode = "manual"
        return {"ok": True, "stopped": True, "reason": reason}

    @router.post("/agent/start", status_code=202)
    async def agent_start(session: SessionDep) -> dict[str, object]:
        stop.clear()
        settings.superagent_mode = "autonomous"
        await log_step(session, manager, None, "info", "Autonomer Modus reaktiviert")
        return {"ok": True, "stopped": False, "mode": "autonomous"}

    @router.post("/chat/stream")
    async def chat_stream(body: ChatRequest, session: SessionDep) -> StreamingResponse:
        """SSE-Chat: wortgenaue Deltas als text/event-stream."""
        cache = StateCache(session)
        await cached_agent_status(cache, "cybersarah-primary")
        pruned = prune_messages(
            [m.model_dump() for m in body.messages], body.max_history
        )

        async def sse() -> AsyncIterator[str]:
            full: list[str] = []
            try:
                async for delta in stream_llm_answer(pruned, settings):
                    full.append(delta)
                    yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
                yield "data: {\"done\": true}\n\n"
            except Exception as exc:  # noqa: BLE001 — Fehler im Stream dem Client melden
                yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            sse(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return router


def build_ws_routes(
    maker: async_sessionmaker[AsyncSession],
    settings: Settings,
    manager: ConnectionManager,
    stop: EmergencyStop,
) -> APIRouter:
    """WebSocket-Routen: Live-Events (/ws/tasks) und Chat-Stream (/ws/chat)."""
    router = APIRouter()

    @router.websocket("/ws/tasks")
    async def ws_tasks(websocket: WebSocket) -> None:
        await manager.connect(websocket)
        try:
            while True:
                raw = await websocket.receive_text()
                # Nutzlast-Ausnahme: Ping beantworten, alles andere ignorieren.
                try:
                    msg = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    msg = {}
                if msg.get("action") == "ping":
                    await manager.send(websocket, "pong", {"ok": True})
        except WebSocketDisconnect:
            pass
        finally:
            await manager.disconnect(websocket)

    @router.websocket("/ws/chat")
    async def ws_chat(websocket: WebSocket) -> None:
        await manager.connect(websocket)
        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    msg = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    await manager.send(websocket, "chat.error", {"detail": "Ungueltiges JSON"})
                    continue
                if msg.get("action") == "ping":
                    await manager.send(websocket, "pong", {"ok": True})
                    continue
                request = ChatRequest(**msg)
                pruned = prune_messages(
                    [m.model_dump() for m in request.messages], request.max_history
                )
                async for delta in stream_llm_answer(pruned, settings):
                    await manager.send(websocket, "chat.delta", {"delta": delta})
                await manager.send(websocket, "chat.done", {"ok": True})
        except WebSocketDisconnect:
            pass
        finally:
            await manager.disconnect(websocket)

    return router
