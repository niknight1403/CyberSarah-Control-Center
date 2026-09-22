"""Basis-Klasse für alle KI-Agenten im CyberSarah-System.

Jeder Agent hat:
- Einen Namen + Typ
- Eine `execute()`-Methode, die die eigentliche Arbeit macht
- Zugriff auf OpenAI, Datenbank, Redis-Cache
- Logging + Fehlerbehandlung
- Status-Tracking über die Datenbank
"""

from __future__ import annotations

import json
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from openai import AsyncOpenAI
from loguru import logger

from app.settings import settings


# ─── Datenklassen ──────────────────────────────────────────────────
@dataclass
class AgentTask:
    """Eine Aufgabe, die ein Agent ausführen soll."""
    id: str = field(default_factory=lambda: f"task-{uuid.uuid4().hex[:12]}")
    action: str = "default"
    payload: dict[str, Any] = field(default_factory=dict)
    priority: int = 2  # 1 = hoch, 2 = normal, 3 = niedrig
    max_retries: int = 3
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class AgentResult:
    """Ergebnis einer Agent-Ausführung."""
    success: bool
    message: str
    data: dict[str, Any] = field(default_factory=dict)
    duration_ms: int = 0
    token_usage: int = 0


# ─── OpenAI-Client (Singleton) ────────────────────────────────────
_openai_client: Optional[AsyncOpenAI] = None

def get_openai_client() -> AsyncOpenAI:
    """Gibt einen gecachten AsyncOpenAI-Client zurück."""
    global _openai_client
    if _openai_client is None:
        api_key = settings.OPENAI_API_KEY
        if api_key:
            _openai_client = AsyncOpenAI(
                api_key=str(api_key),
                timeout=60.0,
                max_retries=2,
            )
        else:
            raise RuntimeError("OPENAI_API_KEY ist nicht konfiguriert")
    return _openai_client


def is_openai_available() -> bool:
    """Prüft ob OpenAI konfiguriert ist."""
    return settings.OPENAI_API_KEY is not None


# ─── Basis-Klasse ─────────────────────────────────────────────────
class BaseAgent(ABC):
    """Abstrakte Basisklasse für alle KI-Agenten."""

    def __init__(self, name: str, agent_type: str) -> None:
        self.name = name
        self.agent_type = agent_type
        self._openai: Optional[AsyncOpenAI] = None

    @property
    def openai(self) -> AsyncOpenAI:
        """Lazy-Initialisierter OpenAI-Client."""
        if self._openai is None:
            self._openai = get_openai_client()
        return self._openai

    @abstractmethod
    def description(self) -> str:
        """Beschreibt die Aufgabe des Agenten."""
        ...

    @abstractmethod
    async def execute(self, task: AgentTask) -> AgentResult:
        """Führt die eigentliche Agenten-Logik aus."""
        ...

    async def run(self, task: Optional[AgentTask] = None) -> AgentResult:
        """
        Führt den Agenten aus mit vollem Lifecycle:
        Startzeit -> execute() -> Dauer + Token-Zählung
        """
        start = time.monotonic()
        task = task or AgentTask(action="default")

        logger.info(f"🤖 Agent [{self.name}] startet: {task.action}")

        try:
            result = await self.execute(task)
            elapsed = int((time.monotonic() - start) * 1000)
            result.duration_ms = elapsed

            if result.success:
                logger.info(f"✅ Agent [{self.name}] erfolgreich in {elapsed}ms: {result.message}")
            else:
                logger.warning(f"⚠️ Agent [{self.name}] fehlgeschlagen in {elapsed}ms: {result.message}")

            return result

        except Exception as exc:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.error(f"❌ Agent [{self.name}] crashed nach {elapsed}ms: {exc}")
            return AgentResult(
                success=False,
                message=f"Kritischer Fehler: {exc}",
                data={"error": str(exc), "error_type": type(exc).__name__},
                duration_ms=elapsed,
            )

    async def call_openai(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str = "gpt-4o-mini",
        max_tokens: int = 2000,
        temperature: float = 0.7,
        response_format: Optional[dict[str, str]] = None,
    ) -> tuple[str, int]:
        """Vereinfachter OpenAI-Call mit Token-Tracking."""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if response_format:
            kwargs["response_format"] = response_format

        response = await self.openai.chat.completions.create(**kwargs)

        content = response.choices[0].message.content or ""
        tokens = response.usage.total_tokens if response.usage else 0

        return content, tokens

    async def call_openai_json(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str = "gpt-4o-mini",
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> tuple[dict[str, Any], int]:
        """OpenAI-Call mit JSON-Structurerd-Output."""
        raw, tokens = await self.call_openai(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        try:
            parsed = json.loads(raw)
            return parsed, tokens
        except json.JSONDecodeError as exc:
            logger.warning(f"JSON-Decode-Fehler bei OpenAI-Response: {exc}")
            return {"error": "Ungültiges JSON", "raw": raw}, tokens
