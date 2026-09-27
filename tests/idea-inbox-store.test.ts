import { describe, expect, it } from "vitest";

import { createIdeaItem, type IdeaItem } from "../lib/idea-inbox-logic";
import { IDEA_STORAGE_ID, loadIdeaItems, MAX_STORED_IDEA_ITEMS, saveIdeaItems, type IdeaKeyValueAdapter } from "../lib/idea-inbox-store";

function memoryAdapter(initial: Record<string, string> = {}): IdeaKeyValueAdapter & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (key) => data[key] ?? null,
    setItem: async (key, value) => { data[key] = value; },
    removeItem: async (key) => { delete data[key]; },
  };
}

function idea(title: string, status: IdeaItem["status"] = "inbox", capturedDelta = 0): IdeaItem {
  return createIdeaItem({ title, source: "spontan", status }, () => 1_000 + capturedDelta);
}

describe("idea inbox store (Sprint 247)", () => {
  it("speichert und lädt versioniert", async () => {
    const adapter = memoryAdapter();
    const items = [idea("Idee A"), idea("Idee B", "kept")];
    await saveIdeaItems(adapter, items, () => 42);
    const loaded = await loadIdeaItems(adapter);
    expect(loaded.items).toHaveLength(2);
    expect(loaded.note).toBeNull();
    const raw = JSON.parse(adapter.data[IDEA_STORAGE_ID]!) as { version: number; savedAt: number };
    expect(raw.version).toBe(1);
    expect(raw.savedAt).toBe(42);
  });

  it("kürzt entschiedene Ideen zuerst und meldet es ehrlich", async () => {
    const adapter = memoryAdapter();
    const items = [
      ...Array.from({ length: 200 }, (_, i) => idea(`Offen ${i}`, "inbox", i)),
      ...Array.from({ length: 101 }, (_, i) => idea(`Erledigt ${i}`, "dropped", 1_000 + i)),
    ];
    await saveIdeaItems(adapter, items, () => 42);
    const saved = JSON.parse(adapter.data[IDEA_STORAGE_ID]!) as { items: IdeaItem[] };
    expect(saved.items).toHaveLength(MAX_STORED_IDEA_ITEMS);
    expect(saved.items.filter((item) => item.status === "inbox")).toHaveLength(200);
    // Die geopferten sind entschiedene, nicht offene Ideen.
    expect(saved.items.filter((item) => item.status === "dropped")).toHaveLength(100);
    const loaded = await loadIdeaItems(adapter);
    expect(loaded.note).toBeNull();
    const overfull = memoryAdapter({ [IDEA_STORAGE_ID]: JSON.stringify({ version: 1, savedAt: 1, items }) });
    const loadedOver = await loadIdeaItems(overfull);
    expect(loadedOver.items).toHaveLength(MAX_STORED_IDEA_ITEMS);
    expect(loadedOver.note).toContain("entschiedene Idee");
  });

  it("meldet und entsorgt korrupten Speicher", async () => {
    const adapter = memoryAdapter({ [IDEA_STORAGE_ID]: "{kaputt" });
    const result = await loadIdeaItems(adapter);
    expect(result.items).toEqual([]);
    expect(result.note).toContain("beschädigt");
    expect(adapter.data[IDEA_STORAGE_ID]).toBeUndefined();
    const wrongVersion = memoryAdapter({ [IDEA_STORAGE_ID]: JSON.stringify({ version: 3, items: [] }) });
    expect((await loadIdeaItems(wrongVersion)).note).toContain("beschädigt");
  });

  it("leerer Speicher ist ein echter Leerzustand", async () => {
    const result = await loadIdeaItems(memoryAdapter());
    expect(result.items).toEqual([]);
    expect(result.note).toBeNull();
  });

  it("leitet Schreib- und Lesefehler weiter", async () => {
    const broken: IdeaKeyValueAdapter = {
      getItem: async () => { throw new Error("kaputt"); },
      setItem: async () => { throw new Error("voll"); },
      removeItem: async () => { await Promise.resolve(); },
    };
    await expect(loadIdeaItems(broken)).rejects.toThrow("nicht lesbar");
    await expect(saveIdeaItems(broken, [])).rejects.toThrow("nicht schreibbar");
  });
});
