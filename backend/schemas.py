"""Pydantic-DTOs: Request-/Response-Vertrag gegenueber der Expo-App."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import TaskStatus


class TaskCreate(BaseModel):
    """Neuer Task im Ledger (Titel Pflicht, Rest optional)."""

    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    priority: int = Field(default=5, ge=0, le=9)
    payload: dict[str, object] | None = None


class TaskUpdate(BaseModel):
    """Partielles Update: nur gelieferte Felder werden uebernommen."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    priority: int | None = Field(default=None, ge=0, le=9)


class TaskTransition(BaseModel):
    """Statuswechsel ueber die FSM (siehe models.TASK_TRANSITIONS)."""

    status: TaskStatus


class TaskRead(BaseModel):
    """Oeffentliche Task-Repraesentation (Ledger-Ansicht)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    status: TaskStatus
    priority: int
    payload: dict[str, object] | None
    result: str | None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class AgentStateRead(BaseModel):
    """Agent-Zustand fuer Dashboard-Live-Widgets."""

    model_config = ConfigDict(from_attributes=True)

    agent_id: str
    mode: str
    status: str
    current_task_id: int | None
    context: dict[str, object] | None
    updated_at: datetime


class AgentStateWrite(BaseModel):
    """Mode-Wechsel (manual/autonomous) und Context-Merge."""

    mode: str | None = Field(default=None, pattern="^(manual|autonomous)$")
    context: dict[str, object] | None = None


class AgentLogCreate(BaseModel):
    """Client-seitiger Logeintrag (z. B. Mobile-Fehlerkategorien)."""

    task_id: int | None = None
    level: str = Field(default="info", pattern="^(debug|info|warn|error|success)$")
    message: str = Field(min_length=1, max_length=4000)
    data: dict[str, object] | None = None


class AgentLogRead(BaseModel):
    """Logzeile fuer die Terminal-Ansicht."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int | None
    level: str
    message: str
    data: dict[str, object] | None
    created_at: datetime


class ChatMessage(BaseModel):
    """Ein Chat-Beitrag (Rolle + gegiszter Inhalt)."""

    role: str = Field(pattern="^(user|assistant|system)$")
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    """Chat-Anfrage inkl. kurzem Verlauf (serverseitig gepruned)."""

    messages: list[ChatMessage] = Field(min_length=1, max_length=50)
    max_history: int = Field(default=8, ge=1, le=50)


class HealthRead(BaseModel):
    """Liveness-/Readiness-Antwort."""

    ok: bool
    database: bool = False
    mode: str = "manual"
    timestamp: int
