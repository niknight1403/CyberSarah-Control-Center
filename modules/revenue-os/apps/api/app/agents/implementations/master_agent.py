"""Master Agent — Zentrale Systemanalyse, koordiniert alle Agenten und optimiert das Gesamtsystem."""

from __future__ import annotations

from app.agents.base import BaseAgent, AgentTask, AgentResult
from app.agents.orchestrator import get_orchestrator


class MasterAgent(BaseAgent):
    """Zentrale Kommandozentrale — analysiert KPIs und optimiert Agenten-Koordination."""

    def __init__(self) -> None:
        super().__init__("Master Agent", "master")

    def description(self) -> str:
        return "Zentrale Systemanalyse, Priorisierung und Optimierung aller Sub-Agenten"

    async def execute(self, task: AgentTask) -> AgentResult:
        action = task.payload.get("action", "system_analyze")

        if action == "system_analyze":
            return await self._analyze_system()
        elif action == "optimize":
            return await self._optimize_system()
        elif action == "report":
            return await self._generate_report()
        else:
            return await self._analyze_system()

    async def _analyze_system(self) -> AgentResult:
        """Führt eine vollständige Systemanalyse durch."""
        orchestrator = get_orchestrator()
        status = orchestrator.get_status()

        total = len(status)
        enabled = sum(1 for s in status.values() if s["enabled"])
        errors = sum(1 for s in status.values() if s.get("totalErrors", 0) > 0)
        total_runs = sum(s.get("totalRuns", 0) for s in status.values())

        recommendations = []
        for agent_type, info in status.items():
            if info.get("totalErrors", 0) > info.get("totalRuns", 1) * 0.3:
                recommendations.append(f"{info['name']}: Fehlerrate >30% — prüfen")
            if not info.get("lastSuccess"):
                recommendations.append(f"{info['name']}: Letzter Lauf fehlgeschlagen")

        health_percent = round((enabled / max(total, 1)) * 100)

        return AgentResult(
            success=True,
            message=f"System: {enabled}/{total} Agenten aktiv, {total_runs} Läufe, {len(recommendations)} Empfehlungen",
            data={
                "agents_total": total,
                "agents_enabled": enabled,
                "agents_with_errors": errors,
                "total_runs": total_runs,
                "health_percent": health_percent,
                "recommendations": recommendations,
                "agent_status": status,
            },
        )

    async def _optimize_system(self) -> AgentResult:
        """Optimiert die Agenten-Konfiguration basierend auf Analyse."""
        orchestrator = get_orchestrator()
        status = orchestrator.get_status()

        # Automatische Optimierungen
        changes = []
        for agent_type, info in status.items():
            if info.get("totalErrors", 0) > 10 and info.get("totalRuns", 0) > 0:
                orchestrator.registry.disable(agent_type)
                changes.append(f"{info['name']}: Deaktiviert (zu viele Fehler)")

        return AgentResult(
            success=True,
            message=f"{len(changes)} Optimierungen vorgenommen",
            data={
                "changes": changes,
                "auto_disabled": len(changes),
            },
        )

    async def _generate_report(self) -> AgentResult:
        """Generiert einen zusammenfassenden Bericht."""
        orchestrator = get_orchestrator()
        status = orchestrator.get_status()
        total_runs = sum(s.get("totalRuns", 0) for s in status.values())
        total_errors = sum(s.get("totalErrors", 0) for s in status.values())

        report = (
            f"CyberSarah System Report\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"Agenten: {len(status)} registriert\n"
            f"Gesamtläufe: {total_runs}\n"
            f"Fehler gesamt: {total_errors}\n"
            f"Erfolgsrate: {round((1 - total_errors / max(total_runs, 1)) * 100)}%\n"
        )

        return AgentResult(
            success=True,
            message=report.strip(),
            data={
                "report": report,
                "total_agents": len(status),
                "total_runs": total_runs,
                "total_errors": total_errors,
                "success_rate": round((1 - total_errors / max(total_runs, 1)) * 100),
            },
        )
