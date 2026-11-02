/**
 * AI Influenza Team — Video-Paket (Sprint 6).
 *
 * Baut aus einem Skript ein pruefbares Reel-Paket: Szenen mit Zeitfenstern,
 * SRT-Untertitel, Plattformvarianten und Freigabestatus. Die Regeln kommen
 * aus dem vorhandenen Reel-Storyboard-Validator; hier wird nichts gelockert.
 * Das Paket veroeffentlicht nie selbst, sondern endet hoechstens in
 * "ready-to-publish" und wartet auf die bestehende Publishing-Freigabe.
 */
import { validateReelStoryboard, type ReelStoryboardScene } from "./reel-storyboard-logic";

export type AiInfluenzaVideoVariant = {
  platform: "reels" | "shorts" | "tiktok";
  aspectRatio: "9:16";
  maxDurationSeconds: number;
};

export const AI_INFLUENZA_VIDEO_VARIANTS: AiInfluenzaVideoVariant[] = [
  { platform: "reels", aspectRatio: "9:16", maxDurationSeconds: 30 },
  { platform: "shorts", aspectRatio: "9:16", maxDurationSeconds: 30 },
  { platform: "tiktok", aspectRatio: "9:16", maxDurationSeconds: 30 },
];

const MAX_REEL_SECONDS = 30;
const MAX_WORDS_PER_SECOND = 3;
const MAX_SUBTITLE_CHARS_PER_SECOND = 22;

export type AiInfluenzaVideoPackage = {
  orderId: string;
  taskLabel: string;
  status: "awaiting-approval" | "ready-to-publish";
  scenes: ReelStoryboardScene[];
  durationSeconds: number;
  subtitlesSrt: string;
  variants: AiInfluenzaVideoVariant[];
  approval: { approvedBy: string; approvedAt: string } | null;
  publishingTriggered: false;
  notes: string[];
};

/** Zerlegt ein Skript in Zeilen. "Text ||| Bildidee" trennt Voiceover und Visual. */
export function parseScriptLines(script: string): { voiceover: string; visual: string | null }[] {
  return script
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [voice, visual] = line.split("|||").map((part) => part.trim());
      return { voiceover: voice, visual: visual && visual.length > 0 ? visual : null };
    });
}

/** Zeit je Szene aus Lesbarkeit und Sprechbarkeit ableiten, nie unter 2 Sekunden. */
export function sceneSecondsFor(voiceover: string, subtitles: string): number {
  const words = voiceover.trim().split(/\s+/).length;
  const chars = subtitles.length;
  const bySpeech = Math.ceil(words / MAX_WORDS_PER_SECOND);
  const byReading = Math.ceil(chars / MAX_SUBTITLE_CHARS_PER_SECOND);
  return Math.max(2, bySpeech, byReading);
}

export function buildScenes(lines: { voiceover: string; visual: string | null }[]): ReelStoryboardScene[] {
  let cursor = 0;
  return lines.map((line, index) => {
    const duration = sceneSecondsFor(line.voiceover, line.voiceover);
    const scene: ReelStoryboardScene = {
      startSeconds: cursor,
      endSeconds: cursor + duration,
      voiceover: line.voiceover,
      subtitles: line.voiceover,
      visual: line.visual ?? "Sprecher-Szene mit Markenfarbe",
    };
    cursor = scene.endSeconds;
    return scene;
  });
}

export function buildSrt(scenes: ReelStoryboardScene[]): string {
  return scenes
    .map((scene, index) =>
      [
        String(index + 1),
        `${srtTime(scene.startSeconds)} --> ${srtTime(scene.endSeconds)}`,
        scene.subtitles,
        "",
      ].join("\n"),
    )
    .join("\n");
}

function srtTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)},000`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function buildAiInfluenzaVideoPackage(input: {
  orderId: string;
  taskLabel: string;
  script: string;
}): AiInfluenzaVideoPackage {
  const scenes = buildScenes(parseScriptLines(input.script));
  const validation = validateReelStoryboard(scenes);
  const base = {
    orderId: input.orderId,
    taskLabel: input.taskLabel,
    scenes,
    variants: AI_INFLUENZA_VIDEO_VARIANTS,
    approval: null,
    publishingTriggered: false as const,
  };
  if (!validation.ok) {
    return {
      ...base,
      status: "awaiting-approval",
      durationSeconds: scenes.at(-1)?.endSeconds ?? 0,
      subtitlesSrt: buildSrt(scenes),
      notes: [`Paket unvollstaendig: ${validation.reason}`],
    };
  }
  const notes: string[] = [];
  if (validation.durationSeconds > MAX_REEL_SECONDS) {
    notes.push(`Gesamtdauer ${validation.durationSeconds}s ueberschreitet ${MAX_REEL_SECONDS}s.`);
  }
  for (const variant of AI_INFLUENZA_VIDEO_VARIANTS) {
    if (validation.durationSeconds > variant.maxDurationSeconds) {
      notes.push(`Zu lang fuer ${variant.platform}: ${validation.durationSeconds}s > ${variant.maxDurationSeconds}s.`);
    }
  }
  return {
    ...base,
    status: "awaiting-approval",
    durationSeconds: validation.durationSeconds,
    subtitlesSrt: buildSrt(scenes),
    notes,
  };
}

/** Freigabe setzt den Status, veroeffentlicht aber nichts. */
export function approveAiInfluenzaVideoPackage(
  pkg: AiInfluenzaVideoPackage,
  input: { approvedBy: string; approvedAt: string },
): AiInfluenzaVideoPackage {
  const approver = input.approvedBy.trim();
  if (!approver) throw new Error("Freigabe braucht eine Person.");
  if (pkg.notes.some((note) => note.startsWith("Paket unvollstaendig"))) {
    throw new Error("Unvollstaendiges Paket kann nicht freigegeben werden.");
  }
  if (!pkg.subtitlesSrt.trim()) throw new Error("Paket ohne Untertitel kann nicht freigegeben werden.");
  if (!validateReelStoryboard(pkg.scenes).ok) throw new Error("Szenen verletzen die Reel-Regeln.");
  return {
    ...pkg,
    status: "ready-to-publish",
    approval: { approvedBy: approver, approvedAt: input.approvedAt },
    publishingTriggered: false,
  };
}
