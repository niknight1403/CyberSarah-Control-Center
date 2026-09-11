export type OfflineActionStatus = "queued" | "retrying" | "failed" | "completed";

export type OfflineAction = {
  id: string;
  repositoryId: string;
  kind: "commit" | "push" | "pull-request";
  summary: string;
  createdAt: string;
  attempts: number;
  status: OfflineActionStatus;
  hasConflictRisk: boolean;
  lastAttemptAtMs?: number | null;
};

export function enqueueOfflineAction(input: Omit<OfflineAction, "attempts" | "status">): OfflineAction {
  return { ...input, attempts: 0, status: "queued" };
}

export function markOfflineActionRetry(action: OfflineAction, hasConflictRisk: boolean): OfflineAction {
  if (action.status === "completed") return action;
  return { ...action, attempts: action.attempts + 1, status: "retrying", hasConflictRisk };
}

export function markOfflineActionFailed(action: OfflineAction): OfflineAction {
  if (action.status === "completed") return action;
  return { ...action, status: "failed" };
}

export function getNextOfflineAction(actions: OfflineAction[], repositoryId: string): OfflineAction | undefined {
  return actions.find((action) => action.repositoryId === repositoryId && ["queued", "retrying"].includes(action.status));
}

export function canApplyOfflineAction(action: OfflineAction, isOnline: boolean) {
  return isOnline && action.status !== "completed" && !action.hasConflictRisk;
}

// --- Sprint 48: Exponential-Backoff-Integration ---

import { planQueueRetries, type QueueRetryPlan, type RetryPolicy } from "./retry-backoff-logic";

export type { QueueRetryPlan, RetryPolicy } from "./retry-backoff-logic";

/**
 * Standardrichtlinie der Offline-Warteschlange: Wiederholungen nach 30 Sekunden
 * Basisverzögerung, gedeckelt auf 30 Minuten, maximal fünf Versuche. Danach
 * wird eine Aktion endgültig abgelehnt.
 */
export const DEFAULT_OFFLINE_RETRY_POLICY: RetryPolicy = {
  baseDelayMs: 30_000,
  maxDelayMs: 30 * 60_000,
  maxAttempts: 5,
};

/**
 * Erweitert die Warteschlangeneinheit um den Zeitpunkt des letzten Versuchs,
 * damit der Backoff deterministisch an den echten Versuch anschließen kann.
 * Bestehende Einträge ohne Zeitstempel fallen auf `null` zurück.
 */
export function recordOfflineActionAttempt(
  action: OfflineAction,
  nowMs: number,
  hasConflictRisk: boolean
): OfflineAction {
  if (action.status === "completed") return action;
  if (!Number.isFinite(nowMs)) {
    throw new Error("Ein endlicher Versuchszeitpunkt ist erforderlich.");
  }
  return {
    ...markOfflineActionRetry(action, hasConflictRisk),
    lastAttemptAtMs: Math.floor(nowMs),
  };
}

/**
 * Hebt die Offline-Aktion auf das Backoff-Modell ab: Konfliktrisiko wird zum
 * blockierenden Konflikt, der letzte Versuchszeitpunkt fehlt toleranterweise nie.
 */
function toRetryable(action: OfflineAction) {
  return {
    id: action.id,
    attempts: action.attempts,
    lastAttemptAtMs: action.lastAttemptAtMs ?? null,
    conflict: action.hasConflictRisk,
  };
}

/**
 * Plant die Wiederholungen der offenen Warteschlange mit
 * Exponential-Backoff: planbare Aktionen erhalten ihren nächsten
 * Versuchszeitpunkt (aufsteigend sortiert), konfliktierende Aktionen
 * blockieren sichtbar und erschöpfte Versuche werden final abgelehnt.
 * Abgeschlossene und endgültig abgelehnte Aktionen werden nicht geplant.
 */
export function planOfflineQueueRetries(
  actions: OfflineAction[],
  nowMs: number,
  policy: RetryPolicy = DEFAULT_OFFLINE_RETRY_POLICY
): QueueRetryPlan {
  if (!Number.isFinite(nowMs)) {
    throw new Error("Ein endlicher Planungszeitpunkt ist erforderlich.");
  }
  const open = actions.filter((action) => action.status === "queued" || action.status === "retrying");
  return planQueueRetries(open.map(toRetryable), policy, Math.floor(nowMs));
}

/**
 * Wendet den Wiederholungsplan auf die Warteschlange an: Endgültig
 * abgelehnte (erschöpfte) Aktionen werden als `failed` markiert,
 * blockierte und geplante Aktionen bleiben unverändert stehen. Der
 * Rückgabewert enthält die aktualisierte Warteschlange und den Plan
 * zur sichtbaren Begründung.
 */
export function advanceOfflineQueue(
  actions: OfflineAction[],
  nowMs: number,
  policy: RetryPolicy = DEFAULT_OFFLINE_RETRY_POLICY
): { actions: OfflineAction[]; plan: QueueRetryPlan } {
  const plan = planOfflineQueueRetries(actions, nowMs, policy);
  const rejected = new Set(plan.exhausted.map((entry) => entry.id));
  return {
    actions: actions.map((action) => (rejected.has(action.id) ? markOfflineActionFailed(action) : action)),
    plan,
  };
}
