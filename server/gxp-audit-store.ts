import { createHash } from "node:crypto";
import { desc, sql } from "drizzle-orm";
import { gxpAuditEvents } from "../drizzle/schema";
import { getDb } from "./db";

const GENESIS_HASH = "0".repeat(64);

type AuditInput = {
  actorUserId: number;
  framework: string;
  activity: string;
  assessmentStatus: string;
  missingControls: string[];
  eventPayload: Record<string, unknown>;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function hashEvent(event: {
  actorUserId: number;
  framework: string;
  activity: string;
  assessmentStatus: string;
  missingControls: string[];
  eventPayload: Record<string, unknown>;
  previousHash: string;
  createdAt: Date;
}): string {
  return createHash("sha256").update(stableStringify({
    actorUserId: event.actorUserId,
    framework: event.framework,
    activity: event.activity,
    assessmentStatus: event.assessmentStatus,
    missingControls: event.missingControls,
    eventPayload: event.eventPayload,
    previousHash: event.previousHash,
    createdAt: event.createdAt.toISOString(),
  })).digest("hex");
}

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
    const previousHash = previous?.eventHash ?? GENESIS_HASH;
    const createdAt = new Date();
    const eventPayload = input.eventPayload;
    const eventHash = hashEvent({ ...input, previousHash, createdAt });
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

export async function verifyGxpAuditChain(): Promise<{
  valid: boolean;
  checkedEvents: number;
  brokenAtId: number | null;
  latestHash: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("GxP audit ledger requires an available database.");
  const rows = await db
    .select()
    .from(gxpAuditEvents)
    .orderBy(gxpAuditEvents.id);
  let expectedPreviousHash = GENESIS_HASH;
  for (const row of rows) {
    if (row.previousHash !== expectedPreviousHash) {
      return { valid: false, checkedEvents: rows.length, brokenAtId: row.id, latestHash: expectedPreviousHash };
    }
    const calculated = hashEvent({
      actorUserId: row.actorUserId,
      framework: row.framework,
      activity: row.activity,
      assessmentStatus: row.assessmentStatus,
      missingControls: row.missingControls,
      eventPayload: row.eventPayload,
      previousHash: row.previousHash,
      createdAt: row.createdAt,
    });
    if (calculated !== row.eventHash) {
      return { valid: false, checkedEvents: rows.length, brokenAtId: row.id, latestHash: expectedPreviousHash };
    }
    expectedPreviousHash = row.eventHash;
  }
  return { valid: true, checkedEvents: rows.length, brokenAtId: null, latestHash: expectedPreviousHash };
}
