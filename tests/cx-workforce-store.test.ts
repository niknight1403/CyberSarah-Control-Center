import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { triageCxRequest } from "../lib/cx-workforce-logic";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  insertValues: vi.fn(),
  onConflictDoNothing: vi.fn(),
  selectLimit: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../server/db", () => ({ getDb: mocks.getDb }));

import {
  getCxCaseById,
  listCxCases,
  saveCxCase,
} from "../server/cx-workforce-store";

function makeDb() {
  const chain: Record<string, any> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = mocks.selectLimit;
  const db = {
    insert: vi.fn(() => ({
      values: mocks.insertValues,
    })),
    select: vi.fn(() => chain),
  };
  mocks.insertValues.mockReturnValue({ onConflictDoNothing: mocks.onConflictDoNothing });
  return { db, chain };
}

const triage = () => triageCxRequest({ message: "Ich habe eine Frage zu meinem Konto." });

describe("CX workforce database store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockResolvedValue(null);
    mocks.selectLimit.mockResolvedValue([]);
    mocks.onConflictDoNothing.mockResolvedValue(undefined);
  });

  it("fails closed when the database is unavailable", async () => {
    await expect(saveCxCase({ source: "admin_preview", triage: triage() }))
      .rejects.toThrow(/Datenbank nicht verfügbar/);
    await expect(listCxCases()).rejects.toThrow(/Datenbank nicht verfügbar/);
    await expect(getCxCaseById("a".repeat(32))).rejects.toThrow(/Datenbank nicht verfügbar/);
  });

  it("persists only a minimized case and verifies the stored record", async () => {
    const { db } = makeDb();
    const expectedId = createHash("sha256").update("admin_preview:case_123").digest("hex").slice(0, 32);
    mocks.selectLimit.mockImplementation(async () => [{
      value: {
        id: expectedId,
        source: "admin_preview",
        externalReference: "case_123",
        status: "needs_review",
        triage: triage(),
        createdAt: new Date().toISOString(),
      },
    }]);
    mocks.getDb.mockResolvedValue(db);

    const result = await saveCxCase({
      source: "admin_preview",
      externalReference: "case_123",
      triage: triage(),
    });

    expect(db.insert).toHaveBeenCalledOnce();
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      key: expect.stringMatching(/^cx-workforce:case:[a-f0-9]{32}$/),
      value: expect.objectContaining({
        source: "admin_preview",
        externalReference: "case_123",
        status: "needs_review",
        triage: expect.any(Object),
      }),
    }));
    const storedValue = mocks.insertValues.mock.calls[0][0].value;
    expect(storedValue).not.toHaveProperty("message");
    expect(storedValue).not.toHaveProperty("subject");
    expect(mocks.onConflictDoNothing).toHaveBeenCalledOnce();
    expect(result.id).toMatch(/^[a-f0-9]{32}$/);
  });

  it("rejects a missing post-insert readback", async () => {
    const { db } = makeDb();
    mocks.getDb.mockResolvedValue(db);
    mocks.selectLimit.mockResolvedValue([]);
    await expect(saveCxCase({
      source: "admin_preview",
      externalReference: "case_missing",
      triage: triage(),
    })).rejects.toThrow(/nicht verifiziert/);
  });

  it("lists only validated records and clamps the requested limit", async () => {
    const { db } = makeDb();
    const valid = {
      id: "b".repeat(32),
      source: "admin_preview",
      externalReference: null,
      status: "needs_review",
      triage: triage(),
      createdAt: new Date().toISOString(),
    };
    mocks.getDb.mockResolvedValue(db);
    mocks.selectLimit.mockResolvedValue([{ value: valid }]);

    await expect(listCxCases(999)).resolves.toEqual([valid]);
    expect(mocks.selectLimit).toHaveBeenCalledWith(100);
    await expect(listCxCases(-10)).resolves.toEqual([valid]);
    expect(mocks.selectLimit).toHaveBeenLastCalledWith(1);
  });

  it("loads a case by opaque ID and rejects invalid IDs before database access", async () => {
    const { db } = makeDb();
    const valid = {
      id: "c".repeat(32),
      source: "admin_preview",
      externalReference: null,
      status: "needs_review",
      triage: triage(),
      createdAt: new Date().toISOString(),
    };
    mocks.getDb.mockResolvedValue(db);
    mocks.selectLimit.mockResolvedValue([{ value: valid }]);

    await expect(getCxCaseById(valid.id)).resolves.toEqual(valid);
    await expect(getCxCaseById("not-an-id")).rejects.toThrow(/Ungültige CX-Fall-ID/);
    expect(mocks.getDb).toHaveBeenCalledOnce();
  });

  it("rejects tampered stored records during readback", async () => {
    const { db } = makeDb();
    mocks.getDb.mockResolvedValue(db);
    mocks.selectLimit.mockResolvedValue([{ value: { id: "d".repeat(32), rawMessage: "PII" } }]);

    await expect(getCxCaseById("d".repeat(32))).rejects.toThrow(/Ungültiger gespeicherter CX-Fall/);
  });
});
