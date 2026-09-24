/**
 * Sprint 355 — Ops-Playbook-Screen: Incident-Abläufe als Checkliste.
 *
 * Strukturierte Incident-Playbooks für Betriebsvorfälle mit Schritt-für-Schritt
 * Abarbeitung, Automatisierungs-Hooks, Verifikationsprüfungen, Protokollierung und Fortgangsmessung.
 */

export type ActionType = "automated" | "manual" | "verification";

export interface PlaybookStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  actionType: ActionType;
  automatedToolName?: string;
  prerequisites?: string[];
  verificationCriteria: string;
}

export interface PlaybookDefinition {
  id: string;
  title: string;
  description: string;
  category: "database" | "api" | "security" | "quota" | "system";
  severity: "critical" | "high" | "medium" | "low";
  steps: PlaybookStep[];
  estimatedTimeMinutes: number;
}

export interface PlaybookStepState {
  stepId: string;
  completed: boolean;
  completedAt?: number;
  completedBy?: string;
  notes?: string;
  verificationPassed?: boolean;
}

export interface PlaybookLogEntry {
  timestamp: number;
  message: string;
  severity: "info" | "warning" | "error";
  actor: string;
}

export interface PlaybookRun {
  runId: string;
  playbookId: string;
  playbookTitle: string;
  startedAt: number;
  completedAt?: number;
  executorUserId: string;
  status: "in_progress" | "completed" | "failed" | "abandoned";
  stepStates: Record<string, PlaybookStepState>;
  executionLogs: PlaybookLogEntry[];
}

export const PRESET_PLAYBOOKS: PlaybookDefinition[] = [
  {
    id: "pb-db-failover",
    title: "Datenbank-Verbindungsstau & Failover",
    description: "Reaktionsplan bei erschöpftem DB Connection Pool oder Unterbrechung der Hauptinstanz.",
    category: "database",
    severity: "critical",
    estimatedTimeMinutes: 15,
    steps: [
      {
        id: "step-db-1",
        stepNumber: 1,
        title: "Aktive Verbindungen prüfen",
        description: "Aktuelle Auslastung des Connection-Pools im Admin-Dashboard auslesen.",
        actionType: "verification",
        verificationCriteria: "Connection count und idle state sind bekannt.",
      },
      {
        id: "step-db-2",
        stepNumber: 2,
        title: "Inaktive Clients trennen",
        description: "Automatischen Clean-Up für verwaiste DB-Pool-Verbindungen triggern.",
        actionType: "automated",
        automatedToolName: "cleanup_db_pool",
        verificationCriteria: "Freigabe von mindestens 20% der Pool-Kapazität.",
      },
      {
        id: "step-db-3",
        stepNumber: 3,
        title: "Read-Replica Failover evaluieren",
        description: "Bei anhaltendem Ausfall den Traffic auf den Standby-Knoten umschalten.",
        actionType: "manual",
        verificationCriteria: "Health-Check der Standby-Datenbank liefert HTTP 200.",
      },
    ],
  },
  {
    id: "pb-api-latency",
    title: "API-Latenz-Spitze & Rate-Limiting",
    description: "Maßnahmen bei plötzlichem Anstieg von 504 Timeouts oder p95-Latenzen > 1000ms.",
    category: "api",
    severity: "high",
    estimatedTimeMinutes: 10,
    steps: [
      {
        id: "step-api-1",
        stepNumber: 1,
        title: "Rate-Limiter temporär verschärfen",
        description: "Aggressive Anfragen-Drosselung für nicht-authentifizierte Clients aktivieren.",
        actionType: "automated",
        automatedToolName: "enable_strict_ratelimit",
        verificationCriteria: "Rate-Limiter-Status steht auf 'strict'.",
      },
      {
        id: "step-api-2",
        stepNumber: 2,
        title: "Worker-Pool skalieren",
        description: "Zusätzliche Backend-Container oder Node-Prozesse starten.",
        actionType: "manual",
        verificationCriteria: "Mindestens 2 neue Instanzen sind im Status 'ready'.",
      },
      {
        id: "step-api-3",
        stepNumber: 3,
        title: "Latenz-Erholung verifizieren",
        description: "Monitoring über 5 Minuten beobachten bis p95 < 400ms sinkt.",
        actionType: "verification",
        verificationCriteria: "p95 Latenz dauerhaft stabil unter 400ms.",
      },
    ],
  },
  {
    id: "pb-sec-token",
    title: "Sicherheitsvorfall: Token-Kompromittierung",
    description: "Sofortige Invalidierung kompromittierter Tokens und Rotation von Geheimnissen.",
    category: "security",
    severity: "critical",
    estimatedTimeMinutes: 5,
    steps: [
      {
        id: "step-sec-1",
        stepNumber: 1,
        title: "Betroffenes Secret sperren",
        description: "Den betroffenen API-Key oder Session-Token sofort revozieren.",
        actionType: "automated",
        automatedToolName: "revoke_api_key",
        verificationCriteria: "Key-Status in der Datenbank ist 'revoked'.",
      },
      {
        id: "step-sec-2",
        stepNumber: 2,
        title: "Aktive Sessions aller Administratoren zurücksetzen",
        description: "Erzwungener Logout aller aktiven Admin-Nutzer.",
        actionType: "manual",
        verificationCriteria: "Session-Store ist bereinigt.",
      },
      {
        id: "step-sec-3",
        stepNumber: 3,
        title: "Audit-Log auf unautorisierte Aktionen prüfen",
        description: "Untersuchung der letzten Zugriffe mit dem betroffenen Token.",
        actionType: "verification",
        verificationCriteria: "Audit-Bericht erstellt und Betroffene informiert.",
      },
    ],
  },
];

/** Liefert alle vordefinierten Incident-Playbooks. */
export function getPresetPlaybooks(): PlaybookDefinition[] {
  return PRESET_PLAYBOOKS;
}

/** Erstellt einen neuen Playbook-Durchlauf. */
export function createPlaybookRun(
  playbook: PlaybookDefinition,
  executorUserId: string,
  nowMs: number = Date.now()
): PlaybookRun {
  const stepStates: Record<string, PlaybookStepState> = {};
  for (const step of playbook.steps) {
    stepStates[step.id] = {
      stepId: step.id,
      completed: false,
    };
  }

  const initialLog: PlaybookLogEntry = {
    timestamp: nowMs,
    message: `Playbook '${playbook.title}' gestartet durch Nutzer ${executorUserId}`,
    severity: "info",
    actor: executorUserId,
  };

  return {
    runId: `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    playbookId: playbook.id,
    playbookTitle: playbook.title,
    startedAt: nowMs,
    executorUserId,
    status: "in_progress",
    stepStates,
    executionLogs: [initialLog],
  };
}

/** Aktualisiert den Status eines Schritts im Playbook-Durchlauf. */
export function toggleStepCompletion(
  run: PlaybookRun,
  stepId: string,
  completedBy: string,
  notes?: string,
  verificationPassed: boolean = true,
  nowMs: number = Date.now()
): PlaybookRun {
  const currentState = run.stepStates[stepId];
  if (!currentState) {
    throw new Error(`Schritt ID '${stepId}' existiert nicht im Playbook-Durchlauf`);
  }

  const newCompleted = !currentState.completed;
  const updatedState: PlaybookStepState = {
    ...currentState,
    completed: newCompleted,
    completedAt: newCompleted ? nowMs : undefined,
    completedBy: newCompleted ? completedBy : undefined,
    notes: notes !== undefined ? notes : currentState.notes,
    verificationPassed: newCompleted ? verificationPassed : undefined,
  };

  const updatedStepStates = {
    ...run.stepStates,
    [stepId]: updatedState,
  };

  const actionMsg = newCompleted
    ? `Schritt '${stepId}' als erledigt markiert (Verifikation: ${verificationPassed ? "ERFOLGREICH" : "FEHLGESCHLAGEN"})`
    : `Schritt '${stepId}' zurückgesetzt`;

  const newLog: PlaybookLogEntry = {
    timestamp: nowMs,
    message: actionMsg,
    severity: verificationPassed || !newCompleted ? "info" : "warning",
    actor: completedBy,
  };

  return {
    ...run,
    stepStates: updatedStepStates,
    executionLogs: [...run.executionLogs, newLog],
  };
}

/** Fügt einen manuellen Logeintrag hinzu. */
export function addLogEntry(
  run: PlaybookRun,
  message: string,
  actor: string,
  severity: "info" | "warning" | "error" = "info",
  nowMs: number = Date.now()
): PlaybookRun {
  return {
    ...run,
    executionLogs: [
      ...run.executionLogs,
      { timestamp: nowMs, message, severity, actor },
    ],
  };
}

/** Berechnet den Fortschritt eines Playbook-Durchlaufs. */
export function calculatePlaybookProgress(
  run: PlaybookRun,
  playbook?: PlaybookDefinition
): { completedCount: number; totalCount: number; percentage: number; isFullyComplete: boolean } {
  const totalCount = playbook ? playbook.steps.length : Object.keys(run.stepStates).length;
  if (totalCount === 0) {
    return { completedCount: 0, totalCount: 0, percentage: 100, isFullyComplete: true };
  }

  const completedCount = Object.values(run.stepStates).filter((s) => s.completed).length;
  const percentage = Math.round((completedCount / totalCount) * 100);
  const isFullyComplete = completedCount === totalCount;

  return { completedCount, totalCount, percentage, isFullyComplete };
}

/** Schließt den Playbook-Durchlauf ab. */
export function finalizePlaybookRun(
  run: PlaybookRun,
  outcome: "completed" | "failed" | "abandoned",
  actor: string,
  nowMs: number = Date.now()
): PlaybookRun {
  const newLog: PlaybookLogEntry = {
    timestamp: nowMs,
    message: `Playbook-Durchlauf abgeschlossen mit Status: ${outcome.toUpperCase()}`,
    severity: outcome === "completed" ? "info" : "error",
    actor,
  };

  return {
    ...run,
    status: outcome,
    completedAt: nowMs,
    executionLogs: [...run.executionLogs, newLog],
  };
}
