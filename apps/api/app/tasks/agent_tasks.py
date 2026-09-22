"""Celery-Agent-Tasks — Führen KI-Agenten asynchron in Celery-Workern aus.

Diese Tasks werden von `celery_app.py` geladen und periodisch
vom Celery Beat Scheduler getriggert.
"""

from __future__ import annotations

import asyncio
from typing import Any

from loguru import logger

from app.celery_app import celery_app
from app.agents.base import AgentTask
from app.agents.orchestrator import get_orchestrator


def _run_async(coro):
    """Hilfsfunktion: Führt eine async Coroutine in Celery aus."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ─── Generic Agent Runner ────────────────────────────────────────
@celery_app.task(bind=True, name="app.tasks.agent_tasks.run_agent", max_retries=3, default_retry_delay=30)
def run_agent(self, agent_type: str, action: str = "default", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Führt einen beliebigen Agenten asynchron aus."""
    logger.info(f"[Celery] Starte Agent: {agent_type} (action={action})")

    try:
        task = AgentTask(action=action, payload=payload or {})
        result = _run_async(get_orchestrator().run_single(agent_type, task))

        if result is None:
            raise ValueError(f"Agent [{agent_type}] nicht gefunden")

        return {
            "success": result.success,
            "message": result.message,
            "data": result.data,
            "duration_ms": result.duration_ms,
            "task_id": self.request.id,
        }

    except Exception as exc:
        logger.error(f"[Celery] Agent [{agent_type}] fehlgeschlagen: {exc}")
        try:
            self.retry(exc=exc)
        except Exception as retry_exc:
            return {
                "success": False,
                "message": f"Agent fehlgeschlagen nach {self.request.retries} Versuchen: {retry_exc}",
                "data": {},
                "duration_ms": 0,
                "task_id": self.request.id,
            }


# ─── Spezifische Agent-Tasks ─────────────────────────────────────
@celery_app.task(name="app.tasks.agent_tasks.run_revenue_analyst")
def run_revenue_analyst() -> dict[str, Any]:
    """Führt den RevenueAnalystAgent aus (scan + create)."""
    return run_agent("revenue_analyst", action="scan_all")


@celery_app.task(name="app.tasks.agent_tasks.run_content_agent")
def run_content_agent() -> dict[str, Any]:
    """Führt den ContentAgent aus (generate_all)."""
    return run_agent("content_factory", action="generate_all")


@celery_app.task(name="app.tasks.agent_tasks.run_monetization_agent")
def run_monetization_agent() -> dict[str, Any]:
    """Führt den MonetizationAgent aus (auto_optimize)."""
    return run_agent("monetization", action="auto_optimize", payload={"brand": "CyberSarah"})


@celery_app.task(name="app.tasks.agent_tasks.run_master_agent")
def run_master_agent() -> dict[str, Any]:
    """Führt den MasterAgent aus (system_analyze)."""
    return run_agent("master", action="system_analyze")


@celery_app.task(name="app.tasks.agent_tasks.run_all_agents")
def run_all_agents() -> dict[str, list[dict[str, Any]]]:
    """Führt ALLE registrierten Agenten aus (vom Orchestrator gesteuert)."""
    logger.info("[Celery] Starte ALLE Agenten via Orchestrator")

    try:
        results = _run_async(get_orchestrator().run_all())
        return {
            "agents": [
                {"type": agent_type, "success": r.success, "message": r.message}
                for agent_type, r in results.items()
            ],
            "total": len(results),
            "successful": sum(1 for r in results.values() if r.success),
        }
    except Exception as exc:
        logger.error(f"[Celery] run_all_agents fehlgeschlagen: {exc}")
        return {"agents": [], "total": 0, "successful": 0, "error": str(exc)}
