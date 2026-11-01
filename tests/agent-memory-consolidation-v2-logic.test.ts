import { describe, it, expect } from "vitest";
import {
  categorizeMemoryItem,
  consolidateMemoriesV2,
  MemoryItemV2,
} from "../lib/agent-memory-consolidation-v2-logic";

describe("Sprint 367 — Gedächtnis-Konsolidierung v2", () => {
  it("kategorisiert unstrukturierte Texte heuristisch korrekt", () => {
    expect(categorizeMemoryItem("Ich bevorzuge kurze Berichte")).toBe("UserPreference");
    expect(categorizeMemoryItem("CHANGELOG.md nur oben ergänzen, nie ältere löschen")).toBe("ProjectRules");
    expect(categorizeMemoryItem("Postgres DB Verbindung auf Port 5432")).toBe("SystemArchitecture");
    expect(categorizeMemoryItem("Warten auf Antwort von API")).toBe("EphemeralTaskState");
  });

  it("konsolidiert Duplikate und löst Konflikte zugunsten bestätigter/neuerer Einträge", () => {
    const rawItems: MemoryItemV2[] = [
      {
        id: "m1",
        category: "Uncategorized",
        content: "Niemals alte CHANGELOG-Sektionen löschen",
        importance: "medium",
        isConfirmed: false,
        createdAt: "2026-09-20T10:00:00.000Z",
      },
      {
        id: "m2",
        category: "ProjectRules",
        content: "Niemals alte CHANGELOG-Sektionen löschen",
        importance: "high",
        isConfirmed: true, // Bestätigte Regel überschreibt m1
        createdAt: "2026-09-21T10:00:00.000Z",
      },
    ];

    const { consolidatedItems, report } = consolidateMemoriesV2(rawItems);

    expect(consolidatedItems.length).toBe(1);
    expect(consolidatedItems[0].id).toBe("m2");
    expect(report.conflictsResolved).toBe(1);
    expect(report.itemsPruned).toBe(1);
  });

  it("bereinigt veraltete flüchtige Zustände nach Verfallsdatum", () => {
    const rawItems: MemoryItemV2[] = [
      {
        id: "e1",
        category: "EphemeralTaskState",
        content: "Zwischenstand: Baue Sprint 284",
        importance: "ephemeral",
        isConfirmed: false,
        createdAt: "2026-09-01T10:00:00.000Z", // 25 Tage alt
      },
      {
        id: "p1",
        category: "UserPreference",
        content: "Sprache: Deutsch",
        importance: "high",
        isConfirmed: true,
        createdAt: "2026-09-01T10:00:00.000Z", // Auch alt, aber wichtig & bestätigt!
      },
    ];

    const { consolidatedItems, report } = consolidateMemoriesV2(rawItems, {
      maxEphemeralAgeDays: 7,
      nowIso: "2026-09-26T00:00:00.000Z",
    });

    expect(consolidatedItems.length).toBe(1);
    expect(consolidatedItems[0].id).toBe("p1"); // p1 bleibt erhalten!
    expect(report.prunedIds).toContain("e1"); // e1 wurde entsorgt!
  });
});
