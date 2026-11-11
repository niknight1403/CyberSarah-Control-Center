/**
 * Sprint 3 — Persistenz des Governance-Gateways.
 *
 * Duenne Drizzle-Schicht ueber `mcp_tool_governance` und `mcp_approvals`.
 * Keine Fachlogik: Faehigkeiten, Risiko und Policy-Entscheidung liegen rein in
 * lib/mcp-governance-logic.ts. Ohne Datenbank wird ehrlich geworfen — eine
 * stille Freigabe ohne Audit-Spur waere schlimmer als ein Fehler.
 */
import { and, desc, eq } from "drizzle-orm";

import {
  mcpApprovals,
  mcpToolGovernance,
  type InsertMcpApprovalRow,
  type InsertMcpToolGovernanceRow,
  type McpApprovalRow,
  type McpToolGovernanceRow,
} from "../drizzle/schema";
import { getDb } from "./db";

export type ToolGovernanceStore = {
  listByServer(serverKey: string): Promise<McpToolGovernanceRow[]>;
  listAll(limit?: number): Promise<McpToolGovernanceRow[]>;
  findByTool(serverKey: string, toolName: string): Promise<McpToolGovernanceRow | null>;
  upsert(row: InsertMcpToolGovernanceRow): Promise<McpToolGovernanceRow>;
  markReviewed(serverKey: string, toolName: string, reviewedBy: string, reviewedAt: Date): Promise<McpToolGovernanceRow | null>;
  deleteForServer(serverKey: string, keepToolNames: string[]): Promise<number>;
};

export type ApprovalStore = {
  list(status?: string, limit?: number): Promise<McpApprovalRow[]>;
  findById(id: number): Promise<McpApprovalRow | null>;
  findUsable(serverKey: string, toolName: string, nowMs: number): Promise<McpApprovalRow | null>;
  findPending(serverKey: string, toolName: string): Promise<McpApprovalRow | null>;
  insert(row: InsertMcpApprovalRow): Promise<McpApprovalRow>;
  decide(
    id: number,
    patch: { status: string; decidedBy: string; decidedAt: Date },
  ): Promise<McpApprovalRow | null>;
  expireStale(now: Date): Promise<number>;
};

async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new Error("Datenbank nicht verfuegbar — MCP-Governance nicht lesbar.");
  }
  return db;
}

export const drizzleToolGovernanceStore: ToolGovernanceStore = {
  async listByServer(serverKey) {
    const db = await requireDb();
    return db
      .select()
      .from(mcpToolGovernance)
      .where(eq(mcpToolGovernance.serverKey, serverKey))
      .orderBy(desc(mcpToolGovernance.riskLevel), mcpToolGovernance.toolName);
  },

  async listAll(limit = 500) {
    const db = await requireDb();
    return db.select().from(mcpToolGovernance).orderBy(mcpToolGovernance.serverKey, mcpToolGovernance.toolName).limit(limit);
  },

  async findByTool(serverKey, toolName) {
    const db = await requireDb();
    const [row] = await db
      .select()
      .from(mcpToolGovernance)
      .where(and(eq(mcpToolGovernance.serverKey, serverKey), eq(mcpToolGovernance.toolName, toolName)))
      .limit(1);
    return row ?? null;
  },

  async upsert(row) {
    const db = await requireDb();
    const [saved] = await db
      .insert(mcpToolGovernance)
      .values(row)
      .onConflictDoUpdate({
        target: [mcpToolGovernance.serverKey, mcpToolGovernance.toolName],
        set: {
          capabilities: row.capabilities,
          primaryCapability: row.primaryCapability,
          riskLevel: row.riskLevel,
          decision: row.decision,
          reasons: row.reasons,
          signature: row.signature,
          updatedAt: new Date(),
        },
      })
      .returning();
    return saved;
  },

  async markReviewed(serverKey, toolName, reviewedBy, reviewedAt) {
    const db = await requireDb();
    const [saved] = await db
      .update(mcpToolGovernance)
      .set({ reviewedBy, reviewedAt, updatedAt: new Date() })
      .where(and(eq(mcpToolGovernance.serverKey, serverKey), eq(mcpToolGovernance.toolName, toolName)))
      .returning();
    return saved ?? null;
  },

  async deleteForServer(serverKey, keepToolNames) {
    const db = await requireDb();
    const existing = await db.select().from(mcpToolGovernance).where(eq(mcpToolGovernance.serverKey, serverKey));
    const stale = existing.filter((row) => !keepToolNames.includes(row.toolName));
    for (const row of stale) {
      await db.delete(mcpToolGovernance).where(eq(mcpToolGovernance.id, row.id));
    }
    return stale.length;
  },
};

export const drizzleApprovalStore: ApprovalStore = {
  async list(status, limit = 100) {
    const db = await requireDb();
    const query = db.select().from(mcpApprovals);
    const rows = status
      ? await query.where(eq(mcpApprovals.status, status)).orderBy(desc(mcpApprovals.createdAt)).limit(limit)
      : await query.orderBy(desc(mcpApprovals.createdAt)).limit(limit);
    return rows;
  },

  async findById(id) {
    const db = await requireDb();
    const [row] = await db.select().from(mcpApprovals).where(eq(mcpApprovals.id, id)).limit(1);
    return row ?? null;
  },

  async findUsable(serverKey, toolName, nowMs) {
    const db = await requireDb();
    const [row] = await db
      .select()
      .from(mcpApprovals)
      .where(
        and(
          eq(mcpApprovals.serverKey, serverKey),
          eq(mcpApprovals.toolName, toolName),
          eq(mcpApprovals.status, "approved"),
        ),
      )
      .orderBy(desc(mcpApprovals.decidedAt))
      .limit(1);
    if (!row) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= nowMs) return null;
    return row;
  },

  async findPending(serverKey, toolName) {
    const db = await requireDb();
    const [row] = await db
      .select()
      .from(mcpApprovals)
      .where(
        and(
          eq(mcpApprovals.serverKey, serverKey),
          eq(mcpApprovals.toolName, toolName),
          eq(mcpApprovals.status, "pending"),
        ),
      )
      .orderBy(desc(mcpApprovals.createdAt))
      .limit(1);
    return row ?? null;
  },

  async insert(row) {
    const db = await requireDb();
    const [saved] = await db.insert(mcpApprovals).values(row).returning();
    return saved;
  },

  async decide(id, patch) {
    const db = await requireDb();
    const [saved] = await db
      .update(mcpApprovals)
      .set({ status: patch.status, decidedBy: patch.decidedBy, decidedAt: patch.decidedAt, updatedAt: new Date() })
      .where(eq(mcpApprovals.id, id))
      .returning();
    return saved ?? null;
  },

  async expireStale(now) {
    const db = await requireDb();
    const rows = await db.select().from(mcpApprovals).where(eq(mcpApprovals.status, "pending"));
    let expired = 0;
    for (const row of rows) {
      if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
        await db
          .update(mcpApprovals)
          .set({ status: "expired", updatedAt: now })
          .where(eq(mcpApprovals.id, row.id));
        expired += 1;
      }
    }
    return expired;
  },
};
