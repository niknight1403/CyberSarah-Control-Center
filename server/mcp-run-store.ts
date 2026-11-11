/**
 * Sprint 8 — Persistenz der Laeufe. Der komplette Zustand liegt als JSON,
 * damit ein Lauf nach einem Neustart nachvollziehbar bleibt.
 */
import { desc, eq } from "drizzle-orm";

import { mcpTeamRuns } from "../drizzle/schema";
import type { RunState } from "../lib/mcp-run-engine-logic";
import { getDb } from "./db";

export type StoredRun = {
  id: number;
  planId: number;
  status: string;
  state: RunState;
  spentCents: number;
  stepsUsed: number;
  abortReason: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type McpRunStore = {
  list(limit?: number): Promise<StoredRun[]>;
  get(id: number): Promise<StoredRun | null>;
  create(input: { planId: number; state: RunState; actor: string | null }): Promise<StoredRun>;
  save(id: number, state: RunState): Promise<StoredRun | null>;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Laeufe nicht lesbar.");
  return db;
}

function toStored(row: typeof mcpTeamRuns.$inferSelect): StoredRun {
  return { ...row, state: row.state as RunState };
}

export const drizzleRunStore: McpRunStore = {
  async list(limit = 20) {
    const db = await requireDb();
    const rows = await db.select().from(mcpTeamRuns).orderBy(desc(mcpTeamRuns.createdAt)).limit(Math.min(limit, 100));
    return rows.map(toStored);
  },

  async get(id) {
    const db = await requireDb();
    const [row] = await db.select().from(mcpTeamRuns).where(eq(mcpTeamRuns.id, id)).limit(1);
    return row ? toStored(row) : null;
  },

  async create(input) {
    const db = await requireDb();
    const [row] = await db
      .insert(mcpTeamRuns)
      .values({
        planId: input.planId,
        status: input.state.status,
        state: input.state,
        spentCents: input.state.spentCents,
        stepsUsed: input.state.stepsUsed,
        abortReason: input.state.abortReason,
        startedAt: new Date(input.state.startedAtMs),
        createdBy: input.actor,
      })
      .returning();
    return toStored(row);
  },

  async save(id, state) {
    const db = await requireDb();
    const [row] = await db
      .update(mcpTeamRuns)
      .set({
        status: state.status,
        state,
        spentCents: state.spentCents,
        stepsUsed: state.stepsUsed,
        abortReason: state.abortReason,
        finishedAt: state.finishedAtMs === null ? null : new Date(state.finishedAtMs),
        updatedAt: new Date(),
      })
      .where(eq(mcpTeamRuns.id, id))
      .returning();
    return row ? toStored(row) : null;
  },
};
