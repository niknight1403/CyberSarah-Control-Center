/**
 * Master-Prompt Phase 2 — Persistenz der MCP-Server-Registry.
 *
 * Duenne Drizzle-Schicht ueber `mcp_servers`. Keine Fachlogik: Validierung,
 * Health-Bewertung und Routing liegen rein in lib/mcp-server-registry-logic.ts,
 * die Orchestrierung in server/mcp-server-service.ts. Ohne Datenbank wird
 * ehrlich geworfen — die Registry ist Betriebskonfiguration, kein Cache.
 */
import { and, desc, eq } from "drizzle-orm";

import { mcpServers, type McpServerRow } from "../drizzle/schema";
import type { McpServerNormalized } from "../lib/mcp-server-registry-logic";
import { getDb } from "./db";

export type McpServerProbePatch = {
  healthStatus: string;
  healthScore: number | null;
  lastCheckedAt: Date;
  lastOkAt?: Date | null;
  lastErrorAt?: Date | null;
  lastError?: string | null;
  consecutiveFailures: number;
  serverName?: string | null;
  serverVersion?: string | null;
  tools?: Record<string, unknown>[];
  toolsDiscoveredAt?: Date | null;
};

export type McpServerStore = {
  list(): Promise<McpServerRow[]>;
  findByKey(serverKey: string): Promise<McpServerRow | null>;
  upsert(server: McpServerNormalized): Promise<McpServerRow>;
  setEnabled(serverKey: string, enabled: boolean): Promise<McpServerRow | null>;
  remove(serverKey: string): Promise<boolean>;
  recordProbe(serverKey: string, patch: McpServerProbePatch): Promise<McpServerRow | null>;
};

async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new Error("Datenbank nicht verfuegbar — MCP-Server-Registry nicht lesbar.");
  }
  return db;
}

export const drizzleMcpServerStore: McpServerStore = {
  async list() {
    const db = await requireDb();
    return db.select().from(mcpServers).orderBy(desc(mcpServers.enabled), desc(mcpServers.updatedAt), mcpServers.serverKey);
  },

  async findByKey(serverKey) {
    const db = await requireDb();
    const [row] = await db.select().from(mcpServers).where(eq(mcpServers.serverKey, serverKey)).limit(1);
    return row ?? null;
  },

  async upsert(server) {
    const db = await requireDb();
    const [row] = await db
      .insert(mcpServers)
      .values({
        serverKey: server.key,
        name: server.name,
        baseUrl: server.baseUrl,
        transport: server.transport,
        permissions: server.permissions,
        credentialEnvVar: server.credentialEnvVar,
        costProfile: server.costProfile,
        enabled: server.enabled,
        notes: server.notes,
      })
      .onConflictDoUpdate({
        target: mcpServers.serverKey,
        set: {
          name: server.name,
          baseUrl: server.baseUrl,
          transport: server.transport,
          permissions: server.permissions,
          credentialEnvVar: server.credentialEnvVar,
          costProfile: server.costProfile,
          enabled: server.enabled,
          notes: server.notes,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  },

  async setEnabled(serverKey, enabled) {
    const db = await requireDb();
    const [row] = await db
      .update(mcpServers)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(mcpServers.serverKey, serverKey))
      .returning();
    return row ?? null;
  },

  async remove(serverKey) {
    const db = await requireDb();
    const rows = await db
      .delete(mcpServers)
      .where(eq(mcpServers.serverKey, serverKey))
      .returning({ id: mcpServers.id });
    return rows.length > 0;
  },

  async recordProbe(serverKey, patch) {
    const db = await requireDb();
    const [row] = await db
      .update(mcpServers)
      .set({
        healthStatus: patch.healthStatus,
        healthScore: patch.healthScore,
        lastCheckedAt: patch.lastCheckedAt,
        consecutiveFailures: patch.consecutiveFailures,
        ...(patch.lastOkAt !== undefined ? { lastOkAt: patch.lastOkAt } : {}),
        ...(patch.lastErrorAt !== undefined ? { lastErrorAt: patch.lastErrorAt } : {}),
        ...(patch.lastError !== undefined ? { lastError: patch.lastError } : {}),
        ...(patch.serverName !== undefined ? { serverName: patch.serverName } : {}),
        ...(patch.serverVersion !== undefined ? { serverVersion: patch.serverVersion } : {}),
        ...(patch.tools !== undefined ? { tools: patch.tools } : {}),
        ...(patch.toolsDiscoveredAt !== undefined ? { toolsDiscoveredAt: patch.toolsDiscoveredAt } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(mcpServers.serverKey, serverKey)))
      .returning();
    return row ?? null;
  },
};
