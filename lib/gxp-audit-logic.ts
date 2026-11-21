import { createHash } from "node:crypto";

export const GXP_AUDIT_GENESIS_HASH = "0".repeat(64);

export interface GxpAuditHashInput {
  actorUserId: number;
  framework: string;
  activity: string;
  assessmentStatus: string;
  missingControls: string[];
  eventPayload: Record<string, unknown>;
  previousHash: string;
  createdAt: Date;
}

export interface GxpAuditChainRow extends GxpAuditHashInput {
  id: number;
  eventHash: string;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export function hashGxpAuditEvent(event: GxpAuditHashInput): string {
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

export interface GxpAuditVerificationResult {
  valid: boolean;
  checkedEvents: number;
  brokenAtId: number | null;
  latestHash: string;
}

/** Verifies one ordered page while carrying the verified chain state across pages. */
export function verifyGxpAuditEventsChunk(
  rows: GxpAuditChainRow[],
  initialPreviousHash = GXP_AUDIT_GENESIS_HASH,
  initialCheckedEvents = 0,
): GxpAuditVerificationResult {
  let expectedPreviousHash = initialPreviousHash;
  let checkedEvents = initialCheckedEvents;
  for (const row of rows) {
    if (row.previousHash !== expectedPreviousHash) {
      return { valid: false, checkedEvents, brokenAtId: row.id, latestHash: expectedPreviousHash };
    }
    if (hashGxpAuditEvent(row) !== row.eventHash) {
      return { valid: false, checkedEvents, brokenAtId: row.id, latestHash: expectedPreviousHash };
    }
    expectedPreviousHash = row.eventHash;
    checkedEvents += 1;
  }
  return { valid: true, checkedEvents, brokenAtId: null, latestHash: expectedPreviousHash };
}

/** Convenience wrapper for callers that already hold the complete ordered chain. */
export function verifyGxpAuditEvents(rows: GxpAuditChainRow[]): GxpAuditVerificationResult {
  return verifyGxpAuditEventsChunk(rows);
}
