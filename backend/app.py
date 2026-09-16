"""App-Factory: FastAPI-Instanz mit allen Routen, WS-Handlern und Lifecycle.

Render-Start: ``uvicorn main:app`` — main.py ruft genau diese Factory auf.
Der Executor-Task startet nur bei SUPERAGENT_MODE=autonomous; Emergency
Stop (POST /api/agent/stop) beendet ihn kontrolliert ueber den Stopp-
Schalter statt eines harten Task-Kills.
"""

from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import Settings
from .db import build_engine, build_sessionmaker
from .executor import EmergencyStop, run_loop
from .models import Base
from .routes import build_router, build_ws_routes
from .ws import ConnectionManager


def create_app(settings: Settings | None = None) -> FastAPI:
    """Baut die vollstaendige Backend-App (Produktion wie Tests)."""
    settings = settings or Settings()
    engine = build_engine(settings)
    maker = build_sessionmaker(engine)
    manager = ConnectionManager()
    stop = EmergencyStop()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        """Startup: Schema anlegen + Executor starten. Shutdown: sauber stoppen."""
        executor_task: asyncio.Task[None] | None = None
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        if settings.superagent_mode == "autonomous":
            executor_task = asyncio.create_task(
                run_loop(maker, settings, manager, stop),
                name="cybersarah-executor",
            )
        yield
        stop.trigger("shutdown")
        await manager.close_all()
        if executor_task is not None:
            executor_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await executor_task
        await engine.dispose()

    app = FastAPI(
        lifespan=lifespan,
        title="CyberSarah Control Center Backend",
        version="1.0.0",
        description="Task-Ledger, Agenten-State, Logs, Chat-Streaming (SSE/WS).",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(build_router(maker, settings, manager, stop))
    app.include_router(build_ws_routes(maker, settings, manager, stop))

    @app.get("/healthz")
    async def liveness() -> dict[str, object]:
        """Render-Liveness: Prozess lebt, keine DB-Praefix."""
        return {"ok": True}

    @app.get("/readyz")
    async def readiness() -> dict[str, object]:
        """Render-Readiness: DB wirklich erreichbar?"""
        try:
            async with maker() as session:
                await session.execute(text("SELECT 1"))
            return {"ok": True, "database": True}
        except Exception:  # noqa: BLE001 — Readiness darf nie crashen
            return {"ok": False, "database": False}

    return app
