/**
 * Sprint 5 — Persistenz des Circuit-Breaker-Zustands.
 *
 * Duenne Drizzle-Schicht ueber `mcp_circuits`. Die Entscheidungen selbst
 * liegen rein in lib/mcp-supervisor-logic.ts; hier wird nur der Zustand
 * geladen und geschrieben. Fehlt eine Zeile, gilt "closed".
 */
import { and, eq, isNull } from "drizzle-orm";

import { mcpCircuits, type McpCircuitRow } from "../drizzle/schema";
import { getDb } from "./db";

export type CircuitStore = {
  find(serverKey: string, toolName: string | null): Promise<McpCircuitRow | null>;
  list(): Promise<McpCircuitRow[]>;
  upsert(row: {
    serverKey: string;
    toolName: string | null;
    state: string;
    consecutiveFailures: number;
    openUntil: Date | null;
    openedAt: Date | null;
    halfOpenAttempts: number;
    lastFailureKind: string | null;
    lastError: string | null;
    updatedAt: Date;
  }): Promise<McpCircuitRow>;
  reset(serverKey: string, toolName: string | null): Promise<void>;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Circuit-Zustand nicht lesbar.");
  return db;
}

export const drizzleCircuitStore: CircuitStore = {
  async find(serverKey, toolName) {
    const db = await requireDb();
    const [row] = await db
      .select()
      .from(mcpCircuits)
      .where(
        and(
          eq(mcpCircuits.serverKey, serverKey),
          toolName === null ? isNull(mcpCircuits.toolName) : eq(mcpCircuits.toolName, toolName),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async list() {
    const db = await requireDb();
    return db.select().from(mcpCircuits);
  },

  async upsert(row) {
    const db = await requireDb();
    // NULL ist in einem Unique-Index nicht eindeutig; deshalb erst suchen,
    // dann gezielt aktualisieren oder einfuegen.
    const existing = await this.find(row.serverKey, row.toolName);
    if (existing) {
      const [updated] = await db
        .update(mcpCircuits)
        .set({
          state: row.state,
          consecutiveFailures: row.consecutiveFailures,
          openUntil: row.openUntil,
          openedAt: row.openedAt,
          halfOpenAttempts: row.halfOpenAttempts,
          lastFailureKind: row.lastFailureKind,
          lastError: row.lastError,
          updatedAt: row.updatedAt,
        })
        .where(eq(mcpCircuits.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await db
      .insert(mcpCircuits)
      .values({
        serverKey: row.serverKey,
        toolName: row.toolName,
        state: row.state,
        consecutiveFailures: row.consecutiveFailures,
        openUntil: row.openUntil,
        openedAt: row.openedAt,
        halfOpenAttempts: row.halfOpenAttempts,
        lastFailureKind: row.lastFailureKind,
        lastError: row.lastError,
        updatedAt: row.updatedAt,
      })
      .returning();
    return inserted;
  },

  async reset(serverKey, toolName) {
    const db = await requireDb();
    await db
      .delete(mcpCircuits)
      .where(
        and(
          eq(mcpCircuits.serverKey, serverKey),
          toolName === null ? isNull(mcpCircuits.toolName) : eq(mcpCircuits.toolName, toolName),
        ),
      );
  },
};
