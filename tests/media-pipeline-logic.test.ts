import { writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  generateVideoForUser,
  renderVideoRun,
} from "../server/media-pipeline";
import {
  type VideoAssembler,
  type VideoCacheAdapter,
  type VideoCacheEntry,
} from "../lib/video-assembly-logic";
import { DEFAULT_TTS_VOICE } from "../lib/tts-logic";

function memoryCache(): VideoCacheAdapter & { data: Map<string, VideoCacheEntry> } {
  const data = new Map<string, VideoCacheEntry>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, entry) => { data.set(key, entry); },
  };
}

/**
 * Fake-Assembler, der wie der echte ffmpeg aussieht: er schreibt echte
 * (kleine) Dateien an die Ausgabe-Pfade — nur so liest der Orchestrierer
 * realistische Bytes zurück.
 */
function fakeAssembler(): VideoAssembler & { sceneRenders: number; concats: number; badRender: boolean } {
  const state = { sceneRenders: 0, concats: 0, badRender: false };
  return {
    get sceneRenders() { return state.sceneRenders; },
    get concats() { return state.concats; },
    get badRender() { return state.badRender; },
    set badRender(value: boolean) { state.badRender = value; },
    renderScene: async (args: { outputPath: string }) => {
      if (state.badRender) return { ok: false, reason: "ffmpeg-Szenen-Render fehlgeschlagen: Testfehler" };
      state.sceneRenders += 1;
      await writeFile(args.outputPath, Buffer.from("scene"));
      return { ok: true };
    },
    concat: async (input: { outputPath: string }) => {
      state.concats += 1;
      await writeFile(input.outputPath, Buffer.from("final-video-bytes"));
      return { ok: true };
    },
  };
}

async function okTts() {
  return async () => ({
    ok: true as const,
    source: "provider" as const,
    base64Mp3: Buffer.from("mp3").toString("base64"),
    bytes: 3,
    note: "ok",
  });
}

const VALID_TEXT = "Künstliche Intelligenz verändert die Arbeitswelt. Agenten übernehmen Routineaufgaben zuverlässig. Menschen behalten die Regie.";

describe("Render-Lauf mit injizierten Abhängigkeiten (Sprint 275)", () => {
  it("rendert jede Szene genau einmal und verkettet zum Schluss", async () => {
    const assembler = fakeAssembler();
    const result = await renderVideoRun({ text: VALID_TEXT, voice: DEFAULT_TTS_VOICE }, {
      cache: memoryCache(),
      assembler,
      synthesize: await okTts(),
    });
    expect(result.ok).toBe(true);
    expect(assembler.sceneRenders).toBe(3);
    expect(assembler.concats).toBe(1);
    if (result.ok) {
      expect(result.source).toBe("render");
      expect(result.dataUrl).toContain("data:video/mp4;base64,");
      expect(result.sceneCount).toBe(3);
    }
  });

  it("lehnt blockierte Eingaben vor jedem Rendern ab", async () => {
    const assembler = fakeAssembler();
    const result = await renderVideoRun({ text: "Ein Deepfake von einer realen Person mit sehr viel Text drin.", voice: DEFAULT_TTS_VOICE }, {
      cache: memoryCache(),
      assembler,
      synthesize: await okTts(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("abgelehnt");
    expect(assembler.sceneRenders).toBe(0);
  });

  it("gibt TTS-Fehler ehrlich mit Szenennummer weiter und rendert nicht weiter", async () => {
    const assembler = fakeAssembler();
    const result = await renderVideoRun({ text: VALID_TEXT, voice: DEFAULT_TTS_VOICE }, {
      cache: memoryCache(),
      assembler,
      synthesize: async () => ({ ok: false, reason: "Edge down", retryHint: "später" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Szene");
      expect(result.reason).toContain("Edge down");
    }
  });

  it("gibt Assembler-Fehler ehrlich weiter", async () => {
    const assembler = fakeAssembler();
    assembler.badRender = true;
    const result = await renderVideoRun({ text: VALID_TEXT, voice: DEFAULT_TTS_VOICE }, {
      cache: memoryCache(),
      assembler,
      synthesize: await okTts(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("ffmpeg-Szenen-Render");
  });
});

describe("generateVideoForUser Guards (Sprint 275)", () => {
  it("verlangt eine ausdrückliche Freigabe vor jedem Prüfschritt", async () => {
    const result = await generateVideoForUser("user-guard-test", { text: VALID_TEXT, approved: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Freigabe");
      expect(result.configured).toBe(true);
    }
  });
});
describe("Szenenbild-Integration (Sprint 276)", () => {
  it("nutzt FLUX-Bilder je Szene und zählt sie ehrlich", async () => {
    const assembler = fakeAssembler();
    const result = await renderVideoRun({ text: VALID_TEXT, voice: DEFAULT_TTS_VOICE }, {
      cache: memoryCache(),
      assembler,
      synthesize: await okTts(),
      sceneImage: async () => ({
        ok: true,
        dataUrl: `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
        source: "provider" as const,
        note: "ok",
      }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sceneImages).toEqual({ fluxImages: 3, gradientFallback: 0 });
      expect(result.note).toContain("3/3 Szenen mit echten FLUX-Bildern");
    }
  });

  it("fällt pro Szene auf die Farbverlauf-Bühne zurück, wenn das Bild scheitert", async () => {
    const assembler = fakeAssembler();
    const result = await renderVideoRun({ text: VALID_TEXT, voice: DEFAULT_TTS_VOICE }, {
      cache: memoryCache(),
      assembler,
      synthesize: await okTts(),
      sceneImage: async () => ({ ok: false, reason: "HF_TOKEN fehlt" }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sceneImages).toEqual({ fluxImages: 0, gradientFallback: 3 });
      expect(result.note).toContain("Farbverlauf");
    }
  });

  it("mischt erfolgreich gezählt: FLUX + Rückfall in einem Lauf", async () => {
    const assembler = fakeAssembler();
    let call = 0;
    const result = await renderVideoRun({ text: VALID_TEXT, voice: DEFAULT_TTS_VOICE }, {
      cache: memoryCache(),
      assembler,
      synthesize: await okTts(),
      sceneImage: async () => {
        call += 1;
        if (call === 1) return { ok: false, reason: "Ratelimit" };
        return { ok: true, dataUrl: "data:image/png;base64,cG5n", source: "provider" as const, note: "ok" };
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sceneImages).toEqual({ fluxImages: 2, gradientFallback: 1 });
      expect(result.note).toContain("1 mit Farbverlauf-Rückfall");
    }
  });
});
