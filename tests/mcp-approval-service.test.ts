/**
 * Sprint 10 — Tests des Freigabe-Service.
 *
 * Zusagen: Anfragen werden entdoppelt, Selbstfreigabe scheitert, Freigaben
 * deckt nur exakt den beantragten Aufruf, und Ablauf wird beim Sweep
 * geschlossen.
 */
import { describe, expect, it } from "vitest";

import { createMcpApprovalService } from "../server/mcp-approval-service";
import type { McpApprovalStore, StoredApproval } from "../server/mcp-approval-store";
import type { ApprovalRequest } from "../lib/mcp-approval-workflow-logic";

const NOW = 1_700_000_000_000;

function build() {
  const rows = new Map<number, StoredApproval>();
  let id = 1;
  let clock = NOW;
  const store: McpApprovalStore = {
    async list(limit = 50, status) {
      return [...rows.values()].filter((row) => (status ? row.status === status : true)).slice(0, limit);
    },
    async get(rowId) {
      return rows.get(rowId) ?? null;
    },
    async listByRun(runId) {
      return [...rows.values()].filter((row) => row.runId === runId);
    },
    async listOpen() {
      return [...rows.values()].filter((row) => row.status === "pending" || row.status === "approved");
    },
    async insert(request: ApprovalRequest) {
      const row = { ...request, id: id++, createdAt: new Date(request.requestedAtMs) } as StoredApproval;
      rows.set(row.id, row);
      return row;
    },
    async save(rowId, request) {
      if (!rows.has(rowId)) return null;
      const row = { ...request, id: rowId, createdAt: new Date(request.requestedAtMs) } as StoredApproval;
      rows.set(rowId, row);
      return row;
    },
  };
  const service = createMcpApprovalService({ store, now: () => clock });
  return { service, rows, advance: (ms: number) => (clock += ms) };
}

const INPUT = {
  runId: 7,
  taskId: "research",
  agentKey: "research-scout",
  serverKey: "websearch",
  toolName: "search_web",
  riskLevel: "high" as const,
  reasons: ["hohes Risiko"],
  argsHash: "abc123",
  requestedBy: "agent:orchestrator",
};

describe("Antraege", () => {
  it("legt eine Anfrage mit zwei benoetigten Stimmen an", async () => {
    const { service } = build();
    const result = await service.request(INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.approval.status).toBe("pending");
    expect(result.approval.requiredApprovals).toBe(2);
  });

  it("entdoppelt offene Anfragen fuer denselben Aufruf", async () => {
    const { service, rows } = build();
    const first = await service.request(INPUT);
    const second = await service.request(INPUT);
    if (!first.ok || !second.ok) throw new Error("Anfrage fehlgeschlagen");
    expect(rows.size).toBe(1);
    expect(second.approval.id).toBe(first.approval.id);
  });

  it("legt eine neue Anfrage fuer andere Argumente an", async () => {
    const { service, rows } = build();
    await service.request(INPUT);
    await service.request({ ...INPUT, argsHash: "def456" });
    expect(rows.size).toBe(2);
  });
});

describe("Entscheidungen", () => {
  it("verhindert Selbstfreigabe", async () => {
    const { service } = build();
    const created = await service.request(INPUT);
    if (!created.ok) throw new Error("Anfrage fehlgeschlagen");
    const result = await service.decide({ id: created.approval.id, approver: "agent:orchestrator", decision: "approve" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("self_approval");
  });

  it("gibt nach zwei unabhaengigen Stimmen frei", async () => {
    const { service } = build();
    const created = await service.request(INPUT);
    if (!created.ok) throw new Error("Anfrage fehlgeschlagen");
    const first = await service.decide({ id: created.approval.id, approver: "alice", decision: "approve" });
    if (!first.ok) throw new Error("Stimme fehlgeschlagen");
    expect(first.approval.status).toBe("pending");
    const second = await service.decide({ id: created.approval.id, approver: "bob", decision: "approve" });
    if (!second.ok) throw new Error("Stimme fehlgeschlagen");
    expect(second.approval.status).toBe("approved");
  });

  it("meldet unbekannte Anfragen", async () => {
    const { service } = build();
    const result = await service.decide({ id: 999, approver: "alice", decision: "approve" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_found");
  });
});

describe("Nutzung", () => {
  const target = { runId: 7, taskId: "research", serverKey: "websearch", toolName: "search_web", argsHash: "abc123" };

  async function approvedService() {
    const context = build();
    const created = await context.service.request(INPUT);
    if (!created.ok) throw new Error("Anfrage fehlgeschlagen");
    await context.service.decide({ id: created.approval.id, approver: "alice", decision: "approve" });
    await context.service.decide({ id: created.approval.id, approver: "bob", decision: "approve" });
    return context;
  }

  it("findet eine gueltige Freigabe fuer genau diesen Aufruf", async () => {
    const { service } = await approvedService();
    const usable = await service.findUsable(target);
    expect(usable?.status).toBe("approved");
  });

  it("findet keine Freigabe bei abweichenden Argumenten", async () => {
    const { service } = await approvedService();
    expect(await service.findUsable({ ...target, argsHash: "anders" })).toBeNull();
  });

  it("entwertet eine Freigabe nach Verbrauch", async () => {
    const { service } = await approvedService();
    const usable = await service.findUsable(target);
    if (!usable) throw new Error("Freigabe fehlt");
    const consumed = await service.consume(usable.id);
    expect(consumed?.status).toBe("consumed");
    expect(await service.findUsable(target)).toBeNull();
  });
});

describe("Ablauf und Warteschlange", () => {
  it("schliesst abgelaufene Anfragen beim Sweep", async () => {
    const { service, advance } = build();
    await service.request({ ...INPUT, ttlMs: 60_000 });
    // Die Gueltigkeit ist nach unten auf 5 Minuten begrenzt.
    advance(6 * 60_000);
    const sweep = await service.sweep();
    expect(sweep.expired).toBe(1);
    expect((await service.list())[0].status).toBe("expired");
  });

  it("meldet nichts zu tun, wenn nichts abgelaufen ist", async () => {
    const { service } = build();
    await service.request(INPUT);
    const sweep = await service.sweep();
    expect(sweep.expired).toBe(0);
    expect(sweep.summary).toContain("Keine Freigabe");
  });

  it("liefert eine Zusammenfassung der Warteschlange", async () => {
    const { service } = build();
    await service.request(INPUT);
    const queue = await service.queue();
    expect(queue.summary.pending).toBe(1);
    expect(queue.items).toHaveLength(1);
  });

  it("listet Freigaben eines Laufs", async () => {
    const { service } = build();
    await service.request(INPUT);
    await service.request({ ...INPUT, runId: 8 });
    expect(await service.listByRun(7)).toHaveLength(1);
  });
});
