import { and, asc, desc, gt, lte, sql } from "drizzle-orm";
import { gxpAuditEvents } from "../drizzle/schema";
import { getDb } from "./db";

/**
 * Deterministic database seam for Vitest. The suite runs with isolate:false,
 * so module-level vi.mock("./db") can leak into neighbouring test files.
 */
let gxpAuditGetDb: typeof getDb = getDb;

export function setGxpAuditDbForTests(override: typeof getDb | null): void {
  if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    throw new Error("GxP-Audit-Test-Hook ist nur im Test-Modus verfuegbar.");
  }
  gxpAuditGetDb = override ?? getDb;
}

function auditDb(): ReturnType<typeof getDb> {
  return gxpAuditGetDb();
}

import {
  GXP_AUDIT_GENESIS_HASH,
  hashGxpAuditEvent,
  verifyGxpAuditEventsChunk,
} from "../lib/gxp-audit-logic";

type AuditInput = {
  actorUserId: number;
  framework: string;
  activity: string;
  assessmentStatus: string;
  missingControls: string[];
  eventPayload: Record<string, unknown>;
};

/** Bound memory use during integrity checks; the chain hash is carried between pages. */
export const GXP_AUDIT_VERIFY_BATCH_SIZE = 500;

export async function appendGxpAuditEvent(input: AuditInput): Promise<{ id: number; eventHash: string }> {
  const db = await auditDb();
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
  const db = await auditDb();
  if (!db) throw new Error("GxP audit ledger requires an available database.");

  // Fix the verification boundary first. Appends committed after this read are
  // intentionally verified on the next run, not mixed into this snapshot.
  const [head] = await db
    .select({ id: gxpAuditEvents.id })
    .from(gxpAuditEvents)
    .orderBy(desc(gxpAuditEvents.id))
    .limit(1);
  if (!head) {
    return {
      valid: true,
      checkedEvents: 0,
      brokenAtId: null,
      latestHash: GXP_AUDIT_GENESIS_HASH,
    };
  }

  let lastId = 0;
  let result = verifyGxpAuditEventsChunk([]);
  while (lastId < head.id) {
    const rows = await db
      .select()
      .from(gxpAuditEvents)
      .where(and(gt(gxpAuditEvents.id, lastId), lte(gxpAuditEvents.id, head.id)))
      .orderBy(asc(gxpAuditEvents.id))
      .limit(GXP_AUDIT_VERIFY_BATCH_SIZE);

    if (rows.length === 0) break;
    result = verifyGxpAuditEventsChunk(rows, result.latestHash, result.checkedEvents);
    if (!result.valid) return result;
    lastId = rows[rows.length - 1]!.id;
  }

  // A missing row inside the captured ID range indicates an incomplete read;
  // fail closed instead of reporting a partial ledger as valid.
  if (lastId !== head.id) {
    return {
      valid: false,
      checkedEvents: result.checkedEvents,
      brokenAtId: null,
      latestHash: result.latestHash,
    };
  }
  return result;
}
