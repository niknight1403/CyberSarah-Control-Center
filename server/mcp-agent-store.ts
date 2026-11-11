/**
 * Sprint 6 — Persistenz der Agentenspezifikationen.
 *
 * Spezifikation und Werkzeugvergabe liegen in getrennten Tabellen: Rechte
 * lassen sich so entziehen, ohne den Prompt anzufassen.
 */
import { and, eq } from "drizzle-orm";

import { mcpAgentGrants, mcpAgentSpecs } from "../drizzle/schema";
import type { AgentSpecDraft } from "../lib/mcp-agent-factory-logic";
import { getDb } from "./db";

export type StoredAgent = {
  id: number;
  agentKey: string;
  name: string;
  role: string;
  purpose: string;
  systemPrompt: string;
  security: unknown;
  acceptanceTests: string[];
  qualityCriteria: string[];
  monitoring: unknown;
  warnings: string[];
  version: number;
  status: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  grants: { serverKey: string; toolName: string; riskLevel: string; purpose: string }[];
};

export type McpAgentStore = {
  list(): Promise<StoredAgent[]>;
  findByKey(agentKey: string): Promise<StoredAgent | null>;
  insert(spec: AgentSpecDraft, actor: string | null): Promise<StoredAgent>;
  setStatus(agentKey: string, status: string): Promise<StoredAgent | null>;
  remove(agentKey: string): Promise<boolean>;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Agenten-Registry nicht lesbar.");
  return db;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export const drizzleAgentStore: McpAgentStore = {
  async list() {
    const db = await requireDb();
    const specs = await db.select().from(mcpAgentSpecs).orderBy(mcpAgentSpecs.agentKey);
    if (specs.length === 0) return [];
    const grants = await db.select().from(mcpAgentGrants);
    return specs.map((spec) => ({
      ...spec,
      acceptanceTests: asStringArray(spec.acceptanceTests),
      qualityCriteria: asStringArray(spec.qualityCriteria),
      warnings: asStringArray(spec.warnings),
      grants: grants
        .filter((grant) => grant.agentId === spec.id)
        .map((grant) => ({
          serverKey: grant.serverKey,
          toolName: grant.toolName,
          riskLevel: grant.riskLevel,
          purpose: grant.purpose,
        })),
    }));
  },

  async findByKey(agentKey) {
    const all = await this.list();
    return all.find((agent) => agent.agentKey === agentKey) ?? null;
  },

  async insert(spec, actor) {
    const db = await requireDb();
    const [row] = await db
      .insert(mcpAgentSpecs)
      .values({
        agentKey: spec.key,
        name: spec.name,
        role: spec.role,
        purpose: spec.purpose,
        systemPrompt: spec.systemPrompt,
        security: spec.security,
        acceptanceTests: spec.acceptanceTests,
        qualityCriteria: spec.qualityCriteria,
        monitoring: spec.monitoring,
        warnings: spec.warnings,
        version: spec.version,
        status: "draft",
        createdBy: actor,
      })
      .returning();

    if (spec.grants.length > 0) {
      await db.insert(mcpAgentGrants).values(
        spec.grants.map((grant) => ({
          agentId: row.id,
          serverKey: grant.serverKey,
          toolName: grant.toolName,
          riskLevel: grant.riskLevel,
          purpose: grant.purpose.slice(0, 200),
        })),
      );
    }

    return {
      ...row,
      acceptanceTests: asStringArray(row.acceptanceTests),
      qualityCriteria: asStringArray(row.qualityCriteria),
      warnings: asStringArray(row.warnings),
      grants: spec.grants,
    };
  },

  async setStatus(agentKey, status) {
    const db = await requireDb();
    const [updated] = await db
      .update(mcpAgentSpecs)
      .set({ status, updatedAt: new Date() })
      .where(eq(mcpAgentSpecs.agentKey, agentKey))
      .returning();
    if (!updated) return null;
    return this.findByKey(agentKey);
  },

  async remove(agentKey) {
    const db = await requireDb();
    const deleted = await db
      .delete(mcpAgentSpecs)
      .where(and(eq(mcpAgentSpecs.agentKey, agentKey)))
      .returning({ id: mcpAgentSpecs.id });
    return deleted.length > 0;
  },
};
