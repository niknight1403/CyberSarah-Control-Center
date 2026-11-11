/**
 * Sprint 7 — Team-Service: planen, pruefen, speichern.
 *
 * Es gibt hier bewusst KEINE Ausfuehrung: der Service erzeugt einen geprueften
 * Plan mit Budgetaufteilung. Laeufe folgen in Sprint 8.
 */
import {
  allocateBudget,
  decomposeObjective,
  summarizeTeamPlan,
  validateTeamPlan,
  type AgentProfile,
  type TeamPlan,
} from "../lib/mcp-team-orchestration-logic";
import type { McpAgentStore } from "./mcp-agent-store";
import type { McpTeamPlanStore, StoredTeamPlan } from "./mcp-team-store";
import { toAgentProfile } from "./mcp-team-store";

export type TeamServiceDeps = {
  agents: McpAgentStore;
  plans: McpTeamPlanStore;
};

export type PlanTeamResult =
  | {
      ok: true;
      stored: StoredTeamPlan;
      summary: ReturnType<typeof summarizeTeamPlan>;
      allocations: Record<string, number>;
      warnings: string[];
    }
  | { ok: false; reason: string; issues?: string[] };

export type TeamService = {
  /** Nur aktive Agenten duerfen Teil eines Teams sein. */
  activeAgents(): Promise<AgentProfile[]>;
  plan(input: { objective: string; budgetCents: number; maxTasks?: number; actor?: string | null }): Promise<PlanTeamResult>;
  list(limit?: number): Promise<StoredTeamPlan[]>;
  get(id: number): Promise<StoredTeamPlan | null>;
  preview(input: { objective: string; budgetCents: number; maxTasks?: number }): Promise<
    | { ok: true; plan: TeamPlan; summary: ReturnType<typeof summarizeTeamPlan>; allocations: Record<string, number>; warnings: string[] }
    | { ok: false; reason: string; issues?: string[] }
  >;
};

export function createMcpTeamService(deps: TeamServiceDeps): TeamService {
  async function activeAgents(): Promise<AgentProfile[]> {
    const agents = await deps.agents.list();
    return agents.filter((agent) => agent.status === "active").map(toAgentProfile);
  }

  async function build(input: { objective: string; budgetCents: number; maxTasks?: number }) {
    const agents = await activeAgents();
    const result = decomposeObjective({
      objective: input.objective,
      agents,
      budgetCents: input.budgetCents,
      maxTasks: input.maxTasks,
    });
    if (!result.ok) {
      return { ok: false as const, reason: "Zerlegung nicht moeglich.", issues: result.issues.map((issue) => issue.message) };
    }
    const validation = validateTeamPlan(result.plan, agents);
    if (!validation.ok) {
      return { ok: false as const, reason: "Plan ist nicht ausfuehrbar.", issues: validation.errors };
    }
    const allocation = allocateBudget({ budgetCents: input.budgetCents, tasks: result.plan.tasks });
    if (!allocation.ok) return { ok: false as const, reason: allocation.reason };
    return { ok: true as const, plan: result.plan, allocation, warnings: validation.warnings };
  }

  return {
    activeAgents,

    async preview(input) {
      const built = await build(input);
      if (!built.ok) return built;
      return {
        ok: true,
        plan: built.plan,
        summary: summarizeTeamPlan(built.plan),
        allocations: built.allocation.allocations,
        warnings: built.warnings,
      };
    },

    async plan(input) {
      const built = await build(input);
      if (!built.ok) return built;
      const stored = await deps.plans.insert({
        plan: built.plan,
        allocations: built.allocation.allocations,
        openCount: built.plan.unassigned.length,
        actor: input.actor ?? null,
      });
      return {
        ok: true,
        stored,
        summary: summarizeTeamPlan(built.plan),
        allocations: built.allocation.allocations,
        warnings: built.warnings,
      };
    },

    async list(limit) {
      return deps.plans.list(limit);
    },

    async get(id) {
      return deps.plans.get(id);
    },
  };
}
