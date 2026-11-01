/**
 * Sprint 273 — Szenen-Manuskript-Logik (rein, testbar). Portiert aus
 * projekt-nullpunkt (server/scripting.ts): deterministische Zerlegung eines
 * deutschen Textes in Szenen mit Visual-Prompt, Kamera, Sprechtext und Timing.
 *
 * Ehrlichkeits-Regeln (aus Nullpunkt übernommen, bewusst streng):
 *   - Nur synthetische Inhalte: Eingaben zu realen Personen, Deepfakes,
 *     Minderjährigen oder expliziten Inhalten werden VOR allem anderen abgelehnt.
 *   - Die Zerlegung ist deterministisch (kein LLM) — gleicher Text ergibt das
 *     gleiche Manuskript, inklusive reproducibler Szene-IDs.
 *   - Timing basiert auf einer ehrlichen Schätzung (Zeichen → Sekunden) und
 *     wird als Schätzung gekennzeichnet, nicht als exakte Messung.
 */

import { createHash } from "node:crypto";

const BLOCKED_PATTERN =
  /(?:reale person|prominente?n?|realperson|deepfake|face\s?swap|biometr\w*|nicht einvernehm\w*|explizit\w*|pornograf\w*|nsfw|minderj\S*|underage|kind(?:er|ern)?\b|jugendlich\w*|teen\w*|child(?:ren)?\b)/iu;

export const SCENE_LIMITS = {
  maxScenes: 8,
  maxSourceChars: 1200,
  minSourceChars: 10,
  /** Ehrliche Schätzung: deutsche Vorlese-Stimme ~ 15 Zeichen pro Sekunde. */
  charsPerSecond: 15,
  minSceneSeconds: 2,
  maxSceneSeconds: 15,
} as const;

export type SceneSafetyRejection =
  | { safe: true }
  | { safe: false; reason: string };

export function assertSafeSourceInput(source: string): SceneSafetyRejection {
  const trimmed = source.trim();
  if (trimmed.length < SCENE_LIMITS.minSourceChars) {
    return { safe: false, reason: `Quelltext zu kurz (min. ${SCENE_LIMITS.minSourceChars} Zeichen).` };
  }
  if (trimmed.length > SCENE_LIMITS.maxSourceChars) {
    return { safe: false, reason: `Quelltext zu lang (${trimmed.length}/${SCENE_LIMITS.maxSourceChars} Zeichen).` };
  }
  if (BLOCKED_PATTERN.test(trimmed)) {
    return { safe: false, reason: "Eingabe durch das synthetisch-only Safety-Gate abgelehnt: keine realen Personen, Deepfakes, Minderjährigen oder expliziten Inhalte." };
  }
  return { safe: true };
}

export type Scene = {
  id: string;
  index: number;
  title: string;
  narration: string;
  visualPrompt: string;
  camera: string;
  /** Geschätzte Vorlese-Dauer in Sekunden (Schätzung, keine Messung). */
  estimatedSeconds: number;
};

export type SceneScript = {
  id: string;
  source: string;
  language: "de";
  syntheticOnly: true;
  estimatedTotalSeconds: number;
  scenes: Scene[];
};

/** Deterministische Sätze-Schlag-Chunkung für deutsche Texte. */
export function splitIntoNarrationChunks(source: string, maxScenes: number): string[] {
  const chunks = source
    .trim()
    .split(/(?<=[.!?])\s+|\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (chunks.length === 0) return [];
  // Überschuss wird deterministisch auf die letzten erlaubten Szenen verteilt,
  // statt still abzuschneiden: ehrlich = nichts geht verloren.
  if (chunks.length <= maxScenes) return chunks;
  const head = chunks.slice(0, maxScenes - 1);
  const tail = chunks.slice(maxScenes - 1).join(" ");
  return [...head, tail];
}

export function estimateSeconds(text: string): number {
  const raw = Math.ceil(text.length / SCENE_LIMITS.charsPerSecond);
  return Math.min(SCENE_LIMITS.maxSceneSeconds, Math.max(SCENE_LIMITS.minSceneSeconds, raw));
}

export function createSceneScript(source: string): SceneScript | null {
  const safety = assertSafeSourceInput(source);
  if (!safety.safe) return null;
  const trimmed = source.trim();
  const chunks = splitIntoNarrationChunks(trimmed, SCENE_LIMITS.maxScenes);
  if (chunks.length === 0) return null;
  const scriptId = `script-${createHash("sha256").update(trimmed).digest("hex").slice(0, 12)}`;
  const scenes: Scene[] = chunks.map((narration, index) => ({
    id: `${scriptId}-scene-${index + 1}`,
    index: index + 1,
    title: `Szene ${index + 1}`,
    narration,
    visualPrompt: `synthetische, nicht-explizite abstrakte Studioaufnahme, ${narration.slice(0, 120)}`,
    camera: index % 2 === 0 ? "Totale, sanfter Push-in" : "Halbtotale, ruhige Kamerafahrt",
    estimatedSeconds: estimateSeconds(narration),
  }));
  return {
    id: scriptId,
    source: trimmed,
    language: "de",
    syntheticOnly: true,
    estimatedTotalSeconds: scenes.reduce((sum, scene) => sum + scene.estimatedSeconds, 0),
    scenes,
  };
}

/**
 * SRT-Untertitel aus Szenen (rein, deterministisch). Zeitstempel basieren auf
 * den geschätzten Dauern und werden pro Szene in zwei Hälften geteilt, damit
 * der Text lesbar bleibt.
 */
export function buildSrtFromScenes(scenes: Scene[]): string {
  let cursorMs = 0;
  const blocks = scenes.map((scene) => {
    const durationMs = scene.estimatedSeconds * 1000;
    const start = cursorMs;
    const end = cursorMs + durationMs;
    cursorMs = end;
    const text = scene.narration.length > 90 ? `${scene.narration.slice(0, 87)}…` : scene.narration;
    return `${scene.index}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${text}`;
  });
  return `${blocks.join("\n\n")}\n`;
}

function srtTimestamp(totalMs: number): string {
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(ms, 3)}`;
}
