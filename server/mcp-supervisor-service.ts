/**
 * Sprint 5 — Connection Supervisor: Circuit Breaker fuer MCP-Server.
 *
 * Der Supervisor beantwortet eine Frage vor jedem Netzwerkaufruf: "Ist dieser
 * Server gerade ueberhaupt erreichbar, oder verschwenden wir Zeit?" Er
 * ersetzt keine Governance — Rechte und Freigaben bleiben Sache des Gates aus
 * Sprint 3. Er verhindert nur, dass ein ausgefallener Server jeden Aufruf
 * blockiert und dass Fehlerlawinen entstehen.
 *
 * Zustand liegt in `mcp_circuits` (Migration 0032), Entscheidungen rein in
 * lib/mcp-supervisor-logic.ts.
 */
import {
  DEFAULT_CIRCUIT_POLICY,
  classifyFailure,
  describeCircuit,
  emptyCircuit,
  evaluateCircuitGate,
  recordFailure,
  recordSuccess,
  type CircuitPolicy,
  type CircuitRecord,
  type FailureKind,
} from "../lib/mcp-supervisor-logic";
import type { CircuitStore } from "./mcp-supervisor-store";

export type SupervisorGateResult = {
  allowed: boolean;
  state: string;
  reason: string;
  retryAfterMs: number;
};

export type SupervisorService = {
  gate(serverKey: string, toolName?: string | null): Promise<SupervisorGateResult>;
  record(
    serverKey: string,
    toolName: string | null,
    outcome: { ok: boolean; status?: number | null; message?: string | null; timedOut?: boolean; retryAfterMs?: number | null },
  ): Promise<void>;
  status(serverKey?: string): Promise<{ serverKey: string; toolName: string | null; state: string; failures: number; retryAfterMs: number; healthy: boolean; detail: string }[]>;
  reset(serverKey: string, toolName?: string | null): Promise<void>;
};

export type SupervisorServiceDeps = {
  store: CircuitStore;
  now?: () => number;
  policy?: CircuitPolicy;
};

export function createMcpSupervisorService(deps: SupervisorServiceDeps): SupervisorService {
  const now = deps.now ?? (() => Date.now());
  const policy = deps.policy ?? DEFAULT_CIRCUIT_POLICY;

  function toRecord(row: {
    serverKey: string;
    toolName: string | null;
    state: string;
    consecutiveFailures: number;
    openUntil: Date | null;
    openedAt: Date | null;
    halfOpenAttempts: number;
    lastFailureKind: string | null;
    lastError: string | null;
    updatedAt: Date;
  } | null, serverKey: string, toolName: string | null, at: number): CircuitRecord {
    if (!row) return emptyCircuit(serverKey, toolName, at);
    return {
      serverKey: row.serverKey,
      toolName: row.toolName,
      state: row.state as CircuitRecord["state"],
      consecutiveFailures: row.consecutiveFailures,
      openUntilMs: row.openUntil ? row.openUntil.getTime() : null,
      openedAtMs: row.openedAt ? row.openedAt.getTime() : null,
      halfOpenAttempts: row.halfOpenAttempts,
      lastFailureKind: (row.lastFailureKind as FailureKind | null) ?? null,
      lastError: row.lastError,
      updatedAtMs: row.updatedAt.getTime(),
    };
  }

  async function persist(record: CircuitRecord): Promise<void> {
    await deps.store.upsert({
      serverKey: record.serverKey,
      toolName: record.toolName,
      state: record.state,
      consecutiveFailures: record.consecutiveFailures,
      openUntil: record.openUntilMs ? new Date(record.openUntilMs) : null,
      openedAt: record.openedAtMs ? new Date(record.openedAtMs) : null,
      halfOpenAttempts: record.halfOpenAttempts,
      lastFailureKind: record.lastFailureKind,
      lastError: record.lastError,
      updatedAt: new Date(record.updatedAtMs),
    });
  }

  return {
    async gate(serverKey, toolName = null) {
      const at = now();
      let row;
      try {
        row = await deps.store.find(serverKey, toolName);
      } catch (error) {
        // Ohne Zustand lieber durchlassen und den echten Fehler zeigen, als
        // Aufrufe wegen eines Speicherproblems zu blockieren.
        return {
          allowed: true,
          state: "unknown",
          reason: `Circuit-Zustand nicht lesbar: ${error instanceof Error ? error.message : "unbekannt"}`,
          retryAfterMs: 0,
        };
      }
      const record = toRecord(row, serverKey, toolName, at);
      const { decision, next } = evaluateCircuitGate(record, at, policy);
      if (next !== record) {
        try {
          await persist(next);
        } catch {
          // Nicht kritisch: der naechste Aufruf versucht es erneut.
        }
      }
      return { allowed: decision.allowed, state: decision.state, reason: decision.reason, retryAfterMs: decision.retryAfterMs };
    },

    async record(serverKey, toolName, outcome) {
      const at = now();
      let row;
      try {
        row = await deps.store.find(serverKey, toolName);
      } catch {
        return;
      }
      const record = toRecord(row, serverKey, toolName, at);
      const next = outcome.ok
        ? recordSuccess(record, at, policy)
        : recordFailure(
            record,
            outcome.status || outcome.message || outcome.timedOut
              ? {
                  kind: classifyFailure({ status: outcome.status ?? null, message: outcome.message ?? null, timedOut: outcome.timedOut }),
                  message: outcome.message ?? null,
                  retryAfterMs: outcome.retryAfterMs ?? null,
                }
              : { kind: "unreachable", message: outcome.message ?? null },
            at,
            policy,
          );
      try {
        await persist(next);
      } catch {
        // Zustandsverlust ist unkritisch (Kreis startet geschlossen).
      }
    },

    async status(serverKey) {
      const rows = await deps.store.list();
      return rows
        .filter((row) => !serverKey || row.serverKey === serverKey)
        .map((row) => {
          const record = toRecord(row, row.serverKey, row.toolName, now());
          const described = describeCircuit(record, now());
          return {
            serverKey: row.serverKey,
            toolName: row.toolName,
            state: described.state,
            failures: described.failures,
            retryAfterMs: described.retryAfterMs,
            healthy: described.healthy,
            detail: described.detail,
          };
        });
    },

    async reset(serverKey, toolName = null) {
      await deps.store.reset(serverKey, toolName);
    },
  };
}
