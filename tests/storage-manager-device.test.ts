import { afterEach, describe, expect, it, vi } from "vitest";
import { isAppStorageKey, scanDeviceStorage } from "../lib/storage-manager-device";

describe("storage manager web storage scope (Sprint 203)", () => {
  afterEach(() => vi.stubGlobal("localStorage", undefined));

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
