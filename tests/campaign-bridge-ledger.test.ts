import { describe, expect, it } from "vitest";

import type { LedgerKeyValueAdapter } from "@/lib/campaign-bridge-ledger";
import {
  BRIDGE_LEDGER_STORAGE_ID,
  MAX_LEDGER_IDS,
  loadBridgeLedger,
  markIdeasBridged,
  saveBridgeLedger,
} from "@/lib/campaign-bridge-ledger";

function memoryAdapter(initial: Record<string, string> = {}): LedgerKeyValueAdapter & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => void store.set(key, value),
    removeItem: async (key) => void store.delete(key),
  };
}

describe("Sprint 373: Brücken-Ledger", () => {
  it("startet mit leerer Historie", async () => {
    const state = await loadBridgeLedger(memoryAdapter());
    expect(state.bridgedIdeaIds).toEqual([]);
    expect(state.note).toBeNull();
  });

  it("merkt sich verbrückte Ideen idempotent — keine Duplikate", async () => {
    const adapter = memoryAdapter();
    const first = await markIdeasBridged(adapter, ["idea-1"]);
    expect(first.bridgedIdeaIds).toEqual(["idea-1"]);
    const second = await markIdeasBridged(adapter, ["idea-1", "idea-2"]);
    expect(second.bridgedIdeaIds).toEqual(["idea-1", "idea-2"]);
  });

  it("übersteht einen Neustart (Persistenz über den Ledger-Schlüssel)", async () => {
    const writer = memoryAdapter();
    await markIdeasBridged(writer, ["idea-1", "idea-2"]);
    const saved = writer.store.get(BRIDGE_LEDGER_STORAGE_ID);
    expect(saved).toBeDefined();
    const reader = memoryAdapter({ [BRIDGE_LEDGER_STORAGE_ID]: saved ?? "" });
    const state = await loadBridgeLedger(reader);
    expect(state.bridgedIdeaIds).toEqual(["idea-1", "idea-2"]);
    expect(state.note).toBeNull();
  });

  it("kürzt ehrlich auf MAX_LEDGER_IDS Einträge — älteste zuerst", async () => {
    const adapter = memoryAdapter();
    const ids = Array.from({ length: MAX_LEDGER_IDS + 10 }, (_, index) => `idea-${index}`);
    await saveBridgeLedger(adapter, ids);
    const state = await loadBridgeLedger(adapter);
    expect(state.bridgedIdeaIds).toHaveLength(MAX_LEDGER_IDS);
    expect(state.bridgedIdeaIds[0]).toBe("idea-10");
    expect(state.bridgedIdeaIds.at(-1)).toBe(`idea-${MAX_LEDGER_IDS + 9}`);
  });

  it("verwirft korrupte Daten mit ehrlicher Meldung statt still zu reparieren", async () => {
    const corrupted = memoryAdapter({ [BRIDGE_LEDGER_STORAGE_ID]: "{kein json" });
    const state = await loadBridgeLedger(corrupted);
    expect(state.bridgedIdeaIds).toEqual([]);
    expect(state.note).toContain("unlesbar");

    const wrongVersion = memoryAdapter({ [BRIDGE_LEDGER_STORAGE_ID]: JSON.stringify({ version: 2, bridgedIdeaIds: ["x"] }) });
    const state2 = await loadBridgeLedger(wrongVersion);
    expect(state2.bridgedIdeaIds).toEqual([]);
    expect(state2.note).toContain("Format");
  });
});
