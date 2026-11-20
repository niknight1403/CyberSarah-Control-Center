import { describe, expect, it } from "vitest";
import {
  GXP_AUDIT_GENESIS_HASH,
  hashGxpAuditEvent,
  verifyGxpAuditEvents,
  type GxpAuditChainRow,
} from "@/lib/gxp-audit-logic";

function makeEvent(id: number, previousHash: string, overrides: Partial<GxpAuditChainRow> = {}): GxpAuditChainRow {
  const base = {
    id,
    actorUserId: 7,
    framework: "GMP",
    activity: "quality_event",
    assessmentStatus: "blocked",
    missingControls: ["controlled_sop_reference"],
    eventPayload: { automationMode: "assessment_only", nested: { b: 2, a: 1 } },
    previousHash,
    createdAt: new Date("2026-11-21T00:00:00.000Z"),
    eventHash: "",
    ...overrides,
  };
  return { ...base, eventHash: base.eventHash || hashGxpAuditEvent(base) };
}

describe("GxP audit hash chain", () => {
  it("accepts a valid genesis-linked chain", () => {
    const first = makeEvent(1, GXP_AUDIT_GENESIS_HASH);
    const second = makeEvent(2, first.eventHash, { activity: "deviation" });
    expect(verifyGxpAuditEvents([first, second])).toMatchObject({
      valid: true, checkedEvents: 2, brokenAtId: null, latestHash: second.eventHash,
    });
  });

  it("detects payload tampering", () => {
    const first = makeEvent(1, GXP_AUDIT_GENESIS_HASH);
    const tampered = { ...first, eventPayload: { automationMode: "execute" } };
    expect(verifyGxpAuditEvents([tampered])).toMatchObject({ valid: false, brokenAtId: 1 });
  });

  it("detects a broken link and reordering", () => {
    const first = makeEvent(1, GXP_AUDIT_GENESIS_HASH);
    const second = makeEvent(2, first.eventHash);
    expect(verifyGxpAuditEvents([second, first])).toMatchObject({ valid: false, brokenAtId: 2 });
  });

  it("canonicalizes object key order before hashing", () => {
    const first = makeEvent(1, GXP_AUDIT_GENESIS_HASH);
    const reordered = { ...first, eventPayload: { nested: { a: 1, b: 2 }, automationMode: "assessment_only" } };
    expect(hashGxpAuditEvent(reordered)).toBe(first.eventHash);
  });
});
