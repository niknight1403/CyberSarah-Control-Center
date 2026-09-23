import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCleanupEntries, isAppStorageKey, scanDeviceStorage } from "../lib/storage-manager-device";

describe("storage manager web storage scope (Sprint 203)", () => {
  afterEach(() => vi.stubGlobal("localStorage", undefined));

  it("rejects unsafe paths, directories and missing files before deletion", async () => {
    const deleted: string[] = [];
    const adapter = {
      documentDirectory: "file:///docs/", cacheDirectory: "file:///cache/",
      readDirectoryAsync: async () => [],
      getInfoAsync: async (uri: string) => ({ exists: !uri.includes("gone"), isDirectory: uri.includes("folder") }),
      deleteAsync: async (uri: string) => { deleted.push(uri); },
    };
    const paths = ["cache/../document/private", "cache/folder", "cache/gone", "cache/normal file.txt"];
    const result = await applyCleanupEntries(adapter, paths.map((path) => ({ path, sizeBytes: 10 })));
    expect(result.deleted).toEqual(["cache/normal file.txt"]);
    expect(result.failed).toHaveLength(3);
    expect(result.reclaimedBytes).toBe(10);
    expect(deleted).toEqual(["file:///cache/normal%20file.txt"]);
  });

  it("does not claim a missing WebStorage entry was deleted", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, removeItem: vi.fn() });
    const result = await applyCleanupEntries(null, [{ path: "webstorage/cybersarah.cache", sizeBytes: 20 }]);
    expect(result.deleted).toEqual([]);
    expect(result.failed).toHaveLength(1);
  });

  it("only indexes app-owned non-sensitive keys", async () => {
    const values = new Map([
      ["cybersarah.notes", "hello"], ["expo.cache", "abc"],
      ["cybersarah.session-token", "sensitive"], ["app_session_token", "sensitive"],
      ["other-site", "other"], ["cybersarah/../other", "invalid"],
    ]);
    vi.stubGlobal("localStorage", {
      length: values.size,
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
    });
    expect(isAppStorageKey("cybersarah.notes")).toBe(true);
    expect(isAppStorageKey("cybersarah.api-key")).toBe(false);
    const scan = await scanDeviceStorage(null);
    expect(scan.entries.map((item) => item.path)).toEqual(["webstorage/cybersarah.notes", "webstorage/expo.cache"]);
    expect(scan.notes).toContain("2 WebStorage-Einträge (geschätzte Größe) einbezogen.");
  });
});
