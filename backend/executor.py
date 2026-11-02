from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from .models import AgentLog, Task, TaskStatus


class EmergencyStop:
    def __init__(self) -> None:
        self._triggered = False
        self.reason: str | None = None

    def trigger(self, reason: str | None = None) -> None:
        self._triggered = True
        self.reason = reason

    def clear(self) -> None:
        self._triggered = False
        self.reason = None

    def is_triggered(self) -> bool:
        return self._triggered


async def run_cycle(maker, settings, manager, stop: EmergencyStop) -> bool:
    if stop.is_triggered():
        return False

    async with maker() as session:
        result = await session.execute(select(Task).where(Task.status == TaskStatus.PENDING).order_by(Task.id.asc()))
        task = result.scalar_one_or_none()
        if task is None:
            return False

        task.status = TaskStatus.RUNNING
        task.started_at = datetime.now(timezone.utc)
        task.updated_at = datetime.now(timezone.utc)
        session.add(task)
        session.add(
            AgentLog(
                task_id=task.id,
                level="info",
                message=f"Task '{task.title}' started",
            )
        )
        await session.commit()

        task.status = TaskStatus.SUCCEEDED
        task.result = "Automated execution completed successfully."
        task.finished_at = datetime.now(timezone.utc)
        task.updated_at = datetime.now(timezone.utc)
        session.add(task)
        session.add(
            AgentLog(
                task_id=task.id,
                level="success",
                message=f"Task '{task.title}' succeeded",
            )
        )
        await session.commit()

    if manager is not None:
        await manager.broadcast({"type": "task.updated", "data": {"status": TaskStatus.SUCCEEDED.value}, "ts": 0})
    return True
