"""SQLAlchemy-Modelle: Task-Ledger, Agenten-State und Agenten-Logs.

Feldtypen sind absichtlich portabel (JSON statt JSONB, DateTime mit
Zeitzone) — so laufen Produktions-Postgres (Render) und SQLite (Tests)
mit identischem Schema-Code.
"""

from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    """Zeitstempel-Standard (UTC, sekundengenau)."""
    return datetime.now(timezone.utc).replace(microsecond=0)


class Base(DeclarativeBase):
    """Declarative-Basis fuer alle CyberSarah-Tabellen."""


class TaskStatus(str, enum.Enum):
    """Zustaende des Task-Ledgers (Finite-State-Machine)."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


#: Gueltige Uebergaenge der Task-FSM — alle anderen Ablehnungen sind 409.
TASK_TRANSITIONS: dict[str, set[str]] = {
    TaskStatus.PENDING.value: {
        TaskStatus.RUNNING.value,
        TaskStatus.CANCELLED.value,
    },
    TaskStatus.RUNNING.value: {
        TaskStatus.SUCCEEDED.value,
        TaskStatus.FAILED.value,
        TaskStatus.CANCELLED.value,
    },
    TaskStatus.SUCCEEDED.value: set(),
    TaskStatus.FAILED.value: set(),
    TaskStatus.CANCELLED.value: set(),
}


class Task(Base):
    """Task-Ledger: ein autonom oder manuell auszufuehrender Auftrag."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(TaskStatus, native_enum=False, length=20),
        default=TaskStatus.PENDING,
        index=True,
        nullable=False,
    )
    priority: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    payload: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    logs: Mapped[list[AgentLog]] = relationship(
        back_populates="task", cascade="all, delete-orphan", lazy="selectin"
    )

    def may_transition(self, new_status: str) -> bool:
        """FSM-Pruefung: ist der Wechsel von aktualem zu neuem Status erlaubt?"""
        current = TaskStatus(self.status).value
        allowed: set[str] = TASK_TRANSITIONS.get(current, set())
        return new_status in allowed


class AgentState(Base):
    """Singleton-State je Agent (Zeile pro agent_id, upsert per Code)."""

    __tablename__ = "agent_state"
    __table_args__ = (UniqueConstraint("agent_id", name="uq_agent_state_agent_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[str] = mapped_column(String(100), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="idle", nullable=False)
    current_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    context: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class AgentLog(Base):
    """Agenten-Logbuch: jede Ausfuehrungs-, Fehler- und Lifecycle-Notiz."""

    __tablename__ = "agent_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True
    )
    level: Mapped[str] = mapped_column(String(10), default="info", nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )

    task: Mapped[Task | None] = relationship(back_populates="logs")
