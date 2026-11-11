/**
 * Sprint 7 — Tests des Team-Service.
 *
 * Zusagen: nur aktive Agenten bilden ein Team, unbrauchbare Plaene werden
 * nicht gespeichert, die Budgetaufteilung summiert exakt auf das Budget, und
 * gespeicherte Plaene sind abrufbar.
 */
import { describe, expect, it } from "vitest";

import { createMcpTeamService } from "../server/mcp-team-service";
import { toAgentProfile } from "../server/mcp-team-store";
import type { StoredAgent } from "../server/mcp-agent-store";
import type { McpTeamPlanStore, StoredTeamPlan } from "../server/mcp-team-store";

function storedAgent(overrides: Partial<StoredAgent> & { agentKey: string }): StoredAgent {
  return {
    id: 1,
    name: "Research Scout",
    role: "research",
    purpose: "Recherchiert Maerkte.",
    systemPrompt: "Prompt",
    security: {
      mode: "assisted",
      maxRiskLevel: "low",
      budgetCentsPerRun: 250,
      maxStepsPerRun: 20,
      approvalFor: ["critical"],
      allowedServers: ["websearch"],
    },
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

const RESEARCH = storedAgent({ agentKey: "research-scout" });
const WRITER = storedAgent({
  agentKey: "content-writer",
  name: "Content Writer",
  role: "content",
  grants: [{ serverKey: "docs", toolName: "write_document", riskLevel: "medium", purpose: "Schreibt." }],
  security: {
    mode: "assisted",
    maxRiskLevel: "medium",
    budgetCentsPerRun: 400,
    maxStepsPerRun: 24,
    approvalFor: ["critical"],
    allowedServers: ["docs"],
  },
});
const PAUSED = storedAgent({ agentKey: "paused-agent", status: "paused" });

const OBJECTIVE = "Recherchiere den Markt, erstelle einen Bericht und pruefe die Qualitaet.";

function build(seed: StoredAgent[] = [RESEARCH, WRITER]) {
  const plans = new Map<number, StoredTeamPlan>();
  let id = 1;
  const store: McpTeamPlanStore = {
    async list(limit = 20) {
      return [...plans.values()].slice(0, limit);
    },
    async get(planId) {
      return plans.get(planId) ?? null;
    },
    async insert(input) {
      const row: StoredTeamPlan = {
        id: id++,
        objective: input.plan.objective,
        plan: input.plan,
        allocations: input.allocations,
        budgetCents: input.plan.budgetCents,
        taskCount: input.plan.tasks.length,
        openCount: input.openCount,
        status: "planned",
        createdBy: input.actor,
        createdAt: new Date(0),
      };
      plans.set(row.id, row);
      return row;
    },
    async setStatus(planId, status) {
      const existing = plans.get(planId);
      if (!existing) return false;
      plans.set(planId, { ...existing, status });
      return true;
    },
  };
  const agents = {
    list: async () => seed,
    findByKey: async () => null,
    insert: async () => {
      throw new Error("nicht benoetigt");
    },
    setStatus: async () => null,
    remove: async () => false,
  };
  const service = createMcpTeamService({ agents, plans: store });
  return { service, plans };
}

describe("Agentenprofil", () => {
  it("uebernimmt Gespeichertes und faellt bei Altbestand auf sichere Defaults zurueck", () => {
    const profile = toAgentProfile(storedAgent({ agentKey: "alt", security: {} }));
    expect(profile.security.maxRiskLevel).toBe("low");
    expect(profile.security.approvalFor).toContain("critical");
    expect(profile.security.allowedServers).toEqual(["websearch"]);
    expect(profile.security.budgetCentsPerRun).toBeGreaterThan(0);
  });
});

describe("Team bilden", () => {
  it("nutzt nur aktive Agenten", async () => {
    const { service } = build([RESEARCH, WRITER, PAUSED]);
    const agents = await service.activeAgents();
    expect(agents.map((agent) => agent.agentKey)).toEqual(["research-scout", "content-writer"]);
  });

  it("liefert ein Preview ohne zu speichern", async () => {
    const { service, plans } = build();
    const result = await service.preview({ objective: OBJECTIVE, budgetCents: 1000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.tasks.length).toBeGreaterThan(0);
    expect(result.summary.assigned).toBeGreaterThan(0);
    expect(plans.size).toBe(0);
  });

  it("verteilt das Budget exakt", async () => {
    const { service } = build();
    const result = await service.preview({ objective: OBJECTIVE, budgetCents: 1000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sum = Object.values(result.allocations).reduce((total, value) => total + value, 0);
    expect(sum).toBe(1000);
  });

  it("speichert einen Plan mit offenen Aufgaben", async () => {
    const { service, plans } = build([RESEARCH]);
    const result = await service.plan({ objective: OBJECTIVE, budgetCents: 800, actor: "admin" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(plans.size).toBe(1);
    expect(result.stored.createdBy).toBe("admin");
    expect(result.stored.openCount).toBeGreaterThanOrEqual(0);
    expect(result.stored.taskCount).toBe(result.stored.plan.tasks.length);
  });

  it("lehnt ein Team ohne aktive Agenten ab", async () => {
    const { service } = build([PAUSED]);
    const result = await service.plan({ objective: OBJECTIVE, budgetCents: 500 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues?.join(" ")).toContain("Kein aktiver Agent");
  });

  it("lehnt ein zu kurzes Ziel ab", async () => {
    const { service } = build();
    const result = await service.plan({ objective: "kurz", budgetCents: 500 });
    expect(result.ok).toBe(false);
  });

  it("speichert nichts, wenn die Zerlegung scheitert", async () => {
    const { service, plans } = build();
    await service.plan({ objective: "kurz", budgetCents: 500 });
    expect(plans.size).toBe(0);
  });

  it("liefert gespeicherte Plaene wieder", async () => {
    const { service } = build();
    const created = await service.plan({ objective: OBJECTIVE, budgetCents: 900 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const loaded = await service.get(created.stored.id);
    expect(loaded?.objective).toBe(OBJECTIVE);
    expect((await service.list()).length).toBe(1);
    expect(await service.get(999)).toBeNull();
  });
});
