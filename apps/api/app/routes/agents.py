"""API-Endpunkte für Agenten-Management — Trigger, Status, History."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel, Field
from loguru import logger

from app.agents.orchestrator import get_orchestrator, AgentTask
from app.agents.base import is_openai_available
from app.tasks.agent_tasks import run_agent as celery_run_agent
from app.agents.implementations.revenue_analyst import RevenueAnalystAgent
from app.agents.implementations.content_agent import ContentAgent
from app.agents.implementations.monetization_agent import MonetizationAgent
from app.agents.implementations.master_agent import MasterAgent

router = APIRouter(prefix="/agents", tags=["KI-Agenten"])


# ─── Schemata ───────────────────────────────────────────────────
class AgentRunRequest(BaseModel):
    action: str = Field("default", description="Aktion, die der Agent ausführen soll")
    payload: dict[str, Any] = Field(default_factory=dict)
    async_mode: bool = Field(False, description="Async (Celery) oder sync (direkt)")


class AgentRunResponse(BaseModel):
    success: bool
    message: str
    data: dict[str, Any] = {}
    duration_ms: int = 0
    task_id: str | None = None


class AgentInfo(BaseModel):
    type: str
    name: str
    description: str
    enabled: bool
    interval_seconds: int | None = None
    last_run: str | None = None
    total_runs: int = 0
    total_errors: int = 0


# ─── Agenten initialisieren und registrieren ────────────────────
def register_default_agents() -> None:
    """Registriert alle Standard-Agenten im Orchestrator."""
    registry = get_orchestrator().registry
    registry.register(RevenueAnalystAgent(), interval_seconds=600)
    registry.register(ContentAgent(), interval_seconds=3600)
    registry.register(MonetizationAgent(), interval_seconds=900)
    registry.register(MasterAgent(), interval_seconds=1800)
    logger.info("✅ Standard-Agenten registriert: revenue_analyst, content_factory, monetization, master")


# ─── GET /agents — Alle Agenten auflisten ───────────────────────
@router.get("", response_model=list[AgentInfo])
async def list_agents() -> list[AgentInfo]:
    """Listet alle registrierten Agenten mit Status auf."""
    registry = get_orchestrator().registry.get_all_records()
    result = []
    for agent_type, record in registry.items():
        result.append(AgentInfo(
            type=agent_type,
            name=record.agent.name,
            description=record.agent.description(),
            enabled=record.enabled,
            interval_seconds=record.interval_seconds,
            last_run=record.last_run.isoformat() if record.last_run else None,
            total_runs=record.total_runs,
            total_errors=record.total_errors,
        ))
    return result


# ─── GET /agents/{agent_type} — Detail eines Agenten ───────────
@router.get("/{agent_type}", response_model=AgentInfo)
async def get_agent(agent_type: str) -> AgentInfo:
    """Detail-Informationen zu einem bestimmten Agenten."""
    registry = get_orchestrator().registry.get_all_records()
    record = registry.get(agent_type)
    if not record:
        raise HTTPException(status_code=404, detail=f"Agent [{agent_type}] nicht gefunden")

    return AgentInfo(
        type=agent_type,
        name=record.agent.name,
        description=record.agent.description(),
        enabled=record.enabled,
        interval_seconds=record.interval_seconds,
        last_run=record.last_run.isoformat() if record.last_run else None,
        total_runs=record.total_runs,
        total_errors=record.total_errors,
    )


# ─── POST /agents/{agent_type}/run — Agent ausführen ──────────
@router.post("/{agent_type}/run", response_model=AgentRunResponse)
async def run_agent_endpoint(
    agent_type: str,
    body: AgentRunRequest,
    background_tasks: BackgroundTasks,
) -> AgentRunResponse:
    """Führt einen Agenten aus (sync oder async via Celery)."""
    if body.async_mode:
        # Async via Celery
        task = celery_run_agent.delay(agent_type, body.action, body.payload)
        return AgentRunResponse(
            success=True,
            message=f"Agent [{agent_type}] gestartet (async)",
            data={"task_id": task.id},
            task_id=task.id,
        )

    # Synchron ausführen
    task = AgentTask(action=body.action, payload=body.payload)
    result = await get_orchestrator().run_single(agent_type, task)

    if result is None:
        raise HTTPException(status_code=404, detail=f"Agent [{agent_type}] nicht gefunden oder deaktiviert")

    return AgentRunResponse(
        success=result.success,
        message=result.message,
        data=result.data,
        duration_ms=result.duration_ms,
    )


# ─── POST /agents/run-all — Alle Agenten ausführen ────────────
@router.post("/run-all", response_model=dict[str, Any])
async def run_all_agents_endpoint() -> dict[str, Any]:
    """Führt ALLE registrierten Agenten parallel aus."""
    import time
    start = time.monotonic()

    results = await get_orchestrator().run_all()

    elapsed = int((time.monotonic() - start) * 1000)
    return {
        "success": True,
        "message": f"Alle Agenten ausgeführt in {elapsed}ms",
        "duration_ms": elapsed,
        "agents": [
            {"type": agent_type, "success": r.success, "message": r.message}
            for agent_type, r in results.items()
        ],
        "total": len(results),
        "successful": sum(1 for r in results.values() if r.success),
    }


# ─── POST /agents/{agent_type}/toggle — Agent aktivieren/deaktivieren ──
@router.post("/{agent_type}/toggle")
async def toggle_agent(agent_type: str, enabled: bool = Query(..., description="true = aktivieren, false = deaktivieren")) -> dict[str, Any]:
    """Aktiviert oder deaktiviert einen Agenten."""
    registry = get_orchestrator().registry
    record = registry.get_all_records().get(agent_type)

    if not record:
        raise HTTPException(status_code=404, detail=f"Agent [{agent_type}] nicht gefunden")

    if enabled:
        registry.enable(agent_type)
    else:
        registry.disable(agent_type)

    return {
        "success": True,
        "message": f"Agent [{agent_type}] {'aktiviert' if enabled else 'deaktiviert'}",
        "enabled": enabled,
    }


# ─── GET /agents/status — Gesamtstatus ──────────────────────────
@router.get("/status", summary="Gesamtstatus aller Agenten")
async def agent_status() -> dict[str, Any]:
    """Zeigt den Gesamtstatus des Agenten-Systems."""
    orchestrator = get_orchestrator()
    status = orchestrator.get_status()

    total = len(status)
    enabled = sum(1 for s in status.values() if s["enabled"])
    total_runs = sum(s.get("totalRuns", 0) for s in status.values())
    total_errors = sum(s.get("totalErrors", 0) for s in status.values())

    return {
        "openai_available": is_openai_available(),
        "agents_total": total,
        "agents_enabled": enabled,
        "total_runs": total_runs,
        "total_errors": total_errors,
        "success_rate": round((1 - total_errors / max(total_runs, 1)) * 100),
        "agents": status,
    }
