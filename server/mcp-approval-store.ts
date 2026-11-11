/**
 * Sprint 10 — Persistenz der Freigabe-Anfragen.
 */
import { and, desc, eq, inArray } from "drizzle-orm";

import { mcpApprovalRequests } from "../drizzle/schema";
import type { ApprovalRequest, ApprovalStatus, ApprovalVote } from "../lib/mcp-approval-workflow-logic";
import type { RiskLevel } from "../lib/mcp-governance-logic";
import { getDb } from "./db";

export type StoredApproval = ApprovalRequest & {
  id: number;
  createdAt: Date;
};

export type McpApprovalStore = {
  list(limit?: number, status?: string): Promise<StoredApproval[]>;
  get(id: number): Promise<StoredApproval | null>;
  listByRun(runId: number): Promise<StoredApproval[]>;
  listOpen(): Promise<StoredApproval[]>;
  insert(request: ApprovalRequest): Promise<StoredApproval>;
  save(id: number, request: ApprovalRequest): Promise<StoredApproval | null>;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Freigaben nicht lesbar.");
  return db;
}

function toStored(row: typeof mcpApprovalRequests.$inferSelect): StoredApproval {
  return {
    id: row.id,
    runId: row.runId,
    taskId: row.taskId,
    agentKey: row.agentKey,
    serverKey: row.serverKey,
    toolName: row.toolName,
    riskLevel: row.riskLevel as RiskLevel,
    reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
    argsHash: row.argsHash,
    requiredApprovals: row.requiredApprovals,
    requestedBy: row.requestedBy,
    requestedAtMs: row.requestedAt.getTime(),
    expiresAtMs: row.expiresAt.getTime(),
    status: row.status as ApprovalStatus,
    votes: Array.isArray(row.votes) ? (row.votes as ApprovalVote[]) : [],
    decidedAtMs: row.decidedAt ? row.decidedAt.getTime() : null,
    note: row.note,
    createdAt: row.requestedAt,
  };
}

function values(request: ApprovalRequest) {
  return {
    runId: request.runId,
    taskId: request.taskId,
    agentKey: request.agentKey,
    serverKey: request.serverKey,
    toolName: request.toolName,
    riskLevel: request.riskLevel,
    reasons: request.reasons,
    argsHash: request.argsHash,
    requiredApprovals: request.requiredApprovals,
    status: request.status,
    requestedBy: request.requestedBy,
    requestedAt: new Date(request.requestedAtMs),
    expiresAt: new Date(request.expiresAtMs),
    decidedAt: request.decidedAtMs === null ? null : new Date(request.decidedAtMs),
    votes: request.votes,
    note: request.note,
    updatedAt: new Date(),
  };
}

export const drizzleApprovalStore: McpApprovalStore = {
  async list(limit = 50, status) {
    const db = await requireDb();
    const rows = status
      ? await db.select().from(mcpApprovalRequests).where(eq(mcpApprovalRequests.status, status)).orderBy(desc(mcpApprovalRequests.requestedAt)).limit(Math.min(limit, 200))
      : await db.select().from(mcpApprovalRequests).orderBy(desc(mcpApprovalRequests.requestedAt)).limit(Math.min(limit, 200));
    return rows.map(toStored);
  },

  async get(id) {
    const db = await requireDb();
    const [row] = await db.select().from(mcpApprovalRequests).where(eq(mcpApprovalRequests.id, id)).limit(1);
    return row ? toStored(row) : null;
  },

  async listByRun(runId) {
    const db = await requireDb();
    const rows = await db.select().from(mcpApprovalRequests).where(eq(mcpApprovalRequests.runId, runId)).orderBy(desc(mcpApprovalRequests.requestedAt));
    return rows.map(toStored);
  },

  async listOpen() {
    const db = await requireDb();
    const rows = await db
      .select()
      .from(mcpApprovalRequests)
      .where(and(inArray(mcpApprovalRequests.status, ["pending", "approved"])));
    return rows.map(toStored);
  },

  async insert(request) {
    const db = await requireDb();
    const [row] = await db.insert(mcpApprovalRequests).values(values(request)).returning();
    return toStored(row);
  },

  async save(id, request) {
    const db = await requireDb();
    const [row] = await db.update(mcpApprovalRequests).set(values(request)).where(eq(mcpApprovalRequests.id, id)).returning();
    return row ? toStored(row) : null;
  },
};
