/**
 * Sprint 7 — Persistenz der Team-Plaene. Plaene sind unveraenderliche
 * Momentaufnahmen; Aenderungen erzeugen einen neuen Plan.
 */
import { desc, eq } from "drizzle-orm";

import { mcpTeamPlans } from "../drizzle/schema";
import type { TeamPlan } from "../lib/mcp-team-orchestration-logic";
import { getDb } from "./db";
import type { StoredAgent } from "./mcp-agent-store";

export type StoredTeamPlan = {
  id: number;
  objective: string;
  plan: TeamPlan;
  allocations: Record<string, number>;
  budgetCents: number;
  taskCount: number;
  openCount: number;
  status: string;
  createdBy: string | null;
  createdAt: Date;
};

export type McpTeamPlanStore = {
  list(limit?: number): Promise<StoredTeamPlan[]>;
  get(id: number): Promise<StoredTeamPlan | null>;
  insert(input: {
    plan: TeamPlan;
    allocations: Record<string, number>;
    openCount: number;
    actor: string | null;
  }): Promise<StoredTeamPlan>;
  setStatus(id: number, status: string): Promise<boolean>;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Team-Plaene nicht lesbar.");
  return db;
}

/** Agenten-Zeile -> Profil fuer die reine Planungslogik (tolerant bei Altbestand). */
export function toAgentProfile(agent: StoredAgent) {
  const security = (agent.security ?? {}) as Record<string, unknown>;
  const numberOr = (value: unknown, fallback: number) => (typeof value === "number" && value > 0 ? value : fallback);
  const risk = typeof security.maxRiskLevel === "string" ? security.maxRiskLevel : "low";
  const mode = typeof security.mode === "string" ? security.mode : "assisted";
  const approvalFor = Array.isArray(security.approvalFor)
    ? security.approvalFor.filter((item): item is string => typeof item === "string")
    : ["critical"];
  const allowedServers = Array.isArray(security.allowedServers)
    ? security.allowedServers.filter((item): item is string => typeof item === "string")
    : agent.grants.map((grant) => grant.serverKey);

  return {
    agentKey: agent.agentKey,
    name: agent.name,
    role: agent.role,
    grants: agent.grants.map((grant) => ({
      serverKey: grant.serverKey,
      toolName: grant.toolName,
      riskLevel: grant.riskLevel as "low" | "medium" | "high" | "critical",
    })),
    security: {
      mode: mode as "manual" | "assisted" | "autonomous",
      maxRiskLevel: risk as "low" | "medium" | "high" | "critical",
      budgetCentsPerRun: numberOr(security.budgetCentsPerRun, 200),
      maxStepsPerRun: numberOr(security.maxStepsPerRun, 16),
      approvalFor: approvalFor as ("low" | "medium" | "high" | "critical")[],
      allowedServers,
    },
  };
}

export const drizzleTeamPlanStore: McpTeamPlanStore = {
  async list(limit = 20) {
    const db = await requireDb();
    const rows = await db.select().from(mcpTeamPlans).orderBy(desc(mcpTeamPlans.createdAt)).limit(Math.min(limit, 100));
    return rows.map((row) => ({
      ...row,
      plan: row.plan as TeamPlan,
      allocations: (row.allocations ?? {}) as Record<string, number>,
    }));
  },

  async get(id) {
    const db = await requireDb();
    const [row] = await db.select().from(mcpTeamPlans).where(eq(mcpTeamPlans.id, id)).limit(1);
    if (!row) return null;
    return { ...row, plan: row.plan as TeamPlan, allocations: (row.allocations ?? {}) as Record<string, number> };
  },

  async insert(input) {
    const db = await requireDb();
    const [row] = await db
      .insert(mcpTeamPlans)
      .values({
        objective: input.plan.objective,
        plan: input.plan,
        allocations: input.allocations,
        budgetCents: input.plan.budgetCents,
        taskCount: input.plan.tasks.length,
        openCount: input.openCount,
        status: "planned",
        createdBy: input.actor,
      })
      .returning();
    return { ...row, plan: row.plan as TeamPlan, allocations: (row.allocations ?? {}) as Record<string, number> };
  },

  async setStatus(id, status) {
    const db = await requireDb();
    const updated = await db.update(mcpTeamPlans).set({ status }).where(eq(mcpTeamPlans.id, id)).returning({ id: mcpTeamPlans.id });
    return updated.length > 0;
  },
};
