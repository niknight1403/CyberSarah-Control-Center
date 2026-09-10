/**
 * Sprint 62 — Workspace-Kaltstart-Resilienz: Render Free friert Dienste
 * nach 15 Minuten Inaktivitaet ein — der Workspace-Service muss beim
 * ersten Aufruf aufwaermen koennen, ohne als 'down' gemeldet zu werden.
 *
 * Klassifiziert Fetch-Fehler der Workspace-Health-Sonde in Kaltstart-
 * verdaechtige (verbindungs-/gateway-bedingt), Auth-Fehler und echte
 * Ausfaelle, liefert eine begrenzte Retry-Strategie mit aufsteigenden
 * Wartezeiten und einen deterministischen Warmup-Plan. Reine Logik —
 * der Router fuehrt nur warten/fetch aus.
 */

export type WorkspaceFailureKind = "coldStart" | "auth" | "down";

/** Aufsteigende Wartezeiten in ms — bewusst begrenzt (Admin-Route). */
export const COLD_START_RETRY_DELAYS_MS = [1_500, 4_000];

const COLD_START_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
]);

const COLD_START_HTTP_STATUSES = new Set([408, 502, 503, 504]);

export interface WorkspaceFailureInput {
  status?: number;
  code?: string;
}

/** Klassifiziert einen fehlgeschlagenen Workspace-Aufruf. */
export function classifyWorkspaceFailure(
  failure: WorkspaceFailureInput,
): WorkspaceFailureKind {
  if (failure.code && COLD_START_ERROR_CODES.has(failure.code)) {
    return "coldStart";
  }
  if (failure.status !== undefined) {
    if (COLD_START_HTTP_STATUSES.has(failure.status)) return "coldStart";
    if (failure.status === 401 || failure.status === 403) return "auth";
  }
  return "down";
}

/** Wahr, solange weitere Kaltstart-Versuche laut Plan uebrig sind. */
export function shouldRetryColdStart(
  attempt: number,
  failure: WorkspaceFailureInput,
  maxAttempts = COLD_START_RETRY_DELAYS_MS.length,
): boolean {
  return (
    classifyWorkspaceFailure(failure) === "coldStart" &&
    attempt < maxAttempts &&
    maxAttempts > 0
  );
}

/** Wartezeit vor dem naechsten Versuch (nach dem letzten Planwert: no more retries). */
export function nextRetryDelayMs(attempt: number): number | null {
  if (attempt < 0 || attempt >= COLD_START_RETRY_DELAYS_MS.length) return null;
  return COLD_START_RETRY_DELAYS_MS[attempt];
}

export interface WarmupStep {
  url: string;
  waitBeforeMs: number;
  attempt: number;
}

/** Deterministischer Warmup-Plan: Health-URL zuerst, Retries mit Plan-Verzoegerung. */
export function buildWarmupPlan(
  baseUrl: string,
  healthPath = "/api/v1/health",
): WarmupStep[] {
  const normalizedBase = String(baseUrl ?? "").replace(/\/+$/, "");
  const url = `${normalizedBase}${healthPath}`;
  const steps: WarmupStep[] = [{ url, waitBeforeMs: 0, attempt: 0 }];
  for (let attempt = 0; attempt < COLD_START_RETRY_DELAYS_MS.length; attempt += 1) {
    steps.push({
      url,
      waitBeforeMs: COLD_START_RETRY_DELAYS_MS[attempt],
      attempt: attempt + 1,
    });
  }
  return steps;
}

/** Humanlesbare Meldung je Fehlerklasse (tokenfrei, fuer Ops-Overview). */
export function describeWorkspaceFailureKind(kind: WorkspaceFailureKind): string {
  switch (kind) {
    case "coldStart":
      return "Workspace-Service weckt auf (Render Free Kaltstart) — kurze Verzoegerung erwartet.";
    case "auth":
      return "Workspace-Service meldet Authentifizierungsfehler — SERVICE_ACCESS_TOKEN pruefen.";
    default:
      return "Workspace-Service antwortet nicht — Dienst-Status pruefen.";
  }
}
