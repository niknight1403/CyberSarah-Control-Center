import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GXP_AUDIT_GENESIS_HASH,
  hashGxpAuditEvent,
  type GxpAuditChainRow,
} from "../lib/gxp-audit-logic";
import {
  appendGxpAuditEvent,
  GXP_AUDIT_VERIFY_BATCH_SIZE,
  setGxpAuditDbForTests,
  verifyGxpAuditChain,
} from "../server/gxp-audit-store";

type QueryResult = unknown[];

function makeRow(id: number, previousHash: string): GxpAuditChainRow {
  const event = {
    id,
    actorUserId: 7,
    framework: "GMP",
    activity: "quality_event",
    assessmentStatus: "blocked",
    missingControls: ["human_quality_review"],
    eventPayload: { automationMode: "assessment_only" },
    previousHash,
    createdAt: new Date(Date.UTC(2026, 10, 21, 0, 0, id)),
    eventHash: "",
  };
  return { ...event, eventHash: hashGxpAuditEvent(event) };
}

function queryBuilder(result: QueryResult) {
  const builder = {
    from: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: vi.fn(async (_limit?: number) => result),
  };
  return builder;
}

afterAll(() => setGxpAuditDbForTests(null));
beforeEach(() => setGxpAuditDbForTests(null));

describe("GxP audit database store", () => {
  it("fails closed when the database is unavailable", async () => {
    setGxpAuditDbForTests(async () => null as never);
    await expect(appendGxpAuditEvent({
      actorUserId: 7,
      framework: "GMP",
      activity: "quality_event",
      assessmentStatus: "blocked",
      missingControls: [],
      eventPayload: {},
    })).rejects.toThrow(/available database/);
    await expect(verifyGxpAuditChain()).rejects.toThrow(/available database/);
  });

  it("serializes append in a transaction and links to the previous hash", async () => {
    const previousHash = "a".repeat(64);
    const returning = vi.fn(async () => [{ id: 9, eventHash: "b".repeat(64) }]);
    const values = vi.fn(() => ({ returning }));
    const execute = vi.fn(async () => undefined);
    const tx = {
      execute,
      select: () => ({
        from: () => ({
          orderBy: () => ({ limit: async () => [{ eventHash: previousHash }] }),
        }),
      }),
      insert: () => ({ values }),
    };
    const transaction = vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));
    setGxpAuditDbForTests(async () => ({ transaction } as never));

    const result = await appendGxpAuditEvent({
      actorUserId: 7,
      framework: "GMP",
      activity: "quality_event",
      assessmentStatus: "blocked",
      missingControls: ["human_quality_review"],
      eventPayload: { automationMode: "assessment_only" },
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 7,
      previousHash,
      eventHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(result).toEqual({ id: 9, eventHash: "b".repeat(64) });
  });

  it("fails when the insert returns no persisted row", async () => {
    const tx = {
      execute: vi.fn(async () => undefined),
      select: () => ({
        from: () => ({ orderBy: () => ({ limit: async () => [] }) }),
      }),
      insert: () => ({ values: () => ({ returning: async () => [] }) }),
    };
    setGxpAuditDbForTests(async () => ({
      transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    } as never));

    await expect(appendGxpAuditEvent({
      actorUserId: 7,
      framework: "GDP",
      activity: "deviation",
      assessmentStatus: "blocked",
      missingControls: [],
      eventPayload: {},
    })).rejects.toThrow(/returned no row/);
  });

  it("accepts an empty ledger without querying event pages", async () => {
    const select = vi.fn(() => queryBuilder([]));
    setGxpAuditDbForTests(async () => ({ select } as never));

    await expect(verifyGxpAuditChain()).resolves.toMatchObject({
      valid: true,
      checkedEvents: 0,
      brokenAtId: null,
      latestHash: GXP_AUDIT_GENESIS_HASH,
    });
    expect(select).toHaveBeenCalledOnce();
  });

  it("verifies a ledger across multiple bounded pages", async () => {
    const rows: GxpAuditChainRow[] = [];
    let previousHash = GXP_AUDIT_GENESIS_HASH;
    for (let id = 1; id <= GXP_AUDIT_VERIFY_BATCH_SIZE + 1; id += 1) {
      const row = makeRow(id, previousHash);
      rows.push(row);
      previousHash = row.eventHash;
    }

    const pageResults = [rows.slice(0, GXP_AUDIT_VERIFY_BATCH_SIZE), rows.slice(GXP_AUDIT_VERIFY_BATCH_SIZE)];
    const limitCalls: number[] = [];
    let selectCount = 0;
    const select = () => {
      selectCount += 1;
      if (selectCount === 1) return queryBuilder([{ id: rows.at(-1)!.id }]);
      const page = pageResults.shift() ?? [];
      const builder = queryBuilder(page);
      const originalLimit = builder.limit;
      builder.limit = vi.fn(async (limit?: number) => {
        limitCalls.push(limit ?? -1);
        return originalLimit(limit);
      });
      return builder;
    };
    setGxpAuditDbForTests(async () => ({ select } as never));

    await expect(verifyGxpAuditChain()).resolves.toMatchObject({
      valid: true,
      checkedEvents: GXP_AUDIT_VERIFY_BATCH_SIZE + 1,
      brokenAtId: null,
      latestHash: previousHash,
    });
    expect(limitCalls).toEqual([GXP_AUDIT_VERIFY_BATCH_SIZE, GXP_AUDIT_VERIFY_BATCH_SIZE]);
  });

  it("fails closed when a page read ends before the captured ledger head", async () => {
    const first = makeRow(1, GXP_AUDIT_GENESIS_HASH);
    let selectCount = 0;
    const select = () => {
      selectCount += 1;
      return queryBuilder(selectCount === 1 ? [{ id: 2 }] : [first]);
    };
    setGxpAuditDbForTests(async () => ({ select } as never));

    await expect(verifyGxpAuditChain()).resolves.toMatchObject({
      valid: false,
      checkedEvents: 1,
      brokenAtId: null,
      latestHash: first.eventHash,
    });
  });
});
