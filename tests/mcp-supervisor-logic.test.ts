/**
 * Sprint 5 — Tests der Supervisor-Logik (Circuit Breaker, Backoff, Ratenlimit).
 *
 * Die Zusagen: Fehler werden nach Art behandelt, der Kreis öffnet erst nach
 * Schwelle, ein Probeaufruf ist exklusiv, Governance/Auth legen keine gesunden
 * Server lahm, und Ratenlimits nennen eine echte Wartezeit.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CIRCUIT_POLICY,
  checkRateLimit,
  classifyFailure,
  computeBackoffMs,
  describeCircuit,
  emptyCircuit,
  evaluateCircuitGate,
  isRetryable,
  recordFailure,
  recordSuccess,
} from "../lib/mcp-supervisor-logic";

const NOW = Date.parse("2026-11-11T06:00:00.000Z");

describe("Fehlerklassifizierung", () => {
  const cases: [{ status?: number; message?: string; timedOut?: boolean }, string][] = [
    [{ timedOut: true }, "timeout"],
    [{ status: 401 }, "auth"],
    [{ status: 403 }, "auth"],
    [{ status: 429 }, "rate-limited"],
    [{ status: 503 }, "server-error"],
    [{ status: 404 }, "invalid-response"],
    [{ message: "Freigabe erforderlich (critical)" }, "governance"],
    [{ message: "connect ECONNREFUSED 127.0.0.1:9" }, "unreachable"],
    [{ message: "Unexpected token < in JSON" }, "invalid-response"],
    [{ message: "irgendwas" }, "unreachable"],
  ];

  it.each(cases)("stuft %j als %s ein", (input, expected) => {
    expect(classifyFailure(input)).toBe(expected);
  });

  it("wiederholt keine Governance- oder Auth-Fehler", () => {
    expect(isRetryable("governance")).toBe(false);
    expect(isRetryable("auth")).toBe(false);
    expect(isRetryable("timeout")).toBe(true);
    expect(isRetryable("rate-limited")).toBe(true);
  });
});

describe("Backoff", () => {
  it("wächst exponentiell und bleibt begrenzt", () => {
    const low = computeBackoffMs(1, 500, 30_000, () => 0.5);
    const mid = computeBackoffMs(3, 500, 30_000, () => 0.5);
    const capped = computeBackoffMs(20, 500, 5_000, () => 1);
    expect(low).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(low);
    expect(capped).toBeLessThanOrEqual(5_000);
  });

  it("jittert zwischen 50 und 100 Prozent", () => {
    expect(computeBackoffMs(2, 1_000, 30_000, () => 0)).toBe(1_000);
    expect(computeBackoffMs(2, 1_000, 30_000, () => 1)).toBe(2_000);
  });
});

describe("Circuit Breaker", () => {
  it("erlaubt Aufrufe im geschlossenen Zustand", () => {
    const gate = evaluateCircuitGate(emptyCircuit("srv", null, NOW), NOW);
    expect(gate.decision.allowed).toBe(true);
    expect(gate.decision.state).toBe("closed");
  });

  it("öffnet erst nach der Schwelle", () => {
    let record = emptyCircuit("srv", null, NOW);
    record = recordFailure(record, { kind: "unreachable" }, NOW);
    record = recordFailure(record, { kind: "unreachable" }, NOW + 1000);
    expect(record.state).toBe("closed");
    expect(record.consecutiveFailures).toBe(2);
    record = recordFailure(record, { kind: "unreachable" }, NOW + 2000);
    expect(record.state).toBe("open");
    expect(record.openUntilMs).toBe(NOW + 2000 + DEFAULT_CIRCUIT_POLICY.cooldownMs);

    const blocked = evaluateCircuitGate(record, NOW + 3000);
    expect(blocked.decision.allowed).toBe(false);
    expect(blocked.decision.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.decision.reason).toContain("gesperrt");
  });

  it("öffnet sofort, wenn der Server ein Retry-After verlangt", () => {
    const record = recordFailure(emptyCircuit("srv", null, NOW), { kind: "rate-limited", retryAfterMs: 5_000 }, NOW);
    expect(record.state).toBe("open");
    expect(record.openUntilMs).toBe(NOW + 5_000);
  });

  it("erlaubt nach Abklingzeit genau einen Probeaufruf", () => {
    let record = recordFailure(emptyCircuit("srv", null, NOW), { kind: "timeout" }, NOW);
    record = recordFailure(record, { kind: "timeout" }, NOW);
    record = recordFailure(record, { kind: "timeout" }, NOW);

    const reopen = evaluateCircuitGate(record, NOW + DEFAULT_CIRCUIT_POLICY.cooldownMs + 1);
    expect(reopen.decision.allowed).toBe(true);
    expect(reopen.decision.state).toBe("half_open");

    const second = evaluateCircuitGate(reopen.next, NOW + DEFAULT_CIRCUIT_POLICY.cooldownMs + 2);
    expect(second.decision.allowed).toBe(false);
    expect(second.decision.reason).toContain("Probeaufruf");
  });

  it("schließt nach erfolgreichem Probeaufruf", () => {
    const halfOpen = { ...emptyCircuit("srv", null, NOW), state: "half_open" as const, halfOpenAttempts: 1 };
    const closed = recordSuccess(halfOpen, NOW + 10);
    expect(closed.state).toBe("closed");
    expect(closed.consecutiveFailures).toBe(0);
  });

  it("öffnet nach fehlgeschlagenem Probeaufruf erneut", () => {
    const halfOpen = { ...emptyCircuit("srv", null, NOW), state: "half_open" as const, halfOpenAttempts: 1, openUntilMs: NOW };
    const reopened = recordFailure(halfOpen, { kind: "server-error", message: "HTTP 503" }, NOW + 10);
    expect(reopened.state).toBe("open");
    expect(reopened.openUntilMs).toBe(NOW + 10 + DEFAULT_CIRCUIT_POLICY.cooldownMs);
  });

  it("legt bei Governance- und Auth-Fehlern keinen gesunden Server lahm", () => {
    const governance = recordFailure(emptyCircuit("srv", null, NOW), { kind: "governance", message: "Freigabe erforderlich" }, NOW);
    expect(governance.state).toBe("closed");
    expect(governance.consecutiveFailures).toBe(0);
    expect(governance.lastFailureKind).toBe("governance");

    const auth = recordFailure(emptyCircuit("srv", null, NOW), { kind: "auth", message: "401" }, NOW);
    expect(auth.state).toBe("closed");
    expect(auth.lastError).toContain("401");
  });

  it("beschreibt den Zustand mit echter Restzeit", () => {
    const open = { ...emptyCircuit("srv", null, NOW), state: "open" as const, openUntilMs: NOW + 42_000, lastFailureKind: "timeout" as const };
    const described = describeCircuit(open, NOW);
    expect(described.healthy).toBe(false);
    expect(described.retryAfterMs).toBe(42_000);
    expect(described.detail).toContain("42");
    expect(describeCircuit(emptyCircuit("srv", null, NOW), NOW).healthy).toBe(true);
  });
});

describe("Ratenlimit", () => {
  it("erlaubt Aufrufe unter dem Limit", () => {
    const result = checkRateLimit({ timestamps: [NOW - 1000], nowMs: NOW, limit: { limit: 3, windowMs: 60_000 } });
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(1);
  });

  it("blockiert am Limit und nennt die Wartezeit bis zum Freiwerden", () => {
    const timestamps = [NOW - 30_000, NOW - 20_000, NOW - 10_000];
    const result = checkRateLimit({ timestamps, nowMs: NOW, limit: { limit: 3, windowMs: 60_000 } });
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(30_000);
  });

  it("ignoriert Zeitstempel ausserhalb des Fensters", () => {
    const result = checkRateLimit({
      timestamps: [NOW - 120_000, NOW - 90_000, NOW - 5_000],
      nowMs: NOW,
      limit: { limit: 3, windowMs: 60_000 },
    });
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(1);
  });
});
