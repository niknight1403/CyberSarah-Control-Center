/**
 * Sprint 310 — Tests fuer SRT-Untertitel-Export.
 */
import { describe, it, expect } from "vitest";
import {
  formatSrtTimecode,
  buildSrtBlock,
  buildSrt,
  buildSrtFileName,
  validateSrt,
  SRT_HONESTY_HEADER,
} from "@/lib/srt-export-logic";
import type { Scene } from "@/lib/scene-script-logic";

const scene = (id: string, narration: string, seconds: number): Scene => ({
  id,
  index: 0,
  title: id,
  narration,
  visualPrompt: "v",
  camera: "front",
  estimatedSeconds: seconds,
});

describe("Sprint 310 — SRT Export Logic", () => {
  it("formatiert Zeitstempel im SRT-Format HH:MM:SS,mmm", () => {
    expect(formatSrtTimecode(0)).toBe("00:00:00,000");
    expect(formatSrtTimecode(3661.5)).toBe("01:01:01,500");
    expect(formatSrtTimecode(-5)).toBe("00:00:00,000");
  });

  it("baut korrekte Bloecke mit Index, Fenster und Text", () => {
    const block = buildSrtBlock(2, 5, 10, " Hallo ");
    expect(block).toBe("2\n00:00:05,000 --> 00:00:10,000\nHallo");
  });

  it("baut eine lueckenlose SRT-Sequenz aus Szenen", () => {
    const srt = buildSrt([scene("a", "Eins.", 3), scene("b", "Zwei.", 4)]);
    const blocks = srt.split("\n\n");
    expect(blocks[0].startsWith("1\n")).toBe(true);
    expect(blocks[1].startsWith("2\n")).toBe(true);
    expect(blocks[1]).toContain("00:00:03,000 --> 00:00:07,000");
    expect(srt).toContain(SRT_HONESTY_HEADER);
  });

  it("leerer Skript-Eingang erzeugt valide, leere Datei mit Hinweis", () => {
    const srt = buildSrt([]);
    expect(srt).toContain(SRT_HONESTY_HEADER);
    expect(validateSrt(srt).valid).toBe(false);
  });

  it("buildSrtFileName bereinigt unsichere Zeichen", () => {
    expect(buildSrtFileName("projekt 1/x")).toBe("projekt-1-x.srt");
  });

  it("validateSrt findet Index-Luecken und leere Texte", () => {
    const bad = "2\n00:00:00,000 --> 00:00:01,000\nText\n";
    const v = validateSrt(bad);
    expect(v.valid).toBe(false);
    expect(v.issues.some((i) => i.includes("Index"))).toBe(true);

    const good = buildSrt([scene("a", "Eins.", 2)]);
    expect(validateSrt(good).valid).toBe(true);
  });
});
