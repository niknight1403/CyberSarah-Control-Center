"""Executor-Tests: autonome Loop, FSM-Endzustaende, Emergency Stop."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from backend.config import Settings
from backend.db import build_engine, build_sessionmaker
from backend.executor import EmergencyStop, run_cycle
from backend.models import AgentLog, Base, Task, TaskStatus
from backend.ws import ConnectionManager


@pytest.fixture
def settings(tmp_path: object) -> Settings:
    return Settings(
        database_url=f"sqlite+aiosqlite:///{tmp_path}/exec-test.db",
        superagent_mode="autonomous",
    )


async def _init_db(settings: Settings):
    engine = build_engine(settings)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine, build_sessionmaker(engine)


async def test_run_cycle_executes_pending_task(settings: Settings) -> None:
    engine, maker = await _init_db(settings)
    manager = ConnectionManager()
    stop = EmergencyStop()

    async with maker() as session:
        session.add(Task(title="Auto-Task", description="Pruefen", priority=5))
        await session.commit()

    ran = await run_cycle(maker, settings, manager, stop)
    assert ran is True

    async with maker() as session:
        tasks = list(await session.scalars(select(Task)))
        assert len(tasks) == 1
        assert tasks[0].status == TaskStatus.SUCCEEDED
        assert tasks[0].result
        assert tasks[0].finished_at is not None

        logs = list(await session.scalars(select(AgentLog)))
        levels = {log.level for log in logs}
        assert "info" in levels
        assert "success" in levels
    await engine.dispose()


async def test_run_cycle_idle_without_tasks(settings: Settings) -> None:
    engine, maker = await _init_db(settings)
    manager = ConnectionManager()
    stop = EmergencyStop()
    assert await run_cycle(maker, settings, manager, stop) is False
    await engine.dispose()


async def test_emergency_stop_blocks_cycle(settings: Settings) -> None:
    engine, maker = await _init_db(settings)
    manager = ConnectionManager()
    stop = EmergencyStop()
    stop.trigger("Terminal-Button")

    async with maker() as session:
        session.add(Task(title="Blocked"))
        await session.commit()

    assert await run_cycle(maker, settings, manager, stop) is False

    async with maker() as session:
        task = (await session.scalars(select(Task))).one()
        assert task.status == TaskStatus.PENDING  # unberuehrt
    await engine.dispose()
