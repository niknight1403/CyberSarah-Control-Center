/**
 * Sprint 289 — Werkzeug-Fehlerklassen: wiederholbar vs. fatal, ehrliche Retry-Semantik
 *
 * Reine, deterministische Logik (ohne Seiteneffekte) fuer die Klassifizierung von
 * Werkzeugfehler-Klassen beim Dev-Agenten. Unterscheidet strikt zwischen
 * voruebergehenden (wiederholbaren) und fatalen (nicht-wiederholbaren) Fehlern,
 * berechnet ehrliche Retry-Entscheidungen mit Backoff und formatiert transparente
 * Fehlermeldungen fuer den Agenten-Kontext.
 */

export type ToolErrorKind =
  | "transient_network"
  | "timeout"
  | "rate_limit"
  | "file_locked"
  | "not_found"
  | "permission_denied"
  | "invalid_input"
  | "execution_failed"
  | "unknown";

export type ToolErrorCategory = "retryable" | "fatal";

export type ToolErrorClassification = {
  toolName: string;
  kind: ToolErrorKind;
  category: ToolErrorCategory;
  isRetryable: boolean;
  maxRetries: number;
  cleanMessage: string;
  recommendedAction: string;
};

export type ToolRetryPolicy = {
  maxRetries: number;
  baseDelayMs: number;
  backoffFactor: number;
};

export type RetryDecision = {
  shouldRetry: boolean;
  currentAttempt: number;
  nextAttempt: number;
  remainingRetries: number;
  delayMs: number;
  reason: string;
};

export const DEFAULT_RETRY_POLICY: ToolRetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 500,
  backoffFactor: 2,
};

type ErrorShape = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  name?: unknown;
};

function extractRawMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const shape = error as ErrorShape;
    if (typeof shape.message === "string") return shape.message;
    if (typeof shape.name === "string") return shape.name;
    try {
      return JSON.stringify(error);
    } catch {
      return "Unbekannter Fehler-Objekt";
    }
  }
  return String(error ?? "Unbekannter Fehler");
}

function extractErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const shape = error as ErrorShape;
    if (typeof shape.code === "string") return shape.code.toUpperCase();
    if (typeof shape.code === "number") return String(shape.code);
  }
  return "";
}

/**
 * Klassifiziert einen Werkzeugfehler in wiederholbar (retryable) vs. fatal.
 */
export function classifyToolError(
  toolName: string,
  error: unknown,
  overridePolicy?: Partial<ToolRetryPolicy>
): ToolErrorClassification {
  const rawMsg = extractRawMessage(error);
  const code = extractErrorCode(error);
  const lowerMsg = rawMsg.toLowerCase();
  const maxRetries = overridePolicy?.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries;

  // 1. Not Found (fatal)
  if (
    code === "ENOENT" ||
    lowerMsg.includes("enoent") ||
    lowerMsg.includes("not found") ||
    lowerMsg.includes("nicht gefunden") ||
    lowerMsg.includes("does not exist")
  ) {
    return {
      toolName,
      kind: "not_found",
      category: "fatal",
      isRetryable: false,
      maxRetries: 0,
      cleanMessage: `Datei oder Ressource nicht gefunden: ${rawMsg}`,
      recommendedAction: "Pruefe den Pfad oder erstelle die Ressource vor dem Aufruf.",
    };
  }

  // 2. Permission / Authorization (fatal)
  if (
    code === "EACCES" ||
    code === "EPERM" ||
    lowerMsg.includes("eacces") ||
    lowerMsg.includes("eperm") ||
    lowerMsg.includes("permission denied") ||
    lowerMsg.includes("unauthorized") ||
    lowerMsg.includes("keine berechtigung")
  ) {
    return {
      toolName,
      kind: "permission_denied",
      category: "fatal",
      isRetryable: false,
      maxRetries: 0,
      cleanMessage: `Zugriff verweigert (Berechtigungsfehler): ${rawMsg}`,
      recommendedAction: "Pruefe Schreib-/Leserechte oder Token-Berechtigungen.",
    };
  }

  // 3. Invalid Input / Parameter Schema (fatal)
  if (
    lowerMsg.includes("invalid") ||
    lowerMsg.includes("schema") ||
    lowerMsg.includes("ungueltig") ||
    lowerMsg.includes("pflichtfeld") ||
    lowerMsg.includes("argument")
  ) {
    return {
      toolName,
      kind: "invalid_input",
      category: "fatal",
      isRetryable: false,
      maxRetries: 0,
      cleanMessage: `Ungueltige Parameter fuer Werkzeug '${toolName}': ${rawMsg}`,
      recommendedAction: "Passe die Aufrufparameter an das Werkzeug-Schema an.",
    };
  }

  // 4. File Locked / Resource Busy (retryable)
  if (
    code === "EBUSY" ||
    code === "EAGAIN" ||
    code === "EMFILE" ||
    lowerMsg.includes("ebusy") ||
    lowerMsg.includes("locked") ||
    lowerMsg.includes("resource busy")
  ) {
    return {
      toolName,
      kind: "file_locked",
      category: "retryable",
      isRetryable: true,
      maxRetries,
      cleanMessage: `Datei oder Ressource ist voruebergehend sperrt/beschäftigt: ${rawMsg}`,
      recommendedAction: "Wiederhole den Aufruf nach kurzer Verzögerung.",
    };
  }

  // 5. Timeout (retryable)
  if (
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("timed out") ||
    lowerMsg.includes("zeitueberschreitung")
  ) {
    return {
      toolName,
      kind: "timeout",
      category: "retryable",
      isRetryable: true,
      maxRetries,
      cleanMessage: `Zeitueberschreitung bei Werkzeug '${toolName}': ${rawMsg}`,
      recommendedAction: "Wiederhole den Aufruf mit vergrößertem Timeout.",
    };
  }

  // 6. Rate Limit (retryable)
  if (
    lowerMsg.includes("429") ||
    lowerMsg.includes("rate limit") ||
    lowerMsg.includes("too many requests") ||
    lowerMsg.includes("rate_limit")
  ) {
    return {
      toolName,
      kind: "rate_limit",
      category: "retryable",
      isRetryable: true,
      maxRetries,
      cleanMessage: `Rate-Limit fuer '${toolName}' erreicht: ${rawMsg}`,
      recommendedAction: "Warte den Backoff-Intervall ab und versuche es erneut.",
    };
  }

  // 7. Transient Network (retryable)
  if (
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    lowerMsg.includes("fetch failed") ||
    lowerMsg.includes("network error") ||
    lowerMsg.includes("netzwerkfehler") ||
    lowerMsg.includes("connection reset")
  ) {
    return {
      toolName,
      kind: "transient_network",
      category: "retryable",
      isRetryable: true,
      maxRetries,
      cleanMessage: `Netzwerkfehler bei '${toolName}': ${rawMsg}`,
      recommendedAction: "Wiederhole die Verbindungsanfrage.",
    };
  }

  // Default: execution_failed (fatal, standardmässig nicht sicher wiederholbar)
  return {
    toolName,
    kind: "execution_failed",
    category: "fatal",
    isRetryable: false,
    maxRetries: 0,
    cleanMessage: `Ausfuehrungsfehler bei '${toolName}': ${rawMsg}`,
    recommendedAction: "Analysiere die Fehlermeldung und korrigiere die Logik/Umgebung.",
  };
}

/**
 * Evaluierte die Retry-Entscheidung fuer einen konkreten Versuch.
 */
export function evaluateRetryAttempt(
  classification: ToolErrorClassification,
  currentAttempt: number,
  policyConfig?: Partial<ToolRetryPolicy>
): RetryDecision {
  const policy: ToolRetryPolicy = {
    ...DEFAULT_RETRY_POLICY,
    ...policyConfig,
    maxRetries: classification.isRetryable
      ? (policyConfig?.maxRetries ?? classification.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries)
      : 0,
  };

  const nextAttempt = currentAttempt + 1;
  const remainingRetries = Math.max(0, policy.maxRetries - currentAttempt);

  if (!classification.isRetryable) {
    return {
      shouldRetry: false,
      currentAttempt,
      nextAttempt,
      remainingRetries: 0,
      delayMs: 0,
      reason: `Fataler Fehler (${classification.kind}): Keine Wiederholung erlaubt.`,
    };
  }

  if (currentAttempt >= policy.maxRetries) {
    return {
      shouldRetry: false,
      currentAttempt,
      nextAttempt,
      remainingRetries: 0,
      delayMs: 0,
      reason: `Maximal zulässige Wiederholungen (${policy.maxRetries}) fuer '${classification.toolName}' erschöpft.`,
    };
  }

  const delayMs = Math.round(
    policy.baseDelayMs * Math.pow(policy.backoffFactor, Math.max(0, currentAttempt - 1))
  );

  return {
    shouldRetry: true,
    currentAttempt,
    nextAttempt,
    remainingRetries,
    delayMs,
    reason: `Wiederholbarer Fehler (${classification.kind}): Versuch ${nextAttempt} von ${policy.maxRetries} nach ${delayMs}ms.`,
  };
}

/**
 * Formatiert die Fehler-Klassifizierung fuer die Rueckgabe an das Agenten-Modell.
 */
export function formatToolErrorForAgent(
  classification: ToolErrorClassification,
  retryDecision?: RetryDecision
): string {
  const header = `FEHLER [${classification.toolName}] (${classification.category.toUpperCase()} - ${classification.kind}): ${classification.cleanMessage}`;
  const rec = `Empfehlung: ${classification.recommendedAction}`;

  if (!retryDecision) {
    return `${header}\n${rec}`;
  }

  const retryStatus = retryDecision.shouldRetry
    ? `Retry-Status: Wiederholung erlaubt (Versuch ${retryDecision.nextAttempt}, Verzögerung ${retryDecision.delayMs}ms).`
    : `Retry-Status: Keine weitere Wiederholung (${retryDecision.reason}).`;

  return `${header}\n${rec}\n${retryStatus}`;
}
