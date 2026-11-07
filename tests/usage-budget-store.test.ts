import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { asyncStorageValues, setUseTestStorageValues } from "./stubs/react-native-stub.mjs";

import { clearUsageEntries, loadUsageEntries, recordUsageEntry } from "../lib/usage-budget-store";
import { USAGE_ENTRIES_LIMIT, USAGE_ENTRIES_STORAGE_KEY, type UsageEntry } from "../lib/usage-budget-view-logic";

// Sprint 191: Persistenzbruecke des Nutzungsbudgets (vor diesem Sprint 0 %
// Coverage, produktiv in app/(tabs)/quality.tsx genutzt). Der Stub-Zustand wird
// mit anderen Dateien im selben Worker geteilt (isolate:false), daher wird der
// Test-Storage-Modus am Ende der Suite wieder abgeschaltet.
afterAll(() => {
  setUseTestStorageValues(false);
});

describe("usage budget store", () => {
  beforeEach(() => {
    setUseTestStorageValues(true);
    asyncStorageValues.clear();
  });

  it("returns an empty list when nothing is persisted", async () => {
    expect(await loadUsageEntries()).toEqual([]);
  });

  it("returns an empty list for corrupted or non-array storage payloads", async () => {
    asyncStorageValues.set(USAGE_ENTRIES_STORAGE_KEY, "not json");
    expect(await loadUsageEntries()).toEqual([]);

    asyncStorageValues.set(USAGE_ENTRIES_STORAGE_KEY, '{"entries":[]}');
    expect(await loadUsageEntries()).toEqual([]);
  });

  it("drops invalid entries and sorts by timestamp", async () => {
    const stored = JSON.stringify([
      { timestampMs: 300, costUnits: 2 },
      { timestampMs: "kaputt", costUnits: 5 },
      { timestampMs: 100, costUnits: 1 },
      { timestampMs: 200, costUnits: "5" },
      null,
    ]);
    asyncStorageValues.set(USAGE_ENTRIES_STORAGE_KEY, stored);

    expect(await loadUsageEntries()).toEqual([
      { timestampMs: 100, costUnits: 1 },
      { timestampMs: 300, costUnits: 2 },
    ]);
  });

  it("records an entry, persists it and returns the updated sorted list", async () => {
    const first = await recordUsageEntry({ timestampMs: 500, costUnits: 3 });
    expect(first).toEqual([{ timestampMs: 500, costUnits: 3 }]);

    const second = await recordUsageEntry({ timestampMs: 400, costUnits: 1 });
    expect(second).toEqual([
      { timestampMs: 400, costUnits: 1 },
      { timestampMs: 500, costUnits: 3 },
    ]);

    const raw = asyncStorageValues.get(USAGE_ENTRIES_STORAGE_KEY);
    expect(typeof raw).toBe("string");
    expect(JSON.parse(raw as string)).toEqual(second);
    expect(await loadUsageEntries()).toEqual(second);
  });

  it("ignores entries with non-finite values instead of persisting garbage", async () => {
    await recordUsageEntry({ timestampMs: 100, costUnits: 2 });
    const result = await recordUsageEntry({ timestampMs: Number.NaN, costUnits: 7 } as UsageEntry);

    expect(result).toEqual([{ timestampMs: 100, costUnits: 2 }]);
    expect(JSON.parse(asyncStorageValues.get(USAGE_ENTRIES_STORAGE_KEY) as string)).toEqual(result);
  });

  it("caps the persisted list at the storage limit", async () => {
    const flood = Array.from({ length: USAGE_ENTRIES_LIMIT + 5 }, (_, index) => ({
      timestampMs: USAGE_ENTRIES_LIMIT + 5 - index,
      costUnits: 1,
    }));
    asyncStorageValues.set(USAGE_ENTRIES_STORAGE_KEY, JSON.stringify(flood));

    const loaded = await loadUsageEntries();
    expect(loaded).toHaveLength(USAGE_ENTRIES_LIMIT);
    expect(loaded[0].timestampMs).toBe(6);
    expect(loaded.at(-1)?.timestampMs).toBe(USAGE_ENTRIES_LIMIT + 5);

    // Ein neuer Eintrag rueckt ans Ende; der aelteste faellt aus dem Limit.
    const appended = await recordUsageEntry({ timestampMs: 10_000, costUnits: 1 });
    expect(appended).toHaveLength(USAGE_ENTRIES_LIMIT);
    expect(appended[0].timestampMs).toBe(7);
    expect(appended.at(-1)?.timestampMs).toBe(10_000);
  });

  it("clears persisted entries", async () => {
    await recordUsageEntry({ timestampMs: 700, costUnits: 4 });
    expect(asyncStorageValues.has(USAGE_ENTRIES_STORAGE_KEY)).toBe(true);

    await clearUsageEntries();

    expect(asyncStorageValues.has(USAGE_ENTRIES_STORAGE_KEY)).toBe(false);
    expect(await loadUsageEntries()).toEqual([]);
  });
});
