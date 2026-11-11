/**
 * Sprint 9 — Persistenz des Ausfuehrungs-Audits. Eintraege sind unveraenderlich;
 * es gibt kein Update und kein Delete.
 */
import { desc, eq } from "drizzle-orm";

import { mcpExecutionAudit } from "../drizzle/schema";
import type { AuditDecision, AuditEntry } from "../lib/mcp-execution-bridge-logic";
import type { RiskLevel } from "../lib/mcp-governance-logic";
import { getDb } from "./db";

export type StoredAuditEntry = {
  id: number;
  runId: number | null;
  taskId: string;
  agentKey: string;
  serverKey: string;
  toolName: string;
  decision: string;
  riskLevel: string;
  argKeys: Record<string, string>;
  argsHash: string;
  costCents: number;
  durationMs: number;
  note: string;
  attempt: number;
  createdAt: Date;
};

export type McpAuditStore = {
  list(limit?: number, runId?: number): Promise<StoredAuditEntry[]>;
  insert(entry: AuditEntry): Promise<StoredAuditEntry>;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Audit nicht lesbar.");
  return db;
}

export const drizzleAuditStore: McpAuditStore = {
  async list(limit = 50, runId) {
    const db = await requireDb();
    const rows = runId
      ? await db.select().from(mcpExecutionAudit).where(eq(mcpExecutionAudit.runId, runId)).orderBy(desc(mcpExecutionAudit.createdAt)).limit(Math.min(limit, 200))
      : await db.select().from(mcpExecutionAudit).orderBy(desc(mcpExecutionAudit.createdAt)).limit(Math.min(limit, 200));
    return rows.map((row) => ({ ...row, argKeys: (row.argKeys ?? {}) as Record<string, string> }));
  },

  async insert(entry) {
    const db = await requireDb();
    const [row] = await db
      .insert(mcpExecutionAudit)
      .values({
        runId: entry.runId,
        taskId: entry.taskId,
        agentKey: entry.agentKey,
        serverKey: entry.serverKey,
        toolName: entry.toolName,
        decision: entry.decision satisfies AuditDecision,
        riskLevel: entry.riskLevel satisfies RiskLevel,
        argKeys: entry.argKeys,
        argsHash: entry.argsHash,
        costCents: entry.costCents,
        durationMs: entry.durationMs,
        note: entry.note,
        attempt: entry.attempt,
        createdAt: new Date(entry.createdAtMs),
      })
      .returning();
    return { ...row, argKeys: (row.argKeys ?? {}) as Record<string, string> };
  },
};
