/**
 * Sprint 274/275 — Medien-Pipeline-Orchestrierung: Text → Szenen-Manuskript
 * (Sprint 273) → TTS pro Szene (Sprint 272) → ffmpeg-Assembly (Sprint 274)
 * → 1080p-MP4 mit Untertiteln. Portiert aus projekt-nullpunkt, adaptiert auf
 * die Control-Center-Infrastruktur (Settings-KV-Cache, Tagesquoten, Freigabe).
 *
 * Ehrlichkeits-Regeln im Betrieb:
 *   - Ohne ffmpeg-Binary in der Laufzeitumgebung ist Video "nicht verfügbar" —
 *     mit klarer Ursache statt eines stillen Audio-only-Resultats.
 *   - Freigabe-Pflicht: kein Auto-Render.
 *   - Der Cache ist sichtbar: identischer Text + Stimme ergibt das identische
 *     Video, und die Antwort sagt ehrlich, woher es kam.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import * as db from "./db";
import { generateSceneImageForPipeline } from "./image-generation";
import { synthesizeSpeech } from "./tts";
import {
  DEFAULT_TTS_VOICE,
  TTS_LIMITS,
  type TtsVoice,
} from "../lib/tts-logic";
import { createSceneScript, buildSrtFromScenes, SCENE_LIMITS } from "../lib/scene-script-logic";
import {
  VIDEO_LIMITS,
  buildConcatFfmpegArgs,
  buildSceneFfmpegArgs,
  buildVideoCacheKey,
  type SceneImageStats,
  type VideoCacheAdapter,
  type VideoCacheEntry,
  type VideoCapabilityProbe,
  type VideoAssembler,
} from "../lib/video-assembly-logic";
import { listAssetPacksForUser } from "./asset-packs";
import {
  composeSceneImagePrompt,
  describePacksInNote,
  packGradientForScene,
  pickActivePacks,
  packsSignature,
  type AssetPack,
} from "../lib/asset-packs-logic";

const CACHE_KEY_PREFIX = "video.cache.";
const run = promisify(execFile);

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function kvCacheAdapter(): VideoCacheAdapter {
  return {
    get: async (key) => {
      const entry = await db.getModelRouterSetting<VideoCacheEntry>(`${CACHE_KEY_PREFIX}${key}`);
      return entry ?? null;
    },
    set: async (key, entry) => {
      await db.setModelRouterSetting(`${CACHE_KEY_PREFIX}${key}`, entry);
    },
  };
}

/** Ehrlicher Fähigkeits-Check: ist ffmpeg in dieser Umgebung installiert? */
export async function probeFfmpeg(): Promise<VideoCapabilityProbe> {
  try {
    const { stdout } = await run("ffmpeg", ["-version"], { timeout: 10_000 });
    const version = stdout.split("\n")[0]?.trim().slice(0, 80) ?? "unbekannte Version";
    return { available: true, version };
  } catch {
    return {
      available: false,
      reason: "ffmpeg ist in dieser Laufzeitumgebung nicht installiert — Video-Assembly ehrlich nicht verfügbar.",
    };
  }
}

/** Produktions-Assembler: ruft ffmpeg als Kind-Prozess auf. */
class FfmpegAssembler implements VideoAssembler {
  async renderScene(args: { audioPath: string; seconds: number; sceneId: string; gradientIndex: number; outputPath: string; imagePath?: string | null; gradientColors?: { from: string; to: string } | null }) {
    const argv = buildSceneFfmpegArgs({
      sceneId: args.sceneId,
      seconds: args.seconds,
      audioPath: args.audioPath,
      outputPath: args.outputPath,
      gradientIndex: args.gradientIndex,
      imagePath: args.imagePath ?? null,
      gradientColors: args.gradientColors ?? null,
    });
    try {
      await run("ffmpeg", argv, { timeout: 120_000 });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        reason: `ffmpeg-Szenen-Render fehlgeschlagen: ${error instanceof Error ? error.message.slice(0, 200) : "unbekannter Fehler"}`,
      };
    }
  }

  async concat(input: { sceneVideoPaths: string[]; srtPath: string; outputPath: string }) {
    const argv = buildConcatFfmpegArgs(input);
    if (!argv) return { ok: false as const, reason: "Keine Szenen-Videos zum Verketten." };
    try {
      await run("ffmpeg", argv, { timeout: 240_000 });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        reason: `ffmpeg-Verkettung fehlgeschlagen: ${error instanceof Error ? error.message.slice(0, 200) : "unbekannter Fehler"}`,
      };
    }
  }
}

export type GenerateVideoResult =
  | {
      ok: true;
      source: "cache" | "render";
      dataUrl: string;
      note: string;
      sceneCount: number;
      totalSeconds: number;
      sceneImages: SceneImageStats;
    }
  | { ok: false; reason: string; retryHint: string | null; configured: boolean };

export type SceneImageProvider = (
  prompt: string,
) => Promise<{ ok: true; dataUrl: string; source: "cache" | "provider"; note: string } | { ok: false; reason: string }>;

async function checkAndConsumeDailyQuota(openId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const key = `videogen.usage.${dayKey()}.${openId}`;
  const used = (await db.getModelRouterSetting<number>(key)) ?? 0;
  if (used >= VIDEO_LIMITS.maxDailyVideosPerUser) {
    return {
      ok: false,
      reason: `Tageslimit für Videos erreicht (${used}/${VIDEO_LIMITS.maxDailyVideosPerUser}) — resetzt nächste UTC-Mitternacht.`,
    };
  }
  await db.setModelRouterSetting(key, used + 1);
  return { ok: true };
}

/**
 * Der komplette Render-Lauf. Für Tests werden alle externen Abhängigkeiten
 * injizierbar gehalten (Assembler, TTS, Cache).
 */
export async function renderVideoRun(
  input: { text: string; voice: TtsVoice },
  deps: {
    cache: VideoCacheAdapter;
    assembler: VideoAssembler;
    synthesize: (text: string, voice: TtsVoice) => Promise<{ ok: true; source: "cache" | "provider"; base64Mp3: string; bytes: number; note: string } | { ok: false; reason: string; retryHint: string | null }>;
    sceneImage?: SceneImageProvider;
    /** Sprint 282: aktive Asset-Packs (Outfit/Sets) — null = keine. */
    packs?: { outfit: AssetPack | null; sets: AssetPack | null };
  },
): Promise<GenerateVideoResult> {
  const script = createSceneScript(input.text);
  if (!script) {
    return {
      ok: false,
      reason: "Quelltext wurde abgelehnt (Safety-Gate oder Länge) — siehe Szenen-Regeln.",
      retryHint: `Zwischen ${SCENE_LIMITS.minSourceChars} und ${SCENE_LIMITS.maxSourceChars} Zeichen, keine realen Personen, Deepfakes, Minderjährigen oder expliziten Inhalte.`,
      configured: true,
    };
  }
  if (script.estimatedTotalSeconds > VIDEO_LIMITS.maxTotalSeconds) {
    return {
      ok: false,
      reason: `Geschätzte Videodauer ${script.estimatedTotalSeconds}s übersteigt das Limit von ${VIDEO_LIMITS.maxTotalSeconds}s.`,
      retryHint: "Text kürzen.",
      configured: true,
    };
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "cybersarah-video-"));
  try {
    const audioPaths: string[] = [];
    const sceneVideoPaths: string[] = [];
    const imageStats: SceneImageStats = { fluxImages: 0, gradientFallback: 0 };
    for (const scene of script.scenes) {
      const audioResult = await deps.synthesize(scene.narration, input.voice);
      if (!audioResult.ok) {
        return { ok: false, reason: `TTS für Szene ${scene.index} fehlgeschlagen: ${audioResult.reason}`, retryHint: audioResult.retryHint, configured: true };
      }
      const audioPath = path.join(workDir, `${scene.id}.mp3`);
      await writeFile(audioPath, Buffer.from(audioResult.base64Mp3, "base64"));
      audioPaths.push(audioPath);

      // Sprint 276: FLUX-Szenenbild, wenn verfügbar — sonst ehrlicher
      // Farbverlauf-Rückfall pro Szene (niemals still, immer gezählt).
      const packs = deps.packs ?? { outfit: null, sets: null };
      const scenePrompt = composeSceneImagePrompt(scene.visualPrompt, packs);
      let imagePath: string | null = null;
      if (deps.sceneImage) {
        const imageResult = await deps.sceneImage(scenePrompt);
        if (imageResult.ok) {
          const imagePathCandidate = path.join(workDir, `${scene.id}.png`);
          const base64 = imageResult.dataUrl.slice(imageResult.dataUrl.indexOf(",") + 1);
          await writeFile(imagePathCandidate, Buffer.from(base64, "base64"));
          imagePath = imagePathCandidate;
          imageStats.fluxImages += 1;
        } else {
          imageStats.gradientFallback += 1;
        }
      } else {
        imageStats.gradientFallback += 1;
      }

      const outputPath = path.join(workDir, `${scene.id}.mp4`);
      const rendered = await deps.assembler.renderScene({
        audioPath,
        seconds: scene.estimatedSeconds,
        sceneId: scene.id,
        gradientIndex: scene.index,
        outputPath,
        imagePath,
        // Pack-Farben wirken nur im Gradient-Rückfall — mit echtem FLUX-Bild
        // hat die Bühne keine Wirkung. Beides wird ehrlich gezählt.
        gradientColors: packGradientForScene(packs, scene.index),
      });
      if (!rendered.ok) {
        return { ok: false, reason: rendered.reason, retryHint: "Szenen-Render erneut versuchen.", configured: true };
      }
      sceneVideoPaths.push(outputPath);
    }

    const srtPath = path.join(workDir, "subtitles.srt");
    await writeFile(srtPath, buildSrtFromScenes(script.scenes), "utf8");
    const finalPath = path.join(workDir, "final.mp4");
    const concatenated = await deps.assembler.concat({ sceneVideoPaths, srtPath, outputPath: finalPath });
    if (!concatenated.ok) {
      return { ok: false, reason: concatenated.reason, retryHint: "Erneut senden.", configured: true };
    }

    const { readFile } = await import("node:fs/promises");
    const bytes = await readFile(finalPath);
    if (bytes.byteLength === 0) return { ok: false, reason: "ffmpeg lieferte ein leeres Video.", retryHint: "Erneut senden.", configured: true };
    if (bytes.byteLength > VIDEO_LIMITS.maxVideoBytes) {
      return { ok: false, reason: `Video überschreitet die Größenobergrenze (${Math.round(bytes.byteLength / 1024 / 1024)} MB).`, retryHint: "Text kürzen.", configured: true };
    }
    const visualNote =
      imageStats.fluxImages > 0
        ? `${imageStats.fluxImages}/${script.scenes.length} Szenen mit echten FLUX-Bildern` +
          (imageStats.gradientFallback > 0 ? `, ${imageStats.gradientFallback} mit Farbverlauf-Rückfall (ehrlich gezählt)` : "")
        : `synthetische Farbverlauf-Bühne (Ken-Burns)${deps.sceneImage ? " — FLUX-Bilder aktuell nicht verfügbar" : ""}`;
    return {
      ok: true,
      source: "render",
      dataUrl: `data:video/mp4;base64,${bytes.toString("base64")}`,
      note: `${script.scenes.length} Szenen, ~${script.estimatedTotalSeconds}s, 1080p mit Untertiteln — ${visualNote}, Stimme ${input.voice}. ${describePacksInNote(deps.packs ?? { outfit: null, sets: null })}.`,
      sceneCount: script.scenes.length,
      totalSeconds: script.estimatedTotalSeconds,
      sceneImages: imageStats,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function generateVideoForUser(
  openId: string,
  input: { text: string; voice?: string; approved: boolean },
): Promise<GenerateVideoResult> {
  const voice = (input.voice ?? DEFAULT_TTS_VOICE) as TtsVoice;
  const configured = true; // TTS ist kostenlos; ffmpeg wird beim ersten Render geprüft.

  if (!input.approved) {
    return { ok: false, reason: "Video-Generierung braucht deine ausdrückliche Freigabe — kein Auto-Render.", retryHint: null, configured };
  }

  const capability = await probeFfmpeg();
  if (!capability.available) {
    return { ok: false, reason: capability.reason, retryHint: null, configured: false };
  }

  const quota = await checkAndConsumeDailyQuota(openId);
  if (!quota.ok) return { ok: false, reason: quota.reason, retryHint: null, configured };

  const packs = pickActivePacks(await listAssetPacksForUser(openId));
  const cache = kvCacheAdapter();
  const cacheKey = buildVideoCacheKey({ source: input.text.trim(), voice, packsSignature: packsSignature(packs) });
  const cached = await cache.get(cacheKey);
  if (cached && cached.base64Mp4) {
    return {
      ok: true,
      source: "cache",
      dataUrl: `data:video/mp4;base64,${cached.base64Mp4}`,
      note: `Aus dem Video-Cache (${Math.round(cached.bytes / 1024 / 1024)} MB, ${cached.sceneCount} Szenen, ~${cached.totalSeconds}s).`,
      sceneCount: cached.sceneCount,
      totalSeconds: cached.totalSeconds,
      sceneImages: cached.sceneImages ?? { fluxImages: 0, gradientFallback: cached.sceneCount },
    };
  }

  const result = await renderVideoRun({ text: input.text, voice }, {
    cache,
    assembler: new FfmpegAssembler(),
    synthesize: synthesizeSpeech,
    sceneImage: generateSceneImageForPipeline,
    packs,
  });
  if (!result.ok) return result;

  await cache.set(cacheKey, {
    base64Mp4: result.dataUrl.slice(result.dataUrl.indexOf(",") + 1),
    bytes: Math.round((result.dataUrl.length * 3) / 4),
    createdAt: new Date().toISOString(),
    sceneCount: result.sceneCount,
    totalSeconds: result.totalSeconds,
    sceneImages: result.sceneImages,
  });
  return result;
}

/** Für die Integrations-Registry: ehrlicher Status der Medien-Pipeline. */
export async function mediaPipelineStatus() {
  const ffmpeg = await probeFfmpeg();
  return {
    video: {
      available: ffmpeg.available,
      detail: ffmpeg.available ? ffmpeg.version : ffmpeg.reason,
      limits: {
        maxScenes: SCENE_LIMITS.maxScenes,
        maxTotalSeconds: VIDEO_LIMITS.maxTotalSeconds,
        maxDailyVideosPerUser: VIDEO_LIMITS.maxDailyVideosPerUser,
        ttsTextMax: TTS_LIMITS.text.max,
      },
    },
  };
}
