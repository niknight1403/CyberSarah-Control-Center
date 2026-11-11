/**
 * CyberSarah Control Center — MCP-Supervisor-Logik (Sprint 5)
 *
 * Reine, testbare Logik des Connection Supervisors (Mission-Modul 4):
 *
 *   - Fehlerklassifizierung: ein Aufruf kann nicht erreichbar, langsam,
 *     abgelehnt, nicht autorisiert oder durch Governance blockiert sein —
 *     jede Klasse hat eine andere Reaktion.
 *   - Circuit Breaker je Server (und optional je Werkzeug): closed → open →
 *     half_open, mit Schwellwert, Abklingzeit und begrenzten Probeaufrufen.
 *   - Backoff mit Jitter (deterministisch über injizierte Zufallsquelle).
 *   - Ratenbegrenzung: nicht mehr als N Aufrufe je Fenster und Server.
 *   - Quarantäne-Entscheidung mit ehrlicher Restzeit statt pauschalem "geht nicht".
 *
 * Kein IO, keine echten Uhren: Zeit, Zufall und Zustand kommen von aussen.
 */

export type FailureKind =
  | "none"
  | "unreachable"
  | "timeout"
  | "server-error"
  | "rate-limited"
  | "auth"
  | "governance"
  | "invalid-response";

export const RETRYABLE_FAILURES: readonly FailureKind[] = ["unreachable", "timeout", "server-error", "rate-limited"];

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitRecord {
  serverKey: string;
  /** null = Server-weit, sonst werkzeugspezifisch. */
  toolName: string | null;
  state: CircuitState;
  consecutiveFailures: number;
  /** Zeitpunkt, ab dem ein Probieren wieder erlaubt ist. */
  openUntilMs: number | null;
  openedAtMs: number | null;
  halfOpenAttempts: number;
  lastFailureKind: FailureKind | null;
  lastError: string | null;
  updatedAtMs: number;
}

export interface CircuitPolicy {
  /** Fehlversuche in Folge, bis der Kreis öffnet. */
  failureThreshold: number;
  /** Abklingzeit vor dem ersten Probeaufruf. */
  cooldownMs: number;
  /** Wie oft im half_open erfolgreich geprobt werden muss. */
  halfOpenSuccesses: number;
}

export const DEFAULT_CIRCUIT_POLICY: CircuitPolicy = {
  failureThreshold: 3,
  cooldownMs: 60_000,
  halfOpenSuccesses: 1,
};

/** Grobe Klassifizierung aus HTTP-Status und Fehlertext (ohne Geheimnisse). */
export function classifyFailure(input: { status?: number | null; message?: string | null; timedOut?: boolean }): FailureKind {
  if (input.timedOut) return "timeout";
  const text = (input.message ?? "").toLowerCase();
  if (input.status === 401 || input.status === 403) return "auth";
  if (input.status === 429) return "rate-limited";
  if (input.status && input.status >= 500) return "server-error";
  if (input.status && input.status >= 400) return "invalid-response";
  if (/governance|freigabe erforderlich/.test(text)) return "governance";
  if (/timeout|timed out|zeitüberschreitung/.test(text)) return "timeout";
  if (/econnrefused|enotfound|eai_again|socket|network|fetch failed|unreachable/.test(text)) return "unreachable";
  if (/unexpected token|invalid json|kein json/.test(text)) return "invalid-response";
  return input.status ? "invalid-response" : "unreachable";
}

export function isRetryable(kind: FailureKind): boolean {
  return RETRYABLE_FAILURES.includes(kind);
}

/** Exponentieller Backoff mit Jitter, hart begrenzt. */
export function computeBackoffMs(attempt: number, baseMs = 500, maxMs = 30_000, random = Math.random): number {
  const safeAttempt = Math.max(1, Math.min(attempt, 10));
  const exponential = Math.min(baseMs * 2 ** (safeAttempt - 1), maxMs);
  const jitter = 0.5 + random() * 0.5; // 50..100 % — nie 0, damit kein Thundering Herd
  return Math.round(Math.min(exponential * jitter, maxMs));
}

export function emptyCircuit(serverKey: string, toolName: string | null, nowMs: number): CircuitRecord {
  return {
    serverKey,
    toolName,
    state: "closed",
    consecutiveFailures: 0,
    openUntilMs: null,
    openedAtMs: null,
    halfOpenAttempts: 0,
    lastFailureKind: null,
    lastError: null,
    updatedAtMs: nowMs,
  };
}

export interface GateDecision {
  allowed: boolean;
  state: CircuitState;
  reason: string;
  retryAfterMs: number;
}

/**
 * Darf jetzt aufgerufen werden? open blockiert bis zur Abklingzeit, danach
 * wechselt der Zustand nach half_open und der Probeaufruf ist erlaubt.
 */
export function evaluateCircuitGate(
  record: CircuitRecord,
  nowMs: number,
  policy: CircuitPolicy = DEFAULT_CIRCUIT_POLICY,
): { decision: GateDecision; next: CircuitRecord } {
  if (record.state === "closed") {
    return {
      decision: { allowed: true, state: "closed", reason: "Kreis geschlossen.", retryAfterMs: 0 },
      next: record,
    };
  }

  if (record.state === "open") {
    const until = record.openUntilMs ?? record.updatedAtMs + policy.cooldownMs;
    if (nowMs < until) {
      return {
        decision: {
          allowed: false,
          state: "open",
          reason: `Server vorübergehend gesperrt nach ${record.consecutiveFailures} Fehlversuchen${
            record.lastFailureKind ? ` (${record.lastFailureKind})` : ""
          }.`,
          retryAfterMs: until - nowMs,
        },
        next: record,
      };
    }
    return {
      decision: {
        allowed: true,
        state: "half_open",
        reason: "Abklingzeit vorbei — ein Probeaufruf ist erlaubt.",
        retryAfterMs: 0,
      },
      // Der erlaubte Probeaufruf selbst zählt bereits als laufender Versuch.
      next: { ...record, state: "half_open", halfOpenAttempts: 1, updatedAtMs: nowMs },
    };
  }

  // half_open: genau ein Probeaufruf gleichzeitig
  if (record.halfOpenAttempts >= 1) {
    return {
      decision: {
        allowed: false,
        state: "half_open",
        reason: "Probeaufruf läuft bereits.",
        retryAfterMs: policy.cooldownMs,
      },
      next: record,
    };
  }
  return {
    decision: { allowed: true, state: "half_open", reason: "Probeaufruf erlaubt.", retryAfterMs: 0 },
    next: { ...record, halfOpenAttempts: record.halfOpenAttempts + 1, updatedAtMs: nowMs },
  };
}

/** Erfolg: Kreis schließen, Zähler zurücksetzen. */
export function recordSuccess(
  record: CircuitRecord,
  nowMs: number,
  policy: CircuitPolicy = DEFAULT_CIRCUIT_POLICY,
): CircuitRecord {
  if (record.state === "half_open" && record.halfOpenAttempts < policy.halfOpenSuccesses) {
    return {
      ...record,
      state: "half_open",
      halfOpenAttempts: record.halfOpenAttempts + 1,
      lastFailureKind: null,
      updatedAtMs: nowMs,
    };
  }
  return {
    ...emptyCircuit(record.serverKey, record.toolName, nowMs),
    updatedAtMs: nowMs,
  };
}

/**
 * Fehler: Governance-Blocks und Auth-Fehler öffnen den Kreis NICHT — sie sind
 * keine Verbindungsprobleme und würden sonst gesunde Server lahmlegen.
 */
export function recordFailure(
  record: CircuitRecord,
  failure: { kind: FailureKind; message?: string | null; retryAfterMs?: number | null },
  nowMs: number,
  policy: CircuitPolicy = DEFAULT_CIRCUIT_POLICY,
): CircuitRecord {
  const message = (failure.message ?? "").slice(0, 300) || null;

  if (failure.kind === "governance") {
    return { ...record, lastFailureKind: "governance", lastError: message, updatedAtMs: nowMs };
  }

  if (failure.kind === "auth") {
    // Auth-Fehler sind Konfigurationsfehler: kein Blindwiederholen, aber auch
    // kein Verbindungsausfall. Der Kreis bleibt, wie er ist.
    return {
      ...record,
      lastFailureKind: "auth",
      lastError: message ?? "Zugangsdaten abgelehnt.",
      updatedAtMs: nowMs,
    };
  }

  const failures = record.consecutiveFailures + 1;
  const shouldOpen =
    record.state === "half_open" ||
    failures >= policy.failureThreshold ||
    (failure.retryAfterMs ?? 0) > 0;

  if (!shouldOpen) {
    return {
      ...record,
      consecutiveFailures: failures,
      lastFailureKind: failure.kind,
      lastError: message,
      updatedAtMs: nowMs,
    };
  }

  const retryAfter = failure.retryAfterMs && failure.retryAfterMs > 0 ? failure.retryAfterMs : policy.cooldownMs;
  return {
    ...record,
    state: "open",
    consecutiveFailures: failures,
    openedAtMs: nowMs,
    openUntilMs: nowMs + retryAfter,
    halfOpenAttempts: 0,
    lastFailureKind: failure.kind,
    lastError: message,
    updatedAtMs: nowMs,
  };
}

/** Zustands-Zusammenfassung für Healthcheck/UI. */
export function describeCircuit(record: CircuitRecord, nowMs: number): {
  state: CircuitState;
  failures: number;
  retryAfterMs: number;
  healthy: boolean;
  detail: string;
} {
  const retryAfterMs = record.state === "open" && record.openUntilMs ? Math.max(0, record.openUntilMs - nowMs) : 0;
  const healthy = record.state !== "open";
  const detail =
    record.state === "closed"
      ? "Kreis geschlossen — Verbindung gilt als stabil."
      : record.state === "half_open"
        ? "Probeaufruf aktiv — Ergebnis entscheidet über Schließen oder Öffnen."
        : `Gesperrt noch ${Math.ceil(retryAfterMs / 1000)} s${record.lastFailureKind ? ` (${record.lastFailureKind})` : ""}.`;
  return { state: record.state, failures: record.consecutiveFailures, retryAfterMs, healthy, detail };
}

export interface RateWindow {
  /** Erlaubte Aufrufe je Fenster. */
  limit: number;
  windowMs: number;
}

/**
 * Sliding-Window-Ratenlimit: zählt Zeitstempel im Fenster, ohne Zustand im
 * Speicher zu halten. Liefert zusätzlich die Wartezeit bis zum nächsten Slot.
 */
export function checkRateLimit(input: {
  timestamps: readonly number[];
  nowMs: number;
  limit: RateWindow;
}): { allowed: boolean; used: number; retryAfterMs: number } {
  const windowStart = input.nowMs - input.limit.windowMs;
  const inWindow = input.timestamps.filter((stamp) => stamp > windowStart).sort((a, b) => a - b);
  if (inWindow.length < input.limit.limit) {
    return { allowed: true, used: inWindow.length, retryAfterMs: 0 };
  }
  const oldest = inWindow[0];
  return {
    allowed: false,
    used: inWindow.length,
    retryAfterMs: Math.max(1, oldest + input.limit.windowMs - input.nowMs),
  };
}
