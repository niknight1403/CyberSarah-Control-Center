/**
 * Sprint 9 — Tests der Execution Bridge.
 *
 * Zusagen: ohne Grant kein Aufruf, fehlende Pflichtfelder blocken vor dem
 * Netzwerk, Policy/Freigabe wird vor dem Aufruf geprueft, und jeder Ausgang
 * landet im Audit — ohne Argumentwerte.
 */
import { describe, expect, it } from "vitest";

import { createMcpExecutionBridge, type CallToolFn } from "../server/mcp-execution-bridge-service";
import type { McpAuditStore, StoredAuditEntry } from "../server/mcp-execution-audit-store";
import type { StoredAgent } from "../server/mcp-agent-store";
import type { AuditEntry } from "../lib/mcp-execution-bridge-logic";
import type { TeamTask } from "../lib/mcp-team-orchestration-logic";

const TOOLS = [
  { name: "search_web", description: "Searches the public web and returns ranked results.", inputSchema: { required: ["query"] } },
  { name: "fetch_page", description: "Fetches a web page and returns its text.", inputSchema: { required: ["url"] } },
];

const SERVERS = [
  { serverKey: "websearch", enabled: true, tools: TOOLS, permissions: ["read", "network"], governanceMode: "assisted" },
  { serverKey: "stripe", enabled: true, tools: [{ name: "charge_invoice", description: "Charges the customer invoice and moves money." }], permissions: ["read", "write", "network"], governanceMode: "assisted" },
  { serverKey: "disabled", enabled: false, tools: TOOLS, permissions: ["read"], governanceMode: "assisted" },
];

function agent(overrides: Partial<StoredAgent> & { agentKey: string }): StoredAgent {
  return {
    id: 1,
    name: "Research Scout",
    role: "research",
    purpose: "Recherchiert.",
    systemPrompt: "Prompt",
    security: { mode: "assisted", maxRiskLevel: "low", budgetCentsPerRun: 250, maxStepsPerRun: 20, approvalFor: ["critical"], allowedServers: ["websearch"] },
    acceptanceTests: [],
    qualityCriteria: [],
    monitoring: [],
    warnings: [],
    version: 1,
    status: "active",
    createdBy: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    grants: [{ serverKey: "websearch", toolName: "search_web", riskLevel: "low", purpose: "Sucht." }],
    ...overrides,
  };
}

function task(overrides: Partial<TeamTask> = {}): TeamTask {
  return {
    id: "research",
    title: "Recherchieren",
    goal: "Recherchiere den Markt im Web",
    assignee: "research-scout",
    dependsOn: [],
    matches: [],
    estimatedSteps: 2,
    estimatedCostCents: 30,
    riskLevel: "low",
    requiresApproval: false,
    args: { query: "wettbewerber" },
    ...overrides,
  };
}

function build(options: {
  agents?: StoredAgent[];
  callTool?: CallToolFn;
  auditThrows?: boolean;
  timeoutMs?: number;
} = {}) {
  const storedAgents = options.agents ?? [agent({ agentKey: "research-scout" })];
  const audits: AuditEntry[] = [];
  const audit: McpAuditStore = {
    async list() {
      return [] as StoredAuditEntry[];
    },
    async insert(entry) {
      if (options.auditThrows) throw new Error("DB weg");
      audits.push(entry);
      return { ...entry, id: audits.length, createdAt: new Date(entry.createdAtMs) } as unknown as StoredAuditEntry;
    },
  };
  const calls: { serverKey: string; toolName: string; args: Record<string, unknown> }[] = [];
  const callTool: CallToolFn =
    options.callTool ??
    (async (serverKey, input) => {
      calls.push({ serverKey, ...input });
      return { ok: true };
    });

  const bridge = createMcpExecutionBridge({
    agents: { findByKey: async (key) => storedAgents.find((entry) => entry.agentKey === key) ?? null },
    servers: { list: async () => SERVERS as never },
    audit,
    callTool,
    now: () => 1_000,
    timeoutMs: options.timeoutMs ?? 50,
  });
  return { bridge, audits, calls };
}

describe("Vorpruefungen", () => {
  it("blockt unbekannte Agenten", async () => {
    const { bridge, calls } = build();
    const result = await bridge.executor({ task: task(), agentKey: "gibtsnicht", attempt: 1 });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("unknown_agent");
    expect(result.retryable).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("blockt inaktive Agenten", async () => {
    const { bridge } = build({ agents: [agent({ agentKey: "research-scout", status: "paused" })] });
    const result = await bridge.executor({ task: task(), agentKey: "research-scout", attempt: 1 });
    expect(result.code).toBe("agent_inactive");
  });

  it("blockt Werkzeuge ohne Grant", async () => {
    const { bridge, calls } = build({ agents: [agent({ agentKey: "research-scout", grants: [{ serverKey: "docs", toolName: "read_pdf", riskLevel: "low", purpose: "x" }] })] });
    const result = await bridge.executor({ task: task(), agentKey: "research-scout", attempt: 1 });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("no_granted_tools");
    expect(calls).toHaveLength(0);
  });

  it("blockt fehlende Pflichtfelder, ohne Werte zu erfinden", async () => {
    const { bridge, calls, audits } = build();
    const result = await bridge.executor({ task: task({ args: {} }), agentKey: "research-scout", attempt: 1 });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("missing_arguments");
    expect(calls).toHaveLength(0);
    expect(audits[0].decision).toBe("blocked");
  });

  it("blockt bei fehlender Server-Berechtigung", async () => {
    const { calls } = build({
      agents: [
        agent({
          agentKey: "research-scout",
          grants: [{ serverKey: "websearch", toolName: "search_web", riskLevel: "low", purpose: "x" }],
        }),
      ],
    });
    const noPermissions = [{ ...SERVERS[0], permissions: [] }, SERVERS[1], SERVERS[2]];
    const isolated = createMcpExecutionBridge({
      agents: { findByKey: async () => agent({ agentKey: "research-scout" }) },
      servers: { list: async () => noPermissions as never },
      audit: { list: async () => [], insert: async (entry) => ({ ...entry, id: 1, createdAt: new Date() }) as unknown as StoredAuditEntry },
      callTool: async () => ({ ok: true }),
      now: () => 1_000,
    });
    const result = await isolated.executor({ task: task(), agentKey: "research-scout", attempt: 1 });
    expect(result.code).toBe("policy_blocked");
    expect(calls).toHaveLength(0);
  });

  it("verlangt Freigabe fuer kritische Werkzeuge vor dem Aufruf", async () => {
    const risky = agent({
      agentKey: "research-scout",
      grants: [{ serverKey: "stripe", toolName: "charge_invoice", riskLevel: "critical", purpose: "x" }],
    });
    const { bridge, calls, audits } = build({ agents: [risky] });
    const result = await bridge.executor({
      task: task({ goal: "charge invoice customer", title: "Zahlung", args: {} }),
      agentKey: "research-scout",
      attempt: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("approval_required");
    expect(calls).toHaveLength(0);
    expect(audits[0].decision).toBe("approval_required");
  });
});

describe("Aufruf und Audit", () => {
  it("ruft das gewaehlte Werkzeug mit den Aufgaben-Argumenten auf", async () => {
    const { bridge, calls, audits } = build();
    const result = await bridge.executor({ task: task(), agentKey: "research-scout", attempt: 1, runId: 7 });
    expect(result.ok).toBe(true);
    expect(result.costCents).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].serverKey).toBe("websearch");
    expect(calls[0].args).toEqual({ query: "wettbewerber" });
    expect(audits[0]).toMatchObject({ decision: "succeeded", runId: 7, taskId: "research" });
  });

  it("schreibt keine Argumentwerte ins Audit", async () => {
    const { bridge, audits } = build();
    await bridge.executor({ task: task({ args: { query: "streng-geheim" } }), agentKey: "research-scout", attempt: 1 });
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain("streng-geheim");
    expect(audits[0].argKeys).toEqual({ query: "string" });
    expect(audits[0].argsHash).toHaveLength(32);
  });

  it("wertet Timeouts als wiederholbar, aber ohne Kosten", async () => {
    const slow: CallToolFn = () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 200));
    const { bridge, audits } = build({ callTool: slow, timeoutMs: 10 });
    const result = await bridge.executor({ task: task(), agentKey: "research-scout", attempt: 1 });
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.costCents).toBe(0);
    expect(audits[0].decision).toBe("failed");
  });

  it("behandelt Exceptions des Aufrufs als Fehlschlag", async () => {
    const { bridge } = build({ callTool: async () => { throw new Error("Netzwerk weg"); } });
    const result = await bridge.executor({ task: task(), agentKey: "research-scout", attempt: 1 });
    expect(result.ok).toBe(false);
    expect(result.note).toContain("Netzwerk weg");
  });

  it("bleibt bei Audit-Ausfall ehrlich zum Aufrufergebnis", async () => {
    const { bridge } = build({ auditThrows: true });
    const result = await bridge.executor({ task: task(), agentKey: "research-scout", attempt: 1 });
    expect(result.ok).toBe(true);
  });
});

describe("Vorschau", () => {
  it("zeigt Werkzeug, Risiko, Policy und fehlende Argumente ohne Aufruf", async () => {
    const { bridge, calls } = build();
    const preview = await bridge.resolve({ task: task({ args: {} }), agentKey: "research-scout" });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.serverKey).toBe("websearch");
    expect(preview.riskLevel).toBe("low");
    expect(preview.missingArguments).toEqual(["query"]);
    expect(calls).toHaveLength(0);
  });

  it("meldet unbekannte Agenten in der Vorschau", async () => {
    const { bridge } = build();
    const preview = await bridge.resolve({ task: task(), agentKey: "gibtsnicht" });
    expect(preview.ok).toBe(false);
  });
});
