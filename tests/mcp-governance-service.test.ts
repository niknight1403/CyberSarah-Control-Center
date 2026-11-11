/**
 * Sprint 3 — Tests des Governance-Service (Fähigkeitsindex, Gate, Freigaben).
 *
 * In-Memory-Stores statt Datenbank: geprüft wird die Orchestrierung, nicht
 * Drizzle. Die Sicherheitszusagen stehen im Vordergrund: Least Privilege vor
 * dem Netzwerk, Freigabe nur mit gültiger Entscheidung, Signaturbindung.
 */
import { describe, expect, it } from "vitest";

import type { McpApprovalRow, McpToolGovernanceRow } from "../drizzle/schema";
import { createMcpGovernanceService, type GovernanceServer } from "../server/mcp-governance-service";
import type { ApprovalStore, ToolGovernanceStore } from "../server/mcp-governance-store";

const NOW = Date.parse("2026-11-11T06:00:00.000Z");

function govRow(overrides: Partial<McpToolGovernanceRow> = {}): McpToolGovernanceRow {
  return {
    id: 1,
    serverKey: "srv",
    toolName: "list_files",
    capabilities: ["filesystem"],
    primaryCapability: "filesystem",
    riskLevel: "medium",
    decision: "allow",
    reasons: [],
    signature: "abc",
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  } as McpToolGovernanceRow;
}

function approvalRow(overrides: Partial<McpApprovalRow> = {}): McpApprovalRow {
  return {
    id: 1,
    serverKey: "srv",
    toolName: "execute_shell",
    riskLevel: "critical",
    status: "pending",
    reason: "Code-Ausführung",
    argsPreview: {},
    requestedBy: "admin",
    decidedBy: null,
    decidedAt: null,
    expiresAt: new Date(NOW + 24 * 60 * 60_000),
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  } as McpApprovalRow;
}

function createFakes(seedTools: McpToolGovernanceRow[] = [], seedApprovals: McpApprovalRow[] = []) {
  const tools = new Map(seedTools.map((row) => [`${row.serverKey}::${row.toolName}`, row]));
  const approvals = new Map(seedApprovals.map((row) => [row.id, row]));
  let toolId = 100;
  let approvalId = 100;

  const toolStore: ToolGovernanceStore = {
    async listByServer(serverKey) {
      return [...tools.values()].filter((row) => row.serverKey === serverKey);
    },
    async listAll() {
      return [...tools.values()];
    },
    async findByTool(serverKey, toolName) {
      return tools.get(`${serverKey}::${toolName}`) ?? null;
    },
    async upsert(row) {
      const key = `${row.serverKey}::${row.toolName}`;
      const saved = govRow({
        ...(tools.get(key) ?? { id: toolId++ }),
        ...row,
        capabilities: row.capabilities ?? [],
        reasons: row.reasons ?? [],
        updatedAt: new Date(NOW),
      });
      tools.set(key, saved);
      return saved;
    },
    async markReviewed(serverKey, toolName, reviewedBy, reviewedAt) {
      const existing = tools.get(`${serverKey}::${toolName}`);
      if (!existing) return null;
      const saved = { ...existing, reviewedBy, reviewedAt };
      tools.set(`${serverKey}::${toolName}`, saved);
      return saved;
    },
    async deleteForServer(serverKey, keepToolNames) {
      let removed = 0;
      for (const [key, row] of tools) {
        if (row.serverKey === serverKey && !keepToolNames.includes(row.toolName)) {
          tools.delete(key);
          removed += 1;
        }
      }
      return removed;
    },
  };

  const approvalStore: ApprovalStore = {
    async list(status) {
      return [...approvals.values()].filter((row) => !status || row.status === status);
    },
    async findById(id) {
      return approvals.get(id) ?? null;
    },
    async findUsable(serverKey, toolName, nowMs) {
      return (
        [...approvals.values()].find(
          (row) =>
            row.serverKey === serverKey &&
            row.toolName === toolName &&
            row.status === "approved" &&
            (!row.expiresAt || row.expiresAt.getTime() > nowMs),
        ) ?? null
      );
    },
    async findPending(serverKey, toolName) {
      return (
        [...approvals.values()].find(
          (row) => row.serverKey === serverKey && row.toolName === toolName && row.status === "pending",
        ) ?? null
      );
    },
    async insert(row) {
      const saved = approvalRow({ ...row, id: approvalId++ });
      approvals.set(saved.id, saved);
      return saved;
    },
    async decide(id, patch) {
      const existing = approvals.get(id);
      if (!existing) return null;
      const saved = { ...existing, ...patch };
      approvals.set(id, saved);
      return saved;
    },
    async expireStale(now) {
      let expired = 0;
      for (const [id, row] of approvals) {
        if (row.status === "pending" && row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
          approvals.set(id, { ...row, status: "expired" });
          expired += 1;
        }
      }
      return expired;
    },
  };

  return { toolStore, approvalStore, tools, approvals };
}

const servers: GovernanceServer[] = [
  {
    serverKey: "srv",
    enabled: true,
    permissions: ["read", "network", "filesystem", "write", "shell"],
    governanceMode: "assisted",
    tools: [
      { name: "list_files", description: "Listet Dateien im Verzeichnis" },
      { name: "read_pdf", description: "Liest PDF-Dateien" },
      { name: "execute_shell", description: "Führt einen Befehl aus" },
      { name: "send_email", description: "Sendet eine Nachricht" },
    ],
  },
  {
    serverKey: "off",
    enabled: false,
    permissions: ["read"],
    governanceMode: "assisted",
    tools: [{ name: "search_web", description: "Websuche" }],
  },
];

function build(seedTools: McpToolGovernanceRow[] = [], seedApprovals: McpApprovalRow[] = [], customServers = servers) {
  const fakes = createFakes(seedTools, seedApprovals);
  const service = createMcpGovernanceService({
    toolStore: fakes.toolStore,
    approvalStore: fakes.approvalStore,
    loadServers: async () => customServers,
    now: () => NOW,
  });
  return { service, ...fakes };
}

describe("Fähigkeitsindex", () => {
  it("indexiert alle Werkzeuge eines Servers mit Risiko und Entscheidung", async () => {
    const { service, tools } = build();
    const result = await service.indexServerTools("srv");
    expect(result).toEqual({ ok: true, indexed: 4, removed: 0 });
    expect(tools.size).toBe(4);
    expect(tools.get("srv::execute_shell")?.riskLevel).toBe("critical");
    expect(tools.get("srv::execute_shell")?.decision).toBe("approval_required");
    expect(tools.get("srv::list_files")?.decision).toBe("allow");
    expect(tools.get("srv::send_email")?.decision).toBe("approval_required");
  });

  it("entfernt Einträge, die der Server nicht mehr meldet", async () => {
    const { service, tools } = build([govRow({ serverKey: "srv", toolName: "altes_tool" })]);
    const result = await service.indexServerTools("srv");
    expect(result.ok).toBe(true);
    expect(tools.has("srv::altes_tool")).toBe(false);
    expect(result.ok && result.removed).toBe(1);
  });

  it("meldet unbekannte Server ehrlich", async () => {
    const { service } = build();
    const result = await service.indexServerTools("fehlt");
    expect(result).toMatchObject({ ok: false });
  });

  it("liefert Governance-Einträge mit lesbaren Zeitstempeln", async () => {
    const { service } = build([govRow()]);
    const result = await service.listGovernance("srv");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tools[0].updatedAt).toBe(new Date(NOW).toISOString());
  });

  it("meldet Datenbankfehler, statt leere Governance zu behaupten", async () => {
    const service = createMcpGovernanceService({
      toolStore: {
        listByServer: async () => {
          throw new Error("Datenbank nicht verfuegbar");
        },
        listAll: async () => {
          throw new Error("Datenbank nicht verfuegbar");
        },
        findByTool: async () => null,
        upsert: async () => govRow(),
        markReviewed: async () => null,
        deleteForServer: async () => 0,
      },
      approvalStore: createFakes().approvalStore,
      loadServers: async () => servers,
      now: () => NOW,
    });
    const result = await service.listGovernance();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Datenbank");
  });
});

describe("Semantische Suche über Server", () => {
  it("findet Werkzeuge und ignoriert deaktivierte Server", async () => {
    const { service } = build();
    const results = await service.search("PDF lesen");
    expect(results.map((entry) => entry.name)).toContain("read_pdf");
    expect(results.every((entry) => entry.serverKey !== "off")).toBe(true);
    expect(await service.search("Websuche")).toEqual([]);
  });

  it("filtert nach Fähigkeit", async () => {
    const { service } = build();
    const results = await service.search("datei", { capability: "filesystem" });
    expect(results.every((entry) => entry.capabilities.includes("filesystem"))).toBe(true);
  });
});

describe("Aufruf-Gate", () => {
  it("erlaubt lesende Werkzeuge mit passender Berechtigung", async () => {
    const { service } = build();
    const result = await service.evaluateCall({ serverKey: "srv", toolName: "list_files", args: { path: "/tmp" } });
    expect(result.decision).toBe("allow");
    expect(result.args).toEqual({ path: "/tmp" });
    expect(result.approvalId).toBeNull();
  });

  it("blockiert fehlende Berechtigungen", async () => {
    const { service } = build([], [], [{ ...servers[0], permissions: ["read"] }]);
    const result = await service.evaluateCall({ serverKey: "srv", toolName: "list_files", args: {} });
    expect(result.decision).toBe("block");
    expect(result.reasons.join(" ")).toContain("Berechtigung fehlt");
  });

  it("blockiert unbekannte Server, deaktivierte Server und unbekannte Werkzeuge", async () => {
    const { service } = build();
    expect((await service.evaluateCall({ serverKey: "fehlt", toolName: "x", args: {} })).decision).toBe("block");
    expect((await service.evaluateCall({ serverKey: "off", toolName: "search_web", args: {} })).decision).toBe("block");
    const missing = await service.evaluateCall({ serverKey: "srv", toolName: "gibt_es_nicht", args: {} });
    expect(missing.decision).toBe("block");
    expect(missing.reasons.join(" ")).toContain("nicht (mehr) gelistet");
  });

  it("legt für kritische Werkzeuge genau eine Freigabeanfrage an", async () => {
    const { service, approvals } = build([], [], [
      { ...servers[0], permissions: ["read", "network", "filesystem", "shell"], governanceMode: "autonomous" },
    ]);
    const first = await service.evaluateCall({ serverKey: "srv", toolName: "execute_shell", args: {}, requestedBy: "admin" });
    expect(first.decision).toBe("approval_required");
    expect(first.approvalId).toBeGreaterThan(0);
    expect(approvals.size).toBe(1);

    const second = await service.evaluateCall({ serverKey: "srv", toolName: "execute_shell", args: {} });
    expect(second.decision).toBe("approval_required");
    expect(second.approvalId).toBe(first.approvalId);
    expect(approvals.size).toBe(1);
  });

  it("erlaubt den Aufruf nach Genehmigung und markiert die Prüfung", async () => {
    const { service, tools } = build([], [], [
      { ...servers[0], permissions: ["read", "network", "filesystem", "shell"], governanceMode: "autonomous" },
    ]);
    await service.indexServerTools("srv");
    const request = await service.evaluateCall({ serverKey: "srv", toolName: "execute_shell", args: {} });
    const id = request.approvalId as number;

    const decided = await service.decideApproval({ id, decision: "approved", decidedBy: "owner" });
    expect(decided.ok).toBe(true);

    const allowed = await service.evaluateCall({ serverKey: "srv", toolName: "execute_shell", args: {} });
    expect(allowed.decision).toBe("allow");
    expect(allowed.reasons.join(" ")).toContain(`Freigabe #${id}`);
    expect(tools.get("srv::execute_shell")?.reviewedBy).toBe("owner");
  });

  it("lehnt Argumente mit Shell-Metazeichen bei Ausführungswerkzeugen ab", async () => {
    const { service } = build([], [], [
      { ...servers[0], permissions: ["read", "network", "filesystem", "shell"], governanceMode: "assisted" },
    ]);
    const result = await service.evaluateCall({
      serverKey: "srv",
      toolName: "execute_shell",
      args: { command: "ls; rm -rf /" },
    });
    expect(result.decision).toBe("block");
    expect(result.reasons.join(" ")).toContain("Shell-Metazeichen");
  });

  it("verweigert Entscheidungen zu unbekannten oder bereits entschiedenen Freigaben", async () => {
    const { service } = build([], [approvalRow({ id: 7, status: "approved" })]);
    const unknown = await service.decideApproval({ id: 999, decision: "approved", decidedBy: "owner" });
    expect(unknown.ok).toBe(false);
    const done = await service.decideApproval({ id: 7, decision: "approved", decidedBy: "owner" });
    expect(done.ok).toBe(false);
    if (done.ok) return;
    expect(done.reason).toContain("bereits");
  });

  it("listet Freigaben nach Status und lässt abgelaufene verfallen", async () => {
    const { service, approvals } = build(
      [],
      [
        approvalRow({ id: 1, status: "pending", expiresAt: new Date(NOW - 1) }),
        approvalRow({ id: 2, status: "pending", expiresAt: new Date(NOW + 60_000) }),
      ],
    );
    const pending = await service.listApprovals("pending");
    expect(pending).toHaveLength(2);
    const expired = await service.expireStaleApprovals();
    expect(expired).toBe(1);
    expect(approvals.get(1)?.status).toBe("expired");
    expect(approvals.get(2)?.status).toBe("pending");
  });
});
