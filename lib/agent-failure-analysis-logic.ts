/**
 * Sprint 371 — Misserfolg-Analyse: fehlgeschlagene Läufe klassifizieren
 *
 * Analysiert fehlgeschlagene Agenten-Läufe und klassifiziert Fehlerursachen
 * in strukturierte Kategorien. Empfiehlt automatische Wiederholungsstrategien
 * (z. B. Exponentieller Backoff, Kontextreduktion, Provider-Wechsel) oder
 * Eskalation.
 */

export type FailureCategory =
  | "rate_limit"
  | "timeout"
  | "token_limit"
  | "context_overflow"
  | "invalid_args"
  | "external_api"
  | "permission_denied"
  | "logic_error"
  | "unknown";

export type FailureSeverity = "transient" | "recoverable" | "fatal";

export type FailureDetails = {
  errorName?: string;
  errorMessage: string;
  toolName?: string;
  statusCode?: number;
  attemptCount?: number;
  contextSize?: number;
};

export type RecoveryRecommendation =
  | "retry_backoff"
  | "reduce_context"
  | "fix_arguments"
  | "switch_provider"
  | "escalate_human"
  | "abort";

export type FailureAnalysis = {
  category: FailureCategory;
  severity: FailureSeverity;
  rootCause: string;
  isRetryable: boolean;
  recommendedAction: RecoveryRecommendation;
  recoveryStrategy: string;
  incidentSummary: string;
};

/**
 * Klassifiziert ein einzelnes Fehlerereignis anhand von Text- und Statusmerkmalen.
 */
export function classifyFailure(details: FailureDetails): FailureAnalysis {
  const msg = (details.errorMessage || "").toLowerCase();
  const errName = (details.errorName || "").toLowerCase();
  const code = details.statusCode;

  let category: FailureCategory = "unknown";
  let severity: FailureSeverity = "fatal";
  let isRetryable = false;
  let recommendedAction: RecoveryRecommendation = "escalate_human";
  let recoveryStrategy = "Manuelle Überprüfung erforderlich.";

  // 1. Rate Limits & Quotas
  if (
    code === 429 ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("quota exceeded")
  ) {
    category = "rate_limit";
    severity = "transient";
    isRetryable = true;
    recommendedAction = "retry_backoff";
    recoveryStrategy = "Exponentiellen Backoff mit Jitter anwenden (z. B. 2s, 5s, 15s).";
  }
  // 2. Timeouts
  else if (
    code === 504 ||
    code === 408 ||
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset")
  ) {
    category = "timeout";
    severity = "transient";
    isRetryable = (details.attemptCount ?? 1) < 3;
    recommendedAction = isRetryable ? "retry_backoff" : "switch_provider";
    recoveryStrategy = isRetryable
      ? "Netzwerk-Timeout: Erneuten Versuch nach kurzer Pause durchführen."
      : "Mehrfache Timeouts: Auf alternativen Provider oder Fallback-Endpunkt wechseln.";
  }
  // 3. Token Limits & Kontextüberlauf
  else if (
    msg.includes("context length") ||
    msg.includes("maximum context") ||
    msg.includes("token limit") ||
    msg.includes("too long")
  ) {
    category = msg.includes("context") ? "context_overflow" : "token_limit";
    severity = "recoverable";
    isRetryable = true;
    recommendedAction = "reduce_context";
    recoveryStrategy = "Kontextfenster verdichten, frühere Interaktionen zusammenfassen oder Prompt kürzen.";
  }
  // 4. Ungültige Argumente & Syntax
  else if (
    code === 400 ||
    msg.includes("invalid argument") ||
    msg.includes("validation error") ||
    msg.includes("schema failed") ||
    errName.includes("validationerror")
  ) {
    category = "invalid_args";
    severity = "fatal"; // Kann nicht ohne Änderung der Parameter wiederholt werden
    isRetryable = false;
    recommendedAction = "fix_arguments";
    recoveryStrategy = "Werkzeug-Aufrufparameter an das geforderte Schema anpassen.";
  }
  // 5. Externe API-Fehler (5xx)
  else if (
    (code && code >= 500 && code < 600) ||
    msg.includes("500 internal server error") ||
    msg.includes("502 bad gateway") ||
    msg.includes("503 service unavailable")
  ) {
    category = "external_api";
    severity = "transient";
    isRetryable = (details.attemptCount ?? 1) < 3;
    recommendedAction = isRetryable ? "retry_backoff" : "switch_provider";
    recoveryStrategy = "Serverfehler der Ziel-API. Wiederholung oder Provider-Rotation einleiten.";
  }
  // 6. Rechte & Berechtigungen
  else if (
    code === 401 ||
    code === 403 ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("permission denied")
  ) {
    category = "permission_denied";
    severity = "fatal";
    isRetryable = false;
    recommendedAction = "escalate_human";
    recoveryStrategy = "Fehlende Zugriffsrechte oder ungültige API-Schlüssel. Admin benachrichtigen.";
  }
  // 7. Logikfehler / Assertion
  else if (msg.includes("assertion") || msg.includes("unexpected state") || msg.includes("typeerror")) {
    category = "logic_error";
    severity = "fatal";
    isRetryable = false;
    recommendedAction = "escalate_human";
    recoveryStrategy = "Unerwarteter Systemzustand. Code-Fix oder Selbstkritik-Schritt ausführen.";
  }

  const rootCause = `Kategorie '${category}' (${severity}): ${details.errorMessage}`;
  const toolInfo = details.toolName ? ` in Werkzeug '${details.toolName}'` : "";

  const incidentSummary = [
    `[Fehler-Analyse${toolInfo}]`,
    `Ursache: ${rootCause}`,
    `Empfehlung: ${recommendedAction} (Wiederholbar: ${isRetryable ? "Ja" : "Nein"})`,
    `Strategie: ${recoveryStrategy}`,
  ].join("\n");

  return {
    category,
    severity,
    rootCause,
    isRetryable,
    recommendedAction,
    recoveryStrategy,
    incidentSummary,
  };
}

/**
 * Analysiert eine Gruppe von Fehlern und berechnet Verteilungs-Statistiken.
 */
export function aggregateFailureStats(failures: FailureDetails[]): {
  totalFailures: number;
  categoryCounts: Record<FailureCategory, number>;
  retryableCount: number;
  fatalCount: number;
  dominantCategory: FailureCategory;
} {
  const categoryCounts: Record<FailureCategory, number> = {
    rate_limit: 0,
    timeout: 0,
    token_limit: 0,
    context_overflow: 0,
    invalid_args: 0,
    external_api: 0,
    permission_denied: 0,
    logic_error: 0,
    unknown: 0,
  };

  let retryableCount = 0;
  let fatalCount = 0;

  for (const failure of failures) {
    const analysis = classifyFailure(failure);
    categoryCounts[analysis.category] = (categoryCounts[analysis.category] || 0) + 1;
    if (analysis.isRetryable) {
      retryableCount++;
    } else {
      fatalCount++;
    }
  }

  let dominantCategory: FailureCategory = "unknown";
  let maxCount = -1;

  for (const [cat, count] of Object.entries(categoryCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantCategory = cat as FailureCategory;
    }
  }

  return {
    totalFailures: failures.length,
    categoryCounts,
    retryableCount,
    fatalCount,
    dominantCategory,
  };
}
