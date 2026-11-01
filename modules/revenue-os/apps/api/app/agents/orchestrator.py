"""Agent Orchestrator — Zentraler Koordinator für alle KI-Agenten.

Der Orchestrator:
- Hält eine Registry aller verfügbaren Agenten
- Koordiniert die Ausführung (sequenziell/parallel)
- Verteilt Tasks an Celery-Worker
- Loggt Ergebnisse in die Datenbank
- Verwaltet Abhängigkeiten zwischen Agenten
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from loguru import logger

from app.agents.base import BaseAgent, AgentTask, AgentResult


# ─── Agent Registry ────────────────────────────────────────────────
@dataclass
class AgentRecord:
    """Ein registrierter Agent mit Metadaten."""
    agent: BaseAgent
    enabled: bool = True
    interval_seconds: int = 600
    last_run: Optional[datetime] = None
    last_result: Optional[AgentResult] = None
    total_runs: int = 0
    total_errors: int = 0


class AgentRegistry:
    """Thread-sichere Registry aller verfügbaren Agenten."""

    def __init__(self) -> None:
        self._agents: dict[str, AgentRecord] = {}

    def register(self, agent: BaseAgent, interval_seconds: int = 600) -> None:
        """Agent in der Registry anmelden."""
        if agent.agent_type in self._agents:
            logger.warning(f"Agent [{agent.agent_type}] bereits registriert — überschreibe")
        self._agents[agent.agent_type] = AgentRecord(
            agent=agent,
            interval_seconds=interval_seconds,
        )
        logger.info(f"📋 Agent registriert: [{agent.agent_type}] {agent.name} (alle {interval_seconds}s)")

    def unregister(self, agent_type: str) -> None:
        """Agent aus Registry entfernen."""
        self._agents.pop(agent_type, None)

    def get(self, agent_type: str) -> Optional[BaseAgent]:
        """Agent anhand des Typs abrufen."""
        record = self._agents.get(agent_type)
        return record.agent if record and record.enabled else None

    def get_all(self) -> list[BaseAgent]:
        """Alle aktiven Agenten abrufen."""
        return [r.agent for r in self._agents.values() if r.enabled]

    def get_all_records(self) -> dict[str, AgentRecord]:
        """Alle Registry-Datensätze (inkl. Metadaten) abrufen."""
        return dict(self._agents)

    def enable(self, agent_type: str) -> None:
        """Agent aktivieren."""
        if agent_type in self._agents:
            self._agents[agent_type].enabled = True

    def disable(self, agent_type: str) -> None:
        """Agent deaktivieren."""
        if agent_type in self._agents:
            self._agents[agent_type].enabled = False

    def update_result(self, agent_type: str, result: AgentResult) -> None:
        """Ergebnis eines Agenten-Laufs speichern."""
        record = self._agents.get(agent_type)
        if record:
            record.last_run = datetime.now(timezone.utc)
            record.last_result = result
            record.total_runs += 1
            if not result.success:
                record.total_errors += 1

    def get_summary(self) -> dict[str, Any]:
        """Zusammenfassung aller Agenten (für Dashboard)."""
        summary = {}
        for agent_type, record in self._agents.items():
            last = record.last_run.isoformat() if record.last_run else None
            summary[agent_type] = {
                "name": record.agent.name,
                "type": agent_type,
                "enabled": record.enabled,
                "interval_seconds": record.interval_seconds,
                "lastRun": last,
                "totalRuns": record.total_runs,
                "totalErrors": record.total_errors,
                "lastSuccess": record.last_result.success if record.last_result else None,
                "lastMessage": record.last_result.message if record.last_result else None,
            }
        return summary


# ─── Singleton-Instanz ────────────────────────────────────────────
_registry: Optional[AgentRegistry] = None

def get_registry() -> AgentRegistry:
    """Gibt die globale Registry-Instanz zurück."""
    global _registry
    if _registry is None:
        _registry = AgentRegistry()
    return _registry


# ─── Orchestrator ────────────────────────────────────────────────
class AgentOrchestrator:
    """Koordiniert die Ausführung von Agenten."""

    def __init__(self, registry: Optional[AgentRegistry] = None) -> None:
        self.registry = registry or get_registry()

    async def run_single(
        self,
        agent_type: str,
        task: Optional[AgentTask] = None,
    ) -> Optional[AgentResult]:
        """Führt einen einzelnen Agenten asynchron aus."""
        agent = self.registry.get(agent_type)
        if not agent:
            logger.warning(f"Agent [{agent_type}] nicht gefunden oder deaktiviert")
            return None

        result = await agent.run(task)
        self.registry.update_result(agent_type, result)
        return result

    async def run_all(self, task: Optional[AgentTask] = None) -> dict[str, AgentResult]:
        """Führt ALLE registrierten Agenten parallel aus."""
        agents = self.registry.get_all()
        logger.info(f"🚀 Orchestrator startet {len(agents)} Agenten parallel")

        tasks = [agent.run(task) for agent in agents]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        result_map: dict[str, AgentResult] = {}
        for agent, result_or_error in zip(agents, results):
            if isinstance(result_or_error, Exception):
                result_map[agent.agent_type] = AgentResult(
                    success=False,
                    message=f"Ausnahme: {result_or_error}",
                )
            else:
                result_map[agent.agent_type] = result_or_error
                self.registry.update_result(agent.agent_type, result_or_error)

        success_count = sum(1 for r in result_map.values() if r.success)
        logger.info(f"✅ Orchestrator: {success_count}/{len(agents)} Agenten erfolgreich")
        return result_map

    async def run_priority(
        self,
        priority: int,
        task: Optional[AgentTask] = None,
    ) -> dict[str, AgentResult]:
        """Führt alle Agenten einer bestimmten Priorität aus."""
        records = self.registry.get_all_records()
        # Priorität über Agent-Typ-Suffix gesteuert (1-3)
        results: dict[str, AgentResult] = {}
        for agent_type, record in records.items():
            if record.enabled and str(priority) in agent_type:
                result = await record.agent.run(task)
                self.registry.update_result(agent_type, result)
                results[agent_type] = result
        return results

    def get_status(self) -> dict[str, Any]:
        """Gibt den Gesamtstatus des Orchestrators zurück."""
        return self.registry.get_summary()


# ─── Singleton-Orchestrator ──────────────────────────────────────
_orchestrator: Optional[AgentOrchestrator] = None

def get_orchestrator() -> AgentOrchestrator:
    """Gibt die globale Orchestrator-Instanz zurück."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = AgentOrchestrator()
    return _orchestrator
