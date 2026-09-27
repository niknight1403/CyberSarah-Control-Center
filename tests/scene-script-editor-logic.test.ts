/**
 * Sprint 307 — Tests fuer den Szenen-Skript-Editor.
 */
import { describe, it, expect } from "vitest";
import {
  editSceneTitle,
  editSceneNarration,
  adjustSceneSeconds,
  moveScene,
  recalcTotalSeconds,
  diffScenes,
  isDirty,
  revertToBaseline,
  SCENE_EDITOR_LIMITS,
} from "@/lib/scene-script-editor-logic";
import type { SceneScript } from "@/lib/scene-script-logic";

const script = (): SceneScript => ({
  id: "s1",
  source: "Quelle.",
  language: "de",
  syntheticOnly: true,
  estimatedTotalSeconds: 10,
  scenes: [
    { id: "a", index: 0, title: "Alpha", narration: "Eins.", visualPrompt: "v1", camera: "front", estimatedSeconds: 5 },
    { id: "b", index: 1, title: "Beta", narration: "Zwei.", visualPrompt: "v2", camera: "side", estimatedSeconds: 5 },
  ],
});

describe("Sprint 307 — Scene Script Editor Logic", () => {
  it("bearbeitet Titel mit Trim und Laengen-Clamp", () => {
    const s = editSceneTitle(script(), "a", "  Neuer Titel  ");
    expect(s.scenes[0].title).toBe("Neuer Titel");
    const long = editSceneTitle(script(), "a", "x".repeat(100));
    expect(long.scenes[0].title.length).toBeLessThanOrEqual(SCENE_EDITOR_LIMITS.maxTitleChars);
  });

  it("erzwingt Dauer-Grenzen beim Anpassen", () => {
    expect(adjustSceneSeconds(script(), "a", 0).scenes[0].estimatedSeconds).toBe(SCENE_EDITOR_LIMITS.minSeconds);
    expect(adjustSceneSeconds(script(), "a", 99).scenes[0].estimatedSeconds).toBe(SCENE_EDITOR_LIMITS.maxSeconds);
    expect(adjustSceneSeconds(script(), "a", 7.6).scenes[0].estimatedSeconds).toBe(8);
  });

  it("verschiebt Szenen ohne Loecher in der Reihenfolge", () => {
    const s = moveScene(script(), "b", 0);
    expect(s.scenes.map((x) => x.id)).toEqual(["b", "a"]);
    expect(s.scenes.map((x) => x.index)).toEqual([0, 1]);
    // Clamp an den Rand
    expect(moveScene(script(), "a", 5).scenes.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("recalcTotalSeconds aktualisiert die geschaetzte Summe", () => {
    const s = recalcTotalSeconds(adjustSceneSeconds(script(), "a", 12));
    expect(s.estimatedTotalSeconds).toBe(17);
  });

  it("diffScenes erkennt Titel-, Text-, Dauer- und Reorder-Aenderungen", () => {
    let edited = editSceneTitle(script(), "a", "Alpha 2");
    edited = adjustSceneSeconds(edited, "b", 7);
    edited = moveScene(edited, "b", 0);
    const changes = diffScenes(script(), edited);
    expect(changes.some((c) => c.field === "title")).toBe(true);
    expect(changes.some((c) => c.field === "estimatedSeconds")).toBe(true);
    expect(isDirty(script(), edited)).toBe(true);
    expect(isDirty(script(), script())).toBe(false);
  });

  it("revertToBaseline stellt die Basis vollstaendig wieder her", () => {
    const baseline = script();
    const edited = editSceneNarration(moveScene(baseline, "b", 0), "a", "Geaendert.");
    const reverted = revertToBaseline(baseline);
    expect(diffScenes(edited, reverted).length).toBeGreaterThan(0);
    expect(reverted.scenes.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("unbekannte Szenen-Ids sind No-Ops", () => {
    expect(editSceneTitle(script(), "gibtsnicht", "X").scenes[0].title).toBe("Alpha");
    expect(moveScene(script(), "gibtsnicht", 1).scenes.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
