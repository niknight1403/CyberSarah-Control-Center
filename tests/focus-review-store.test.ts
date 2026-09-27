import { describe, expect, it } from "vitest";

import { createFocusItem, type FocusItem } from "../lib/focus-review-logic";
import { FOCUS_STORAGE_ID, loadFocusItems, MAX_STORED_FOCUS_ITEMS, saveFocusItems, type KeyValueAdapter } from "../lib/focus-review-store";

function memoryAdapter(initial: Record<string, string> = {}): KeyValueAdapter & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (key) => data[key] ?? null,
    setItem: async (key, value) => { data[key] = value; },
    removeItem: async (key) => { delete data[key]; },
  };
}

function item(day: string, title: string, createdDelta = 0): FocusItem {
  return createFocusItem({ day, title }, () => 1_000 + createdDelta);
}

describe("focus review store (Sprint 238)", () => {
  it("speichert und lädt versioniert mit Zeitstempel", async () => {
    const adapter = memoryAdapter();
    const items = [item("2026-09-24", "Punkt A"), item("2026-09-25", "Punkt B")];
    await saveFocusItems(adapter, items, () => 42);
    const loaded = await loadFocusItems(adapter);
    expect(loaded.items).toHaveLength(2);
    expect(loaded.note).toBeNull();
    const raw = JSON.parse(adapter.data[FOCUS_STORAGE_ID]!) as { version: number; savedAt: number };
    expect(raw.version).toBe(1);
    expect(raw.savedAt).toBe(42);
  });

  it("kürzt chronologisch und meldet es ehrlich", async () => {
    const adapter = memoryAdapter();
    const items = Array.from({ length: MAX_STORED_FOCUS_ITEMS + 3 }, (_, i) => item(`2026-09-${String((i % 28) + 1).padStart(2, "0")}`, `Punkt ${i}`, i * 10));
    await saveFocusItems(adapter, items, () => 42);
    const saved = JSON.parse(adapter.data[FOCUS_STORAGE_ID]!) as { items: FocusItem[] };
    expect(saved.items).toHaveLength(MAX_STORED_FOCUS_ITEMS);
    const loaded = await loadFocusItems(adapter);
    expect(loaded.items).toHaveLength(MAX_STORED_FOCUS_ITEMS);
    expect(loaded.note).toBeNull();

    // Von außen überfüllte Daten kürzt auch der Lade-Pfad ehrlich.
    const overfull = memoryAdapter({ [FOCUS_STORAGE_ID]: JSON.stringify({ version: 1, savedAt: 1, items }) });
    const loadedOver = await loadFocusItems(overfull);
    expect(loadedOver.items).toHaveLength(MAX_STORED_FOCUS_ITEMS);
    expect(loadedOver.note).toContain("entfernt");
    // Die ältesten drei (kleinste createdAt) fehlen.
    expect(loadedOver.items.some((stored) => stored.title === "Punkt 0")).toBe(false);
    expect(loadedOver.items.some((stored) => stored.title === `Punkt ${MAX_STORED_FOCUS_ITEMS + 2}`)).toBe(true);
  });

  it("meldet und entsorgt korrupten Speicher statt zu crashen", async () => {
    const adapter = memoryAdapter({ [FOCUS_STORAGE_ID]: "{kein json" });
    const result = await loadFocusItems(adapter);
    expect(result.items).toEqual([]);
    expect(result.note).toContain("beschädigt");
    expect(adapter.data[FOCUS_STORAGE_ID]).toBeUndefined();
    const adapter2 = memoryAdapter({ [FOCUS_STORAGE_ID]: JSON.stringify({ version: 2, items: [] }) });
    expect((await loadFocusItems(adapter2)).note).toContain("beschädigt");
  });

  it("lehnt gespeicherte Müll-Einträge ab", async () => {
    const bad = JSON.stringify({ version: 1, savedAt: 1, items: [{ id: "x", day: "2026-09-24", title: "ab" }] });
    const adapter = memoryAdapter({ [FOCUS_STORAGE_ID]: bad });
    const result = await loadFocusItems(adapter);
    expect(result.items).toEqual([]);
    expect(result.note).toContain("unvollständig");
  });

  it("leerer Speicher ist ein echter Leerzustand", async () => {
    const result = await loadFocusItems(memoryAdapter());
    expect(result.items).toEqual([]);
    expect(result.note).toBeNull();
  });

  it("leitet Schreib- und Lesefehler weiter statt zu schlucken", async () => {
    const broken: KeyValueAdapter = {
      getItem: async () => { throw new Error("kaputt"); },
      setItem: async () => { throw new Error("voll"); },
      removeItem: async () => { await Promise.resolve(); },
    };
    await expect(loadFocusItems(broken)).rejects.toThrow("nicht lesbar");
    await expect(saveFocusItems(broken, [])).rejects.toThrow("nicht schreibbar");
  });
});
