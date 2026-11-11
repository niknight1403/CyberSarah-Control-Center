/**
 * Sprint 10 — Freigabe-Service.
 *
 * Bildet die Warteschlange ab und beantwortet die eine Frage, die vor einem
 * Werkzeugaufruf zaehlt: gibt es eine gueltige, noch nicht verbrauchte
 * Freigabe fuer GENAU diesen Aufruf?
 */
import {
  castVote,
  consumeRequest,
  createApprovalRequest,
  expireRequest,
  isUsableForCall,
  summarizeQueue,
  type ApprovalDecision,
  type ApprovalRequest,
  type QueueSummary,
} from "../lib/mcp-approval-workflow-logic";
import type { RiskLevel } from "../lib/mcp-governance-logic";
import type { McpApprovalStore, StoredApproval } from "./mcp-approval-store";

export type ApprovalServiceDeps = {
  store: McpApprovalStore;
  now?: () => number;
};

export type RequestInput = {
  runId: number;
  taskId: string;
  agentKey: string;
  serverKey: string;
  toolName: string;
  riskLevel: RiskLevel;
  reasons: string[];
  argsHash: string;
  requestedBy: string;
  ttlMs?: number;
};

export type ApprovalService = {
  request(input: RequestInput): Promise<{ ok: true; approval: StoredApproval } | { ok: false; reason: string }>;
  decide(input: { id: number; approver: string; decision: ApprovalDecision; note?: string }): Promise<
    { ok: true; approval: StoredApproval } | { ok: false; code: string; reason: string }
  >;
  list(limit?: number, status?: string): Promise<StoredApproval[]>;
  listByRun(runId: number): Promise<StoredApproval[]>;
  get(id: number): Promise<StoredApproval | null>;
  sweep(): Promise<{ expired: number; summary: string }>;
  /** Gueltige Freigabe fuer genau diesen Aufruf (oder null). */
  findUsable(target: { runId: number; taskId: string; serverKey: string; toolName: string; argsHash: string }): Promise<StoredApproval | null>;
  consume(id: number): Promise<StoredApproval | null>;
  queue(limit?: number): Promise<{ summary: QueueSummary; items: StoredApproval[] }>;
};

export function createMcpApprovalService(deps: ApprovalServiceDeps): ApprovalService {
  const now = deps.now ?? (() => Date.now());

  return {
    async request(input) {
      const existing = await deps.store.listByRun(input.runId);
      const duplicate = existing.find(
        (entry) =>
          entry.taskId === input.taskId &&
          entry.argsHash === input.argsHash &&
          entry.toolName === input.toolName &&
          (entry.status === "pending" || entry.status === "approved"),
      );
      if (duplicate) {
        return { ok: true, approval: duplicate };
      }
      const request: ApprovalRequest = createApprovalRequest({
        ...input,
        nowMs: now(),
        ...(input.ttlMs ? { ttlMs: input.ttlMs } : {}),
      });
      const stored = await deps.store.insert(request);
      return { ok: true, approval: stored };
    },

    async decide(input) {
      const stored = await deps.store.get(input.id);
      if (!stored) return { ok: false, code: "not_found", reason: `Anfrage ${input.id} nicht gefunden.` };

      const result = castVote(stored, {
        approver: input.approver,
        decision: input.decision,
        note: input.note ?? "",
        nowMs: now(),
      });
      if (!result.ok) return { ok: false, code: result.code, reason: result.reason };
      const saved = await deps.store.save(input.id, result.request);
      if (!saved) return { ok: false, code: "save_failed", reason: "Entscheidung konnte nicht gespeichert werden." };
      return { ok: true, approval: saved };
    },

    async list(limit, status) {
      return deps.store.list(limit, status);
    },

    async listByRun(runId) {
      return deps.store.listByRun(runId);
    },

    async get(id) {
      return deps.store.get(id);
    },

    async sweep() {
      const open = await deps.store.listOpen();
      const at = now();
      let expired = 0;
      for (const entry of open) {
        const next = expireRequest(entry, at);
        if (next.status === "expired" && entry.status !== "expired") {
          await deps.store.save(entry.id, next);
          expired += 1;
        }
      }
      return {
        expired,
        summary: expired === 0 ? "Keine Freigabe ist abgelaufen." : `${expired} Freigabe(n) abgelaufen und geschlossen.`,
      };
    },

    async findUsable(target) {
      const candidates = await deps.store.listByRun(target.runId);
      const at = now();
      for (const candidate of candidates) {
        const usable = isUsableForCall({ request: candidate, target, nowMs: at });
        if (usable.usable) return candidate;
      }
      return null;
    },

    async consume(id) {
      const stored = await deps.store.get(id);
      if (!stored) return null;
      const consumed = consumeRequest(stored, now());
      if (consumed.status === stored.status) return stored;
      return deps.store.save(id, consumed);
    },

    async queue(limit) {
      const items = await deps.store.list(limit ?? 50);
      return { summary: summarizeQueue(items, now()), items };
    },
  };
}
