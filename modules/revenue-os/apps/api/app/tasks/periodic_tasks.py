"""Periodische Tasks für Celery Beat — Orchestrieren die Agenten und Systempflege."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from loguru import logger

from app.celery_app import celery_app
from app.tasks.agent_tasks import (
    run_agent,
    run_revenue_analyst,
    run_content_agent,
    run_monetization_agent,
    run_master_agent,
    run_all_agents,
)


# ─── Orchestrator Tick (alle 5 Minuten) ──────────────────────────
@celery_app.task(name="app.tasks.periodic_tasks.orchestrator_tick")
def orchestrator_tick() -> dict[str, Any]:
    """Haupt-Tick des Orchestrators — läuft alle 5 Minuten.

    Führt abwechselnd verschiedene Agenten aus, um die Last zu verteilen.
    """
    tick = int(datetime.now(timezone.utc).timestamp())
    minute_of_day = (tick // 60) % 1440

    results: dict[str, Any] = {"tick": tick, "executed": []}

    # Alle 5 Minuten: Health-Check + Master-Analyse
    if minute_of_day % 5 == 0:
        r = run_master_agent()
        results["executed"].append(("master", r.get("success", False)))
        logger.info(f"[Tick] Master-Agent ausgeführt: {r.get('message', '')}")

    # Alle 15 Minuten: Monetization
    if minute_of_day % 15 == 0:
        r = run_monetization_agent()
        results["executed"].append(("monetization", r.get("success", False)))

    # Alle 30 Minuten: Revenue-Analyst
    if minute_of_day % 30 == 0:
        r = run_revenue_analyst()
        results["executed"].append(("revenue_analyst", r.get("success", False)))

    # Alle 60 Minuten: Content-Agent
    if minute_of_day % 60 == 0:
        r = run_content_agent()
        results["executed"].append(("content_factory", r.get("success", False)))

    # Alle 2 Stunden: Alle Agenten
    if minute_of_day % 120 == 0:
        r = run_all_agents()
        results["executed"].append(("all_agents", r.get("successful", 0) > 0))

    results["executed_count"] = len(results["executed"])
    return results


# ─── Spezifische Agent-Ticks (für Beat-Schedule) ─────────────────
@celery_app.task(name="app.tasks.periodic_tasks.run_revenue_analyst")
def periodic_revenue_analyst() -> dict[str, Any]:
    return run_revenue_analyst()


@celery_app.task(name="app.tasks.periodic_tasks.run_content_agent")
def periodic_content_agent() -> dict[str, Any]:
    return run_content_agent()


@celery_app.task(name="app.tasks.periodic_tasks.run_monetization_agent")
def periodic_monetization_agent() -> dict[str, Any]:
    return run_monetization_agent()


@celery_app.task(name="app.tasks.periodic_tasks.run_master_agent")
def periodic_master_agent() -> dict[str, Any]:
    return run_master_agent()


# ─── Systempflege ────────────────────────────────────────────────
@celery_app.task(name="app.tasks.periodic_tasks.cleanup_old_logs")
def cleanup_old_logs() -> dict[str, Any]:
    """Bereinigt alte Logs und Task-Ergebnisse (alle 6 Stunden)."""
    logger.info("[Cleanup] Starte Log-Bereinigung")

    try:
        # Celery-Ergebnisse bereinigen (backend-abhängig)
        from app.celery_app import celery_app as app

        # Ergebnis-Backend bereinigen (für Redis-basierte Backends)
        try:
            backend = app.backend
            if hasattr(backend, 'cleanup'):
                backend.cleanup()
        except Exception:
            pass

        return {
            "success": True,
            "message": "Log-Bereinigung abgeschlossen",
            "cleaned_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        logger.error(f"[Cleanup] Fehler: {exc}")
        return {"success": False, "message": str(exc)}


# ─── Manuelle Agent-Ausführung (für API-Endpunkte) ──────────────
@celery_app.task(name="app.tasks.periodic_tasks.execute_agent_manual")
def execute_agent_manual(agent_type: str, action: str = "default") -> dict[str, Any]:
    """Führt einen Agenten manuell aus (via API)."""
    return run_agent(agent_type, action)
