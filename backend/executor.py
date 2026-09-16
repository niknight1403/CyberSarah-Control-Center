"""Autonome Superagent-Executor-Loop (SUPERAGENT_MODE=autonomous).

Ein Zyklus:
  1. aeltesten PENDING-Task im Ledger claimen (status -> RUNNING, atomic)
  2. Ausfuehrung: LLM (falls Key) oder deterministischer Offline-Runner
  3. Jeder Schritt landet in agent_logs + wird per WebSocket gebroadcastet
  4. FSM-Endzustand schreiben (SUCCEEDED/FAILED) + Agent-State aktualisieren
Ein globaler Stopp-Schalter (Emergency Stop) unterbricht die Loop sauber.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from .chat import stream_llm_answer
from .models import AgentLog, AgentState, Task, TaskStatus, utcnow
from .schemas import TaskRead
from .ws import ConnectionManager

if TYPE_CHECKING:
    from .config import Settings


class ExecutorStop(Exception):
    """Signalisiert den Emergency Stop an die laufende Ausfuehrung."""


class EmergencyStop:
    """Prozessweiter Stopp-Schalter (POST /api/agent/stop setzt ihn)."""

    def __init__(self) -> None:
        self.stopped = False

    def trigger(self, reason: str) -> None:
        """Stopp anfordern — naechster Zyklus beendet sich sauber."""
        self.stopped = True
        self.reason = reason

    def clear(self) -> None:
        """Wieder freigeben (POST /api/agent/start)."""
        self.stopped = False


async def claim_next_task(session: AsyncSession) -> Task | None:
    """Claimed atomar den aeltesten PENDING-Task (Prioritaet vor Zeit)."""
    stmt = (
        select(Task)
        .where(Task.status == TaskStatus.PENDING)
        .order_by(Task.priority.desc(), Task.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    result = await session.execute(stmt)
    task = result.scalar_one_or_none()
    if task is None:
        return None
    task.status = TaskStatus.RUNNING
    task.started_at = utcnow()
    await session.commit()
    return task


async def log_step(
    session: AsyncSession,
    manager: ConnectionManager,
    task_id: int | None,
    level: str,
    message: str,
    data: dict[str, object] | None = None,
) -> AgentLog:
    """Log-Zeile persistieren UND live ans Terminal broadcasten."""
    entry = AgentLog(task_id=task_id, level=level, message=message, data=data)
    session.add(entry)
    await session.commit()
    await manager.broadcast(
        "log.appended",
        {
            "id": entry.id,
            "task_id": task_id,
            "level": level,
            "message": message,
            "data": data,
        },
    )
    return entry


async def execute_task(
    session: AsyncSession,
    task: Task,
    settings: "Settings",
    manager: ConnectionManager,
) -> str:
    """Fuehrt einen Task aus und liefert den Ergebnis-Text."""
    await log_step(
        session, manager, task.id, "info", f"Task {task.id} gestartet: {task.title}"
    )

    try:
        prompt = (
            f"Task: {task.title}\n"
            f"Beschreibung: {task.description or '-'}\n"
            "Liefere ein kompaktes Ergebnis als Zusammenfassung."
        )
        chunks: list[str] = []
        async for delta in stream_llm_answer(
            [{"role": "user", "content": prompt}], settings
        ):
            chunks.append(delta)
            await manager.broadcast(
                "chat.delta", {"task_id": task.id, "delta": delta}
            )
        result = "".join(chunks).strip()
    except Exception as exc:  # noqa: BLE001 — jeder Fehler landet im Ledger
        await log_step(
            session, manager, task.id, "error", f"Task {task.id} fehlgeschlagen: {exc}"
        )
        raise

    await log_step(
        session, manager, task.id, "success",
        f"Task {task.id} abgeschlossen", {"chars": len(result)},
    )
    return result


async def finish_task(
    session: AsyncSession,
    manager: ConnectionManager,
    task_id: int,
    status: TaskStatus,
    result: str,
) -> None:
    """FSM-Endzustand + Broadcast des finalen Task-Reads."""
    await session.execute(
        update(Task)
        .where(Task.id == task_id)
        .values(
            status=status,
            result=result,
            finished_at=utcnow(),
        )
    )
    await session.commit()
    refreshed = await session.get(Task, task_id)
    if refreshed is not None:
        await manager.broadcast(
            "task.transition", TaskRead.model_validate(refreshed).model_dump(mode="json")
        )


async def run_cycle(
    maker: async_sessionmaker[AsyncSession],
    settings: "Settings",
    manager: ConnectionManager,
    stop: EmergencyStop,
    agent_id: str = "cybersarah-primary",
) -> bool:
    """Ein Executor-Zyklus: True gelaufen, False wenn nichts zu tun war."""
    if stop.stopped:
        return False

    async with maker() as session:
        task = await claim_next_task(session)
        if task is None:
            return False

        await _set_agent_state(session, agent_id, "busy", task.id)
        await manager.broadcast(
            "task.transition",
            TaskRead.model_validate(task).model_dump(mode="json"),
        )
        try:
            result = await execute_task(session, task, settings, manager)
        except Exception:
            await finish_task(session, manager, task.id, TaskStatus.FAILED, "Executor-Fehler")
            await _set_agent_state(session, agent_id, "idle", None)
            return True

        await finish_task(session, manager, task.id, TaskStatus.SUCCEEDED, result)
        await _set_agent_state(session, agent_id, "idle", None)
        return True


async def _set_agent_state(
    session: AsyncSession, agent_id: str, status: str, current_task_id: int | None
) -> None:
    """Upsert des Agent-Singletons (eine Zeile je agent_id)."""
    state = (
        await session.execute(select(AgentState).where(AgentState.agent_id == agent_id))
    ).scalar_one_or_none()
    if state is None:
        state = AgentState(
            agent_id=agent_id, mode="autonomous",
            status=status, current_task_id=current_task_id,
        )
        session.add(state)
    else:
        state.status = status
        state.current_task_id = current_task_id
    await session.commit()


async def run_loop(
    maker: async_sessionmaker[AsyncSession],
    settings: "Settings",
    manager: ConnectionManager,
    stop: EmergencyStop,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    """Hintergrund-Loop (nur aktiv bei SUPERAGENT_MODE=autonomous)."""
    while not stop.stopped:
        try:
            ran = await run_cycle(maker, settings, manager, stop)
        except Exception:  # noqa: BLE001 — Loop stirbt nie
            ran = False
        if not ran:
            await sleep(settings.superagent_interval)
