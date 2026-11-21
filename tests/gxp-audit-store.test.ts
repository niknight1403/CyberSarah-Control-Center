import { beforeEach, describe, expect, it, vi } from "vitest";
import { GXP_AUDIT_GENESIS_HASH, hashGxpAuditEvent } from "../lib/gxp-audit-logic";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  selectLimit: vi.fn(),
  execute: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../server/db", () => ({ getDb: mocks.getDb }));

import {
  appendGxpAuditEvent,
  GXP_AUDIT_VERIFY_BATCH_SIZE,
  verifyGxpAuditChain,
} from "../server/gxp-audit-store";

function queryChain() {
  const chain: Record<string, any> = {};
  for (const method of ["from", "orderBy", "where"]) chain[method] = vi.fn(() => chain);
  chain.limit = mocks.selectLimit;
  return chain;
}

describe("GxP audit persistence boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockResolvedValue(null);
  });

  it("fails closed when the database is unavailable", async () => {
    await expect(appendGxpAuditEvent({
      actorUserId: 7,
      framework: "GMP",
      activity: "quality_event",
      assessmentStatus: "blocked",
      missingControls: [],
      eventPayload: { automationMode: "assessment_only" },
    })).rejects.toThrow(/available database/);
    await expect(verifyGxpAuditChain()).rejects.toThrow(/available database/);
  });

  it("serializes append in a transaction and links to the preceding event", async () => {
    const previous = { eventHash: "b".repeat(64) };
    const inserted = { id: 9, eventHash: "c".repeat(64) };
    const txSelect = queryChain();
    txSelect.limit = vi.fn().mockResolvedValue([previous]);
    const tx = {
      execute: mocks.execute,
      select: vi.fn(() => txSelect),
      insert: vi.fn(() => ({
        values: mocks.insertValues,
      })),
    };
    mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning });
    mocks.insertReturning.mockResolvedValue([inserted]);
    mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));
    mocks.getDb.mockResolvedValue({ transaction: mocks.transaction });

    const input = {
      actorUserId: 7,
      framework: "GMP",
      activity: "quality_event",
      assessmentStatus: "blocked",
      missingControls: ["controlled_sop_reference"],
      eventPayload: { automationMode: "assessment_only" },
    };
    await expect(appendGxpAuditEvent(input)).resolves.toEqual(inserted);
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      ...input,
      previousHash: previous.eventHash,
      eventHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      createdAt: expect.any(Date),
    }));
  });

  it("rejects an insert that returns no persisted row", async () => {
    const txSelect = queryChain();
    txSelect.limit = vi.fn().mockResolvedValue([]);
    const tx = {
      execute: vi.fn(),
      select: vi.fn(() => txSelect),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })),
    };
    mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));
    mocks.getDb.mockResolvedValue({ transaction: mocks.transaction });

    await expect(appendGxpAuditEvent({
      actorUserId: 7,
      framework: "GDP",
      activity: "deviation",
      assessmentStatus: "blocked",
      missingControls: [],
      eventPayload: {},
    })).rejects.toThrow(/returned no row/);
  });

  it("accepts an empty ledger without reading pages", async () => {
    const chain = queryChain();
    chain.limit = vi.fn().mockResolvedValue([]);
    const db = { select: vi.fn(() => chain) };
    mocks.getDb.mockResolvedValue(db);

    await expect(verifyGxpAuditChain()).resolves.toEqual({
      valid: true,
      checkedEvents: 0,
      brokenAtId: null,
      latestHash: GXP_AUDIT_GENESIS_HASH,
    });
    expect(db.select).toHaveBeenCalledOnce();
  });

  it("fails closed when a page omits an ID before the captured head", async () => {
    const headQuery = queryChain();
    headQuery.limit = vi.fn().mockResolvedValue([{ id: 2 }]);
    const pageQuery = queryChain();
    const validFirst = {
      id: 1,
      actorUserId: 7,
      framework: "GMP",
      activity: "quality_event",
      assessmentStatus: "blocked",
      missingControls: [],
      eventPayload: { automationMode: "assessment_only" },
      previousHash: GXP_AUDIT_GENESIS_HASH,
      createdAt: new Date("2026-11-21T00:00:00.000Z"),
      eventHash: "",
    };
    validFirst.eventHash = hashGxpAuditEvent(validFirst);
    pageQuery.limit = vi.fn().mockResolvedValueOnce([validFirst]).mockResolvedValueOnce([]);
    const db = { select: vi.fn().mockReturnValueOnce(headQuery).mockReturnValue(pageQuery) };
    mocks.getDb.mockResolvedValue(db);

    await expect(verifyGxpAuditChain()).resolves.toMatchObject({
      valid: false,
      checkedEvents: 1,
      brokenAtId: null,
      latestHash: validFirst.eventHash,
    });
    expect(GXP_AUDIT_VERIFY_BATCH_SIZE).toBe(500);
  });
});
