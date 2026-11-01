import { beforeEach, describe, expect, it, vi } from "vitest";
import { setModelRouterKvForTests } from "../server/db";

const { createAssetPack, deleteAssetPack, listAssetPacksForUser, setAssetPackActive, activePacksForUser } =
  await import("../server/asset-packs");

const USER = "user-open-id";

beforeEach(() => {
  setModelRouterKvForTests(new Map());
  vi.unstubAllEnvs();
});

describe("Asset-Pack-Service (Sprint 280)", () => {
  it("legt Packs an und erzwingt genau ein aktives Pack pro Art", async () => {
    const first = await createAssetPack(USER, {
      kind: "outfit",
      name: "Business-Look",
      promptModifiers: ["dunkles Kostüm"],
      fallbackColors: ["111827", "7c3aed"],
    });
    expect(first.ok).toBe(true);

    const second = await createAssetPack(USER, {
      kind: "outfit",
      name: "Streetwear",
      promptModifiers: ["Hoodie", "Sneaker"],
      fallbackColors: ["0f172a", "38bdf8"],
    });
    expect(second.ok).toBe(true);

    const packs = await listAssetPacksForUser(USER);
    expect(packs).toHaveLength(2);
    const active = await activePacksForUser(USER);
    expect(active.outfit?.name).toBe("Streetwear");
    expect(active.outfit?.active).toBe(true);
    const inactive = packs.find((p) => p.name === "Business-Look");
    expect(inactive?.active).toBe(false);
  });

  it("lehnt kaputte Eingaben und ein Überschreiten der Pack-Grenze ab", async () => {
    const bad = await createAssetPack(USER, { kind: "hut", name: "x", promptModifiers: [], fallbackColors: [] });
    expect(bad.ok).toBe(false);

    for (let i = 0; i < 12; i += 1) {
      const created = await createAssetPack(USER, {
        kind: "sets",
        name: `Set ${i + 1}`,
        promptModifiers: [`Beschreibung ${i + 1}`],
        fallbackColors: ["1e293b", "7c3aed"],
      });
      expect(created.ok).toBe(true);
    }
    const tooMany = await createAssetPack(USER, {
      kind: "sets",
      name: "Dreizehntes Set",
      promptModifiers: ["zu viel"],
      fallbackColors: ["1e293b", "7c3aed"],
    });
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error).toContain("Maximal");
  });

  it("schaltet Packs aktiv/deaktiv und löscht sie — mit ehrlicher Fehlermeldung bei unbekannter ID", async () => {
    const created = await createAssetPack(USER, {
      kind: "sets",
      name: "Skyline",
      promptModifiers: ["Neonlichter"],
      fallbackColors: ["0f172a", "38bdf8"],
    });
    expect(created.ok).toBe(true);
    const pack = (await listAssetPacksForUser(USER))[0];

    const off = await setAssetPackActive(USER, pack.id, false);
    expect(off.ok).toBe(true);
    expect((await activePacksForUser(USER)).sets).toBeNull();

    const on = await setAssetPackActive(USER, pack.id, true);
    expect(on.ok).toBe(true);
    expect((await activePacksForUser(USER)).sets?.id).toBe(pack.id);

    const removed = await deleteAssetPack(USER, pack.id);
    expect(removed.ok).toBe(true);
    expect(await listAssetPacksForUser(USER)).toHaveLength(0);

    const unknown = await deleteAssetPack(USER, "pack_gibts_nicht");
    expect(unknown.ok).toBe(false);
  });
});
