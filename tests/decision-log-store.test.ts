import { describe, expect, it } from "vitest";

import { createDecisionItem, type DecisionItem } from "../lib/decision-log-logic";
import { DECISION_STORAGE_ID, loadDecisions, MAX_STORED_DECISIONS, saveDecisions, type DecisionKeyValueAdapter } from "../lib/decision-log-store";

function memoryAdapter(initial: Record<string, string> = {}): DecisionKeyValueAdapter & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (key) => data[key] ?? null,
    setItem: async (key, value) => { data[key] = value; },
    removeItem: async (key) => { delete data[key]; },
  };
}

function decision(title: string, status: DecisionItem["status"] = "open", delta = 0): DecisionItem {
  return createDecisionItem({ title, expectation: "Messbare Erwartung mit Termin", reviewBy: "2026-12-31", status }, () => 1_000 + delta);
}

describe("decision log store (Sprint 257)", () => {
  it("speichert und lädt versioniert", async () => {
    const adapter = memoryAdapter();
    const items = [decision("Erste Entscheidung"), decision("Zweite Entscheidung", "confirmed")];
    await saveDecisions(adapter, items, () => 42);
    const loaded = await loadDecisions(adapter);
    expect(loaded.items).toHaveLength(2);
    expect(loaded.note).toBeNull();
    const raw = JSON.parse(adapter.data[DECISION_STORAGE_ID]!) as { version: number; savedAt: number };
    expect(raw.version).toBe(1);
    expect(raw.savedAt).toBe(42);
  });

  it("opfert entschiedene zuerst, offene zuletzt", async () => {
    const adapter = memoryAdapter();
    const items = [
      ...Array.from({ length: 200 }, (_, i) => decision(`Offen ${i}`, "open", i)),
      ...Array.from({ length: 51 }, (_, i) => decision(`Erledigt ${i}`, "wrong", 10_000 + i)),
    ];
    await saveDecisions(adapter, items, () => 42);
    const saved = JSON.parse(adapter.data[DECISION_STORAGE_ID]!) as { items: DecisionItem[] };
    expect(saved.items).toHaveLength(MAX_STORED_DECISIONS);
    expect(saved.items.filter((item) => item.status === "open")).toHaveLength(200);
    expect(saved.items.filter((item) => item.status === "wrong")).toHaveLength(50);
  });

  it("meldet und entsorgt korrupten Speicher", async () => {
    const adapter = memoryAdapter({ [DECISION_STORAGE_ID]: "{kaputt" });
    const result = await loadDecisions(adapter);
    expect(result.items).toEqual([]);
    expect(result.note).toContain("beschädigt");
    expect(adapter.data[DECISION_STORAGE_ID]).toBeUndefined();
    const wrong = memoryAdapter({ [DECISION_STORAGE_ID]: JSON.stringify({ version: 9, items: [] }) });
    expect((await loadDecisions(wrong)).note).toContain("beschädigt");
  });

  it("lehnt gespeicherte Müll-Einträge ab", async () => {
    const bad = JSON.stringify({ version: 1, savedAt: 1, items: [{ id: "x", title: "kurz", expectation: "Messbare Erwartung mit Termin", reviewBy: "2026-12-31" }] });
    const adapter = memoryAdapter({ [DECISION_STORAGE_ID]: bad });
    const result = await loadDecisions(adapter);
    expect(result.items).toEqual([]);
    expect(result.note).toContain("unvollständig");
  });

  it("leerer Speicher ist ein echter Leerzustand", async () => {
    const result = await loadDecisions(memoryAdapter());
    expect(result.items).toEqual([]);
    expect(result.note).toBeNull();
  });

  it("leitet Schreib- und Lesefehler weiter", async () => {
    const broken: DecisionKeyValueAdapter = {
      getItem: async () => { throw new Error("kaputt"); },
      setItem: async () => { throw new Error("voll"); },
      removeItem: async () => { await Promise.resolve(); },
    };
    await expect(loadDecisions(broken)).rejects.toThrow("nicht lesbar");
    await expect(saveDecisions(broken, [])).rejects.toThrow("nicht schreibbar");
  });
});
