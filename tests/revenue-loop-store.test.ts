import { describe, expect, it } from "vitest";

import { createLoopDraft, type LoopDraft } from "../lib/revenue-loop-logic";
import { loadLoops, LOOP_STORAGE_ID, MAX_STORED_LOOPS, saveLoops, type KeyValueAdapter } from "../lib/revenue-loop-store";

const VALID: Partial<LoopDraft> = {
  name: "Content-to-Lead",
  flow: "Content → Lead",
  hypothesis: "Kurze YouTube-Shorts führen pro Woche zu Newsletter-Anmeldungen.",
  experiment: "4 Wochen je 3 Shorts mit identischem CTA, Zähler im Newsletter-Tool.",
  metric: "Newsletter-Anmeldungen",
  unit: "Anmeldungen",
  targetValue: 100,
  currentValue: 0,
};

function memoryAdapter(initial: Record<string, string> = {}): KeyValueAdapter & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (key) => data[key] ?? null,
    setItem: async (key, value) => { data[key] = value; },
    removeItem: async (key) => { delete data[key]; },
  };
}

function sampleLoop(id: string, name: string): LoopDraft {
  return { ...createLoopDraft({ ...VALID, name }, () => 1_000), id };
}

describe("revenue loop store (Sprint 228)", () => {
  it("speichert und lädt begrenzte Listen versioniert", async () => {
    const adapter = memoryAdapter();
    const loops = Array.from({ length: MAX_STORED_LOOPS + 5 }, (_, i) => sampleLoop(`l${i}`, `Loop ${i}`));
    await saveLoops(adapter, loops, () => 42);
    const saved = JSON.parse(adapter.data[LOOP_STORAGE_ID]!) as { loops: LoopDraft[] };
    expect(saved.loops).toHaveLength(MAX_STORED_LOOPS);
    const loaded = await loadLoops(adapter);
    expect(loaded.loops).toHaveLength(MAX_STORED_LOOPS);
    expect(loaded.note).toBeNull();

    // Von außen überfüllte Daten klemmt auch der Lade-Pfad ehrlich.
    const overfull = memoryAdapter({ [LOOP_STORAGE_ID]: JSON.stringify({ version: 1, savedAt: 1, loops }) });
    const loadedOver = await loadLoops(overfull);
    expect(loadedOver.loops).toHaveLength(MAX_STORED_LOOPS);
    expect(loadedOver.note).toContain("abgeschnitten");
    const raw = JSON.parse(adapter.data[LOOP_STORAGE_ID]!) as { version: number; savedAt: number };
    expect(raw.version).toBe(1);
    expect(raw.savedAt).toBe(42);
  });

  it("meldet und entsorgt korrupten Speicher statt zu crashen", async () => {
    const adapter = memoryAdapter({ [LOOP_STORAGE_ID]: "{kein json" });
    const result = await loadLoops(adapter);
    expect(result.loops).toEqual([]);
    expect(result.note).toContain("beschädigt");
    expect(adapter.data[LOOP_STORAGE_ID]).toBeUndefined();

    const adapter2 = memoryAdapter({ [LOOP_STORAGE_ID]: JSON.stringify({ version: 9, loops: [] }) });
    const result2 = await loadLoops(adapter2);
    expect(result2.note).toContain("beschädigt");
  });

  it("lehnt gespeicherte Müll-Einträge beim Laden ab", async () => {
    const bad = JSON.stringify({ version: 1, savedAt: 1, loops: [{ id: "x", name: "ab" }] });
    const adapter = memoryAdapter({ [LOOP_STORAGE_ID]: bad });
    const result = await loadLoops(adapter);
    expect(result.loops).toEqual([]);
    expect(result.note).toContain("unvollständig");
  });

  it("leerer Speicher ist ein echter Leerzustand", async () => {
    const result = await loadLoops(memoryAdapter());
    expect(result.loops).toEqual([]);
    expect(result.note).toBeNull();
  });

  it("leitet Schreib- und Lesefehler weiter statt zu schlucken", async () => {
    const broken: KeyValueAdapter = {
      getItem: async () => { throw new Error("kaputt"); },
      setItem: async () => { throw new Error("voll"); },
      removeItem: async () => { await Promise.resolve(); },
    };
    await expect(loadLoops(broken)).rejects.toThrow("nicht lesbar");
    await expect(saveLoops(broken, [])).rejects.toThrow("nicht schreibbar");
  });
});
