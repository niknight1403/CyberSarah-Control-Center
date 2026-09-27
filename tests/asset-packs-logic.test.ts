import { describe, expect, it } from "vitest";
import {
  ASSET_PACK_KINDS,
  composeSceneImagePrompt,
  describePacksInNote,
  packGradientForScene,
  parseStoredPacks,
  pickActivePacks,
  packsSignature,
  validateAssetPackInput,
} from "../lib/asset-packs-logic";

const outfitPack = {
  id: "pack_outfit",
  kind: "outfit" as const,
  name: "Business-Look",
  promptModifiers: ["dunkles Kostüm", "goldene Uhr"],
  fallbackColors: ["111827", "7c3aed"] as [string, string],
  active: true,
  createdAt: 1,
};

const setsPack = {
  id: "pack_sets",
  kind: "sets" as const,
  name: "Skyline bei Nacht",
  promptModifiers: ["Stadtsilhouette", "Neonlichter"],
  fallbackColors: ["0f172a", "38bdf8"] as [string, string],
  active: true,
  createdAt: 2,
};

describe("Asset-Packs (Sprint 279) — Validierung", () => {
  it("nimmt gültige Outfit- und Sets-Eingaben an", () => {
    for (const kind of ASSET_PACK_KINDS) {
      const result = validateAssetPackInput({
        kind,
        name: "Test-Pack",
        promptModifiers: ["erstes Merkmal", "zweites Merkmal"],
        fallbackColors: ["1e293b", "7c3aed"],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.pack.kind).toBe(kind);
        expect(result.pack.active).toBe(true);
        expect(result.pack.promptModifiers).toHaveLength(2);
      }
    }
  });

  it("lehnt unbekannte Arten, leere Namen und kaputte Farben ab", () => {
    expect(validateAssetPackInput({ kind: "hut", name: "x", promptModifiers: ["a"], fallbackColors: ["1e293b", "7c3aed"] }).ok).toBe(false);
    expect(validateAssetPackInput({ kind: "outfit", name: "ab", promptModifiers: ["a"], fallbackColors: ["1e293b", "7c3aed"] }).ok).toBe(false);
    expect(validateAssetPackInput({ kind: "outfit", name: "Test", promptModifiers: [], fallbackColors: ["1e293b", "7c3aed"] }).ok).toBe(false);
    expect(validateAssetPackInput({ kind: "outfit", name: "Test", promptModifiers: ["a"], fallbackColors: ["#1e293b", "7c3aed"] }).ok).toBe(false);
  });

  it("bereinigt doppelte Modifikatoren deterministisch", () => {
    const result = validateAssetPackInput({
      kind: "sets",
      name: "Duplikate",
      promptModifiers: ["Neonlichter", "Neonlichter", "Regen"],
      fallbackColors: ["1e293b", "7c3aed"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.pack.promptModifiers).toEqual(["Neonlichter", "Regen"]);
  });
});

describe("Asset-Packs — Auswahl & Prompt-Komposition", () => {
  it("wählt deterministisch das älteste aktive Pack pro Art", () => {
    const newer = { ...outfitPack, id: "pack_outfit2", createdAt: 99 };
    const picked = pickActivePacks([newer, outfitPack, { ...setsPack, active: false }]);
    expect(picked.outfit?.id).toBe("pack_outfit");
    expect(picked.sets).toBeNull();
  });

  it("hängt Outfit- und Sets-Modifikatoren an den Basis-Prompt", () => {
    const composed = composeSceneImagePrompt("Stadtszene am Abend", { outfit: outfitPack, sets: setsPack });
    expect(composed).toContain("Outfit: dunkles Kostüm, goldene Uhr");
    expect(composed).toContain("Set: Stadtsilhouette, Neonlichter");
    expect(composed.startsWith("Stadtszene am Abend")).toBe(true);
  });

  it("lässt den Basis-Prompt unberührt, wenn keine Packs aktiv sind", () => {
    expect(composeSceneImagePrompt("Basis", { outfit: null, sets: null })).toBe("Basis");
  });

  it("kürzt ehrlich am Cap statt still zu übernehmen", () => {
    const longBase = "a".repeat(880);
    const composed = composeSceneImagePrompt(longBase, { outfit: outfitPack, sets: setsPack });
    expect(composed.length).toBeLessThanOrEqual(900);
    expect(composed.startsWith(longBase)).toBe(true);
  });
});

describe("Asset-Packs — Gradient-Fallback & Persistenz", () => {
  it("rotiert Pack-Farben deterministisch pro Szenen-Index", () => {
    const packs = { outfit: outfitPack, sets: setsPack };
    const evenScene = packGradientForScene(packs, 0);
    const oddScene = packGradientForScene(packs, 1);
    expect(evenScene).toEqual({ from: "0f172a", to: "38bdf8" });
    expect(oddScene).toEqual({ from: "7c3aed", to: "111827" });
  });

  it("liefert Standard-Farben ohne Packs", () => {
    expect(packGradientForScene({ outfit: null, sets: null }, 3)).toEqual({ from: "1e293b", to: "7c3aed" });
  });

  it("verwirft kaputte Speicher-Einträge und behält gültige", () => {
    const parsed = parseStoredPacks([outfitPack, { id: "kaputt" }, null, { ...setsPack, kind: "unsinn" }]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("pack_outfit");
  });

  it("beschreibt die gewirksamen Packs ehrlich im Ergebnis-Text", () => {
    expect(describePacksInNote({ outfit: outfitPack, sets: setsPack })).toContain('Outfit-Pack "Business-Look"');
    expect(describePacksInNote({ outfit: null, sets: null })).toBe("keine Packs");
  });
});

describe("Asset-Packs — Cache-Signatur (Sprint 282)", () => {
  it("macht gleiche Packs stabilit und andere Packs unterscheidbar", () => {
    const a = packsSignature({ outfit: outfitPack, sets: setsPack });
    const b = packsSignature({ outfit: { ...outfitPack }, sets: { ...setsPack } });
    const c = packsSignature({ outfit: null, sets: setsPack });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
