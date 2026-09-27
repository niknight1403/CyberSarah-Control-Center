import { describe, expect, it } from "vitest";

import {
  SCENE_LIMITS,
  assertSafeSourceInput,
  buildSrtFromScenes,
  createSceneScript,
  estimateSeconds,
  splitIntoNarrationChunks,
} from "../lib/scene-script-logic";

describe("Safety-Gate (Sprint 273, aus projekt-nullpunkt portiert)", () => {
  it("lehnt Eingaben zu realen Personen, Deepfakes, Minderjährigen und Explizitem ab", () => {
    expect(assertSafeSourceInput("Ein Deepfake von einer realen Person, der sehr lange ist.").safe).toBe(false);
    expect(assertSafeSourceInput("Explizite Inhalte mit pornografischem Bezug,足够 lang.").safe).toBe(false);
    expect(assertSafeSourceInput("Ein Video über minderjährige Teenager, die viel zu lang ist.").safe).toBe(false);
  });

  it("lehnt zu kurze und zu lange Quelltexte ab", () => {
    expect(assertSafeSourceInput("zu kurz").safe).toBe(false);
    expect(assertSafeSourceInput("x".repeat(SCENE_LIMITS.maxSourceChars + 1)).safe).toBe(false);
  });

  it("akzeptiert harmlosen synthetischen Inhalt", () => {
    expect(assertSafeSourceInput("Künstliche Intelligenz verändert die Arbeitswelt. Dieser Text ist lang genug.").safe).toBe(true);
  });
});

describe("Szenen-Manuskript (Sprint 273)", () => {
  it("zerlegt deterministisch in Sätze und begrenzt die Szenenzahl ohne Datenverlust", () => {
    const source = "Satz eins. Satz zwei. Satz drei. Satz vier. Satz fünf. Satz sechs. Satz sieben. Satz acht. Satz neun. Satz zehn.";
    const chunks = splitIntoNarrationChunks(source, SCENE_LIMITS.maxScenes);
    expect(chunks.length).toBe(SCENE_LIMITS.maxScenes);
    // Der letzte Chunk trägt den Überschuss — nichts geht verloren.
    expect(chunks[chunks.length - 1]).toContain("Satz neun.");
    expect(chunks[chunks.length - 1]).toContain("Satz zehn.");
  });

  it("erzeugt ein vollständiges, reproducibles Manuskript", () => {
    const source = "Künstliche Intelligenz verändert die Arbeitswelt. Agenten übernehmen Routineaufgaben. Menschen behalten die Regie.";
    const first = createSceneScript(source);
    const second = createSceneScript(source);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.id).toBe(second?.id);
    expect(first?.scenes.length).toBe(3);
    expect(first?.syntheticOnly).toBe(true);
    expect(first?.scenes[0].estimatedSeconds).toBeGreaterThanOrEqual(SCENE_LIMITS.minSceneSeconds);
  });

  it("schätzt Daueren ehrlich innerhalb der Grenzen", () => {
    expect(estimateSeconds("x".repeat(100))).toBeLessThanOrEqual(SCENE_LIMITS.maxSceneSeconds);
    expect(estimateSeconds("kurz")).toBe(SCENE_LIMITS.minSceneSeconds);
  });
});

describe("SRT-Untertitel (Sprint 273)", () => {
  it("baut valide SRT-Blöcke mit aufsteigenden Zeitstempeln", () => {
    const script = createSceneScript("Erster Satz mit genug Inhalt. Zweiter Satz mit genug Inhalt. Dritter Satz mit genug Inhalt.");
    expect(script).not.toBeNull();
    const srt = buildSrtFromScenes(script!.scenes);
    expect(srt).toMatch(/^1\n00:00:00,000 --> /);
    expect(srt).toContain(" --> ");
    expect(srt).toContain("2\n00:00:");
    expect(srt.trim().split("\n\n").length).toBe(3);
  });
});
