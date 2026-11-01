/**
 * Sprint 29 - Produkt-Sync-Fehler pro Provider mit Recovery-Status.
 *
 * Reine Logik, keine Seiteneffekte. Der Zustand entsteht ausschliesslich aus
 * tatsaechlich beobachteten Sync-Versuchen. Ein Provider gilt nie als
 * "healthy", bevor ein Versuch wirklich erfolgreich war. Authentifizierungs-
 * und Konfigurationsfehler werden nicht automatisch wiederholt, sondern als
 * blockiert mit manuellem Handlungsbedarf ausgewiesen.
 */

export type SyncErrorClass =
  | "auth"
  | "rate_limit"
  | "network"
  | "invalid_response"
  | "not_configured"
  | "unknown";

export type RecoveryStatus = "healthy" | "recovered" | "cooldown" | "degraded" | "blocked";

export interface SyncAttempt {
  provider: string;
  at: number;
  ok: boolean;
  errorClass?: SyncErrorClass;
  errorMessage?: string;
}

export interface ProviderSyncState {
  provider: string;
  status: RecoveryStatus;
  consecutiveFailures: number;
  totalFailures: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastErrorClass: SyncErrorClass | null;
  lastErrorMessage: string | null;
  nextRetryAt: number | null;
  requiresManualAction: boolean;
}

const BACKOFF_STEPS_MS = [30_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000];

/** Exponentielles Backoff mit Deckel; `attempt` ist die laufende Fehlerserie (1-basiert). */
export function syncBackoffMs(consecutiveFailures: number): number {
  const index = Math.min(Math.max(consecutiveFailures, 1), BACKOFF_STEPS_MS.length) - 1;
  return BACKOFF_STEPS_MS[index];
}

const MANUAL_ACTION_CLASSES: readonly SyncErrorClass[] = ["auth", "not_configured"];

/**
 * Klassifiziert einen Provider-Fehler anhand von HTTP-Status/Fehlertext.
 * Reihenfolge ist bewusst: Auth vor Rate-Limit, damit 401/403 nicht als
 * temporaerer Engpass durchrutschen.
 */
export function classifySyncError(error: unknown): { errorClass: SyncErrorClass; message: string } {
  const raw =
    typeof error === "string"
      ? error
      : typeof (error as { message?: unknown })?.message === "string"
        ? String((error as { message: string }).message)
        : String(error ?? "");
  const text = raw.toLowerCase();
  const status = Number((error as { statusCode?: unknown })?.statusCode ?? (error as { status?: unknown })?.status ?? NaN);

  const errorClass: SyncErrorClass =
    status === 401 || status === 403 || /api[-_ ]?key|unauthor|invalid[_ ]key|permission/.test(text)
      ? "auth"
      : status === 429 || /rate.?limit|too many requests/.test(text)
        ? "rate_limit"
        : /econn|etimedout|timeout|network|socket|dns|fetch failed|abort/.test(text)
          ? "network"
          : /nicht korrekt serverseitig konfiguriert|not configured|missing.*key/.test(text)
            ? "not_configured"
            : /unvollstaendig|ungueltig|invalid.*(response|json|payload)/.test(text)
              ? "invalid_response"
              : "unknown";

  return { errorClass, message: raw.trim().slice(0, 500) };
}

/** Maskiert Geheimnisse und personenbezogene Daten in Fehlermeldungen. */
export function maskSyncError(message: string): string {
  return message
    .replace(/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{6,}\b/g, "[key]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[token]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b\d{7,}\b/g, "[id]");
}

/** Wendet einen einzelnen Versuch auf den Vorzustand an. */
export function applySyncAttempt(
  previous: ProviderSyncState | undefined,
  attempt: SyncAttempt,
): ProviderSyncState {
  const base: ProviderSyncState =
    previous ?? {
      provider: attempt.provider,
      status: "degraded",
      consecutiveFailures: 0,
      totalFailures: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastErrorClass: null,
      lastErrorMessage: null,
      nextRetryAt: null,
      requiresManualAction: false,
    };
  if (base.provider !== attempt.provider) {
    throw new Error("Sync-Zustand gehoert zu einem anderen Provider.");
  }

  if (attempt.ok) {
    const hadFailure = base.consecutiveFailures > 0 || base.lastFailureAt !== null;
    return {
      ...base,
      status: hadFailure ? "recovered" : "healthy",
      consecutiveFailures: 0,
      lastSuccessAt: attempt.at,
      nextRetryAt: null,
      requiresManualAction: false,
    };
  }

  const errorClass = attempt.errorClass ?? "unknown";
  const consecutiveFailures = base.consecutiveFailures + 1;
  const manual = MANUAL_ACTION_CLASSES.includes(errorClass);
  const nextRetryAt = manual ? null : attempt.at + syncBackoffMs(consecutiveFailures);
  return {
    ...base,
    status: manual ? "blocked" : attempt.at < nextRetryAt! ? "cooldown" : "degraded",
    consecutiveFailures,
    totalFailures: base.totalFailures + 1,
    lastFailureAt: attempt.at,
    lastErrorClass: errorClass,
    lastErrorMessage: attempt.errorMessage ? maskSyncError(attempt.errorMessage) : null,
    nextRetryAt,
    requiresManualAction: manual,
  };
}

/** Ist ein automatischer Wiederholungsversuch zum Zeitpunkt `now` fachlich erlaubt? */
export function isRetryEligible(state: ProviderSyncState, now: number): boolean {
  if (state.requiresManualAction) return false;
  if (state.status === "healthy" || state.status === "recovered") return false;
  return state.nextRetryAt !== null && now >= state.nextRetryAt;
}

export interface ProviderSyncReportEntry {
  provider: string;
  status: RecoveryStatus;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  nextRetryAt: string | null;
  retryEligible: boolean;
  requiresManualAction: boolean;
  lastErrorClass: SyncErrorClass | null;
  lastErrorMessage: string | null;
}

/** Bericht fuer Admin-Oberflaechen: sortiert nach Schwere, Zeitstempel als ISO. */
export function providerSyncReport(
  states: readonly ProviderSyncState[],
  now: number,
): { providers: ProviderSyncReportEntry[]; worst: RecoveryStatus | "none" } {
  const severity: Record<RecoveryStatus, number> = {
    blocked: 0,
    degraded: 1,
    cooldown: 2,
    recovered: 3,
    healthy: 4,
  };
  const providers = [...states]
    .sort((a, b) => severity[a.status] - severity[b.status] || a.provider.localeCompare(b.provider))
    .map(state => ({
      provider: state.provider,
      status: state.status,
      consecutiveFailures: state.consecutiveFailures,
      lastSuccessAt: state.lastSuccessAt === null ? null : new Date(state.lastSuccessAt).toISOString(),
      nextRetryAt: state.nextRetryAt === null ? null : new Date(state.nextRetryAt).toISOString(),
      retryEligible: isRetryEligible(state, now),
      requiresManualAction: state.requiresManualAction,
      lastErrorClass: state.lastErrorClass,
      lastErrorMessage: state.lastErrorMessage,
    }));
  return { providers, worst: providers[0]?.status ?? "none" };
}
