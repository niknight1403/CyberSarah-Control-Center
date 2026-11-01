"""Celery-Application für asynchrone Tasks und KI-Agenten."""

from __future__ import annotations

from celery import Celery
from loguru import logger

from app.settings import settings

celery_app = Celery(
    "cybersarah",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.agent_tasks",
        "app.tasks.periodic_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Berlin",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,
    task_soft_time_limit=540,
    worker_max_tasks_per_child=100,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    result_expires=86400,
    beat_schedule={
        "agent-orchestrator-every-5-minutes": {
            "task": "app.tasks.periodic_tasks.orchestrator_tick",
            "schedule": 300.0,
            "args": (),
        },
        "revenue-analyst-every-10-minutes": {
            "task": "app.tasks.periodic_tasks.run_revenue_analyst",
            "schedule": 600.0,
            "args": (),
        },
        "master-agent-every-30-minutes": {
            "task": "app.tasks.periodic_tasks.run_master_agent",
            "schedule": 1800.0,
            "args": (),
        },
        "content-agent-every-60-minutes": {
            "task": "app.tasks.periodic_tasks.run_content_agent",
            "schedule": 3600.0,
            "args": (),
        },
        "monetization-agent-every-15-minutes": {
            "task": "app.tasks.periodic_tasks.run_monetization_agent",
            "schedule": 900.0,
            "args": (),
        },
        "cleanup-old-logs-every-6-hours": {
            "task": "app.tasks.periodic_tasks.cleanup_old_logs",
            "schedule": 21600.0,
            "args": (),
        },
    },
)


@celery_app.task(bind=True, name="app.tasks.debug_health")
def debug_health(self) -> dict:
    """Health-Check-Task für Celery."""
    logger.info("Celery-Health-Check: OK")
    return {
        "task_id": self.request.id,
        "status": "healthy",
        "worker": self.request.hostname,
    }


def get_celery() -> Celery:
    """Gibt die Celery-App-Instanz zurück."""
    return celery_app
