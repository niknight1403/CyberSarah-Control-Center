import { createHash } from "node:crypto";
import { desc, sql } from "drizzle-orm";
import { gxpAuditEvents } from "../drizzle/schema";
import { getDb } from "./db";

import { GXP_AUDIT_GENESIS_HASH, hashGxpAuditEvent, verifyGxpAuditEvents } from "../lib/gxp-audit-logic";

type AuditInput = {
  actorUserId: number;
  framework: string;
  activity: string;
  assessmentStatus: string;
  missingControls: string[];
  eventPayload: Record<string, unknown>;
};

export async function appendGxpAuditEvent(input: AuditInput): Promise<{ id: number; eventHash: string }> {
  const db = await getDb();
  if (!db) throw new Error("GxP audit ledger requires an available database.");

  return db.transaction(async (tx) => {
    // Serialize writers so each event links to exactly the preceding committed event.
    await tx.execute(sql.raw("SELECT pg_advisory_xact_lock(721904321::bigint)"));
    const [previous] = await tx
      .select({ eventHash: gxpAuditEvents.eventHash })
      .from(gxpAuditEvents)
      .orderBy(desc(gxpAuditEvents.id))
      .limit(1);
    const previousHash = previous?.eventHash ?? GXP_AUDIT_GENESIS_HASH;
    const createdAt = new Date();
    const eventPayload = input.eventPayload;
    const eventHash = hashGxpAuditEvent({ ...input, previousHash, createdAt });
    const [inserted] = await tx
      .insert(gxpAuditEvents)
      .values({
        actorUserId: input.actorUserId,
        framework: input.framework,
        activity: input.activity,
        assessmentStatus: input.assessmentStatus,
        missingControls: input.missingControls,
        eventPayload,
        previousHash,
        eventHash,
        createdAt,
      })
      .returning({ id: gxpAuditEvents.id, eventHash: gxpAuditEvents.eventHash });
    if (!inserted) throw new Error("GxP audit event insert returned no row.");
    return inserted;
  });
}

export async function verifyGxpAuditChain() {
  const db = await getDb();
  if (!db) throw new Error("GxP audit ledger requires an available database.");
  const rows = await db.select().from(gxpAuditEvents).orderBy(gxpAuditEvents.id);
  return verifyGxpAuditEvents(rows);
}
