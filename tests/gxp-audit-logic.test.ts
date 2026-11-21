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

  it("reports zero checked events when the first event is broken", () => {
    const broken = makeEvent(1, "f".repeat(64));
    expect(verifyGxpAuditEvents([broken])).toMatchObject({
      valid: false, checkedEvents: 0, brokenAtId: 1,
    });
  });

  it("counts only preceding verified events when a later event is broken", () => {
    const first = makeEvent(1, GXP_AUDIT_GENESIS_HASH);
    const broken = makeEvent(2, "f".repeat(64));
    expect(verifyGxpAuditEvents([first, broken])).toMatchObject({
      valid: false, checkedEvents: 1, brokenAtId: 2, latestHash: first.eventHash,
    });
  });

  it("accepts an empty ledger with zero checked events", () => {
    expect(verifyGxpAuditEvents([])).toMatchObject({
      valid: true, checkedEvents: 0, brokenAtId: null, latestHash: GXP_AUDIT_GENESIS_HASH,
    });
  });
});
