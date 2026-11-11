/**
 * Sprint 6 — Agent Factory Service.
 *
 * Verbindet die reine Planungslogik mit der echten Werkzeug-Registry:
 *
 *   Katalog (nur aktive Server) -> Planung -> Validierung -> Speicherung
 *
 * Kein Agent wird gespeichert, wenn die Validierung Fehler findet. Der Agent
 * startet immer als "draft"; aktivieren ist ein bewusster Schritt.
 */
import {
  planAgentFromBrief,
  slugifyAgentKey,
  summarizeAgentSpec,
  validateAgentSpec,
  type AgentSpecDraft,
} from "../lib/mcp-agent-factory-logic";
import { buildToolProfiles, type ToolDescriptorLike, type ToolProfile } from "../lib/mcp-governance-logic";
import type { McpAgentStore, StoredAgent } from "./mcp-agent-store";
import type { McpServerStore } from "./mcp-server-store";

export type AgentFactoryDeps = {
  store: McpAgentStore;
  servers: Pick<McpServerStore, "list">;
  now?: () => number;
};

export type FactoryResult =
  | { ok: true; agent: StoredAgent; summary: ReturnType<typeof summarizeAgentSpec>; warnings: string[] }
  | { ok: false; reason: string; errors?: string[] };

export type DryRunResult =
  | { ok: true; draft: AgentSpecDraft; summary: ReturnType<typeof summarizeAgentSpec>; warnings: string[] }
  | { ok: false; reason: string; errors?: string[] };

export type McpAgentService = {
  catalog(): Promise<ToolProfile[]>;
  dryRun(input: { name: string; brief: string; allowCritical?: boolean; maxGrants?: number }): Promise<DryRunResult>;
  create(input: { name: string; brief: string; allowCritical?: boolean; maxGrants?: number; actor?: string | null }): Promise<FactoryResult>;
  list(): Promise<StoredAgent[]>;
  get(agentKey: string): Promise<StoredAgent | null>;
  setStatus(agentKey: string, status: "draft" | "active" | "paused"): Promise<{ ok: true; agent: StoredAgent } | { ok: false; reason: string }>;
  remove(agentKey: string): Promise<{ ok: true; removed: boolean }>;
};

export function createMcpAgentService(deps: AgentFactoryDeps): McpAgentService {
  /** Nur aktive Server mit entdeckten Werkzeugen zaehlen als Katalog. */
  async function catalog(): Promise<ToolProfile[]> {
    const servers = await deps.servers.list();
    const profiles: ToolProfile[] = [];
    for (const server of servers) {
      if (!server.enabled) continue;
      const tools = Array.isArray(server.tools) ? (server.tools as unknown as ToolDescriptorLike[]) : [];
      if (tools.length === 0) continue;
      profiles.push(...buildToolProfiles(server.serverKey, tools));
    }
    return profiles;
  }

  async function plan(input: { name: string; brief: string; allowCritical?: boolean; maxGrants?: number }) {
    const profiles = await catalog();
    const planned = planAgentFromBrief({
      name: input.name,
      brief: input.brief,
      profiles,
      allowCritical: input.allowCritical,
      maxGrants: input.maxGrants,
    });
    if (!planned.ok) return { ok: false as const, reason: planned.reason };
    const validation = validateAgentSpec(planned.draft, profiles);
    if (!validation.ok) {
      return { ok: false as const, reason: "Entwurf ist nicht freigabefaehig.", errors: validation.errors };
    }
    return { ok: true as const, draft: planned.draft, warnings: validation.warnings };
  }

  return {
    catalog,

    async dryRun(input) {
      const result = await plan(input);
      if (!result.ok) return result;
      return { ok: true, draft: result.draft, summary: summarizeAgentSpec(result.draft), warnings: result.warnings };
    },

    async create(input) {
      const existing = await deps.store.findByKey(slugifyAgentKey(input.name));
      if (existing) {
        return { ok: false, reason: `Agent "${existing.agentKey}" existiert bereits (Version ${existing.version}).` };
      }
      const result = await plan(input);
      if (!result.ok) return result;
      const agent = await deps.store.insert(result.draft, input.actor ?? null);
      return { ok: true, agent, summary: summarizeAgentSpec(result.draft), warnings: result.warnings };
    },

    async list() {
      return deps.store.list();
    },

    async get(agentKey) {
      return deps.store.findByKey(agentKey);
    },

    async setStatus(agentKey, status) {
      const agent = await deps.store.findByKey(agentKey);
      if (!agent) return { ok: false, reason: `Agent "${agentKey}" nicht gefunden.` };
      if (status === "active" && agent.grants.length === 0) {
        return { ok: false, reason: "Agent ohne Werkzeuge kann nicht aktiviert werden — er haette keinen Ausfuehrungspfad." };
      }
      const updated = await deps.store.setStatus(agentKey, status);
      if (!updated) return { ok: false, reason: "Status konnte nicht gespeichert werden." };
      return { ok: true, agent: updated };
    },

    async remove(agentKey) {
      return { ok: true, removed: await deps.store.remove(agentKey) };
    },
  };
}
