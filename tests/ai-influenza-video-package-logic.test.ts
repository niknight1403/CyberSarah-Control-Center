import { describe, it, expect } from "vitest";
import {
  approveAiInfluenzaVideoPackage,
  buildAiInfluenzaVideoPackage,
  buildScenes,
  parseScriptLines,
  sceneSecondsFor,
} from "../lib/ai-influenza-video-package-logic";

const SCRIPT = [
  "Wir bauen Content, der Kunden bringt.",
  "Zwölf Kurzvideos pro Monat, ohne Agentur-Overhead.",
  "Jedes Video mit Skript, Untertiteln und Freigabe.",
  "Starter ab 299 Euro monatlich, jederzeit kündbar.",
].join("\n");

describe("AI Influenza Video-Paket", () => {
  it("zerlegt Skriptzeilen und trennt Bildideen", () => {
    const lines = parseScriptLines("- Erstes Thema ||| Handy im Bild\n2) Zweites Thema");
    expect(lines).toEqual([
      { voiceover: "Erstes Thema", visual: "Handy im Bild" },
      { voiceover: "Zweites Thema", visual: null },
    ]);
  });

  it("leitet Szenenzeit aus Sprech- und Lesbarkeit ab, mindestens zwei Sekunden", () => {
    expect(sceneSecondsFor("Kurz", "Kurz")).toBe(2);
    expect(sceneSecondsFor("a b c d e f g h i", "a b c d e f g h i")).toBe(3);
  });

  it("baut lückenlose Szene von 0 an", () => {
    const scenes = buildScenes(parseScriptLines(SCRIPT));
    expect(scenes[0].startSeconds).toBe(0);
    for (let i = 1; i < scenes.length; i += 1) {
      expect(scenes[i].startSeconds).toBe(scenes[i - 1].endSeconds);
    }
  });

  it("erzeugt ein freigabefähiges Paket mit SRT und ohne Veröffentlichung", () => {
    const pkg = buildAiInfluenzaVideoPackage({ orderId: "order-1", taskLabel: "Kurzvideos 1/12", script: SCRIPT });
    expect(pkg.status).toBe("awaiting-approval");
    expect(pkg.approval).toBeNull();
    expect(pkg.publishingTriggered).toBe(false);
    expect(pkg.notes).toEqual([]);
    expect(pkg.durationSeconds).toBeGreaterThan(0);
    expect(pkg.durationSeconds).toBeLessThanOrEqual(30);
    expect(pkg.subtitlesSrt).toContain("00:00:00,000 --> ");
    expect(pkg.subtitlesSrt.split("\n\n")[0]).toContain("Wir bauen Content");
  });

  it("markiert zu viele Szenen als unvollständig", () => {
    const pkg = buildAiInfluenzaVideoPackage({
      orderId: "order-2",
      taskLabel: "Kurzvideos 2/12",
      script: Array.from({ length: 9 }, (_, i) => `Szene ${i + 1}`).join("\n"),
    });
    expect(pkg.notes[0]).toContain("Paket unvollstaendig");
    expect(() => approveAiInfluenzaVideoPackage(pkg, { approvedBy: "admin", approvedAt: "2026-11-02T03:00:00Z" }))
      .toThrow(/Unvollstaendiges Paket/);
  });

  it("verweigert Freigabe ohne Person", () => {
    const pkg = buildAiInfluenzaVideoPackage({ orderId: "o", taskLabel: "l", script: SCRIPT });
    expect(() => approveAiInfluenzaVideoPackage(pkg, { approvedBy: "  ", approvedAt: "x" })).toThrow(/Person/);
  });

  it("Freigabe setzt ready-to-publish und veroeffentlicht nichts", () => {
    const pkg = buildAiInfluenzaVideoPackage({ orderId: "o", taskLabel: "l", script: SCRIPT });
    const approved = approveAiInfluenzaVideoPackage(pkg, { approvedBy: "niko", approvedAt: "2026-11-02T03:00:00Z" });
    expect(approved.status).toBe("ready-to-publish");
    expect(approved.approval).toEqual({ approvedBy: "niko", approvedAt: "2026-11-02T03:00:00Z" });
    expect(approved.publishingTriggered).toBe(false);
  });

  it("SRT nummeriert fortlaufend", () => {
    const pkg = buildAiInfluenzaVideoPackage({ orderId: "o", taskLabel: "l", script: SCRIPT });
    const blocks = pkg.subtitlesSrt.trim().split("\n\n");
    expect(blocks.map((b) => b.split("\n")[0])).toEqual(["1", "2", "3", "4"]);
  });
});
