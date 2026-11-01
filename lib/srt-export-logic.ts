/**
 * Sprint 310 — Untertitel-Export: reine, deterministische Logik fuer
 * SRT aus dem Szenen-Skript mit Zeitmarken aus der TTS-Dauer-Schaetzung.
 *
 * Datenfluss:
 *   Szenen (narration + estimatedSeconds) werden zu sequenziellen SRT-
 *   Bloecken mit fortlaufenden Zeitmarken — komplett berechnet.
 *
 * Ehrlichkeits-Grenze: Die Zeitmarken beruhen auf der GESCHAETZTEN
 *   Vorlese-Dauer, nicht auf einer echten TTS-Messung. Bei Abweichung
 *   verschieben sich Untertitel — der Export markiert das im Header.
 */

import type { Scene } from "./scene-script-logic";

export const SRT_HONESTY_HEADER =
  "Hinweis: Zeitmarken basieren auf geschaetzter TTS-Dauer (keine Messung).";

/** Sekunden -> SRT-Zeitstempel HH:MM:SS,mmm. */
export function formatSrtTimecode(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/** Ein SRT-Block: Index, Zeitfenster, Text. */
export function buildSrtBlock(index: number, startSec: number, endSec: number, text: string): string {
  return [
    String(index),
    `${formatSrtTimecode(startSec)} --> ${formatSrtTimecode(endSec)}`,
    text.trim(),
  ].join("\n");
}

/** Vollstaendige SRT-Datei aus den Szenen (sequenziell, lueckenlos). */
export function buildSrt(scenes: Scene[]): string {
  let cursor = 0;
  const blocks = scenes.map((scene, i) => {
    const start = cursor;
    cursor += scene.estimatedSeconds;
    return buildSrtBlock(i + 1, start, cursor, scene.narration);
  });
  return [...blocks, "", SRT_HONESTY_HEADER].join("\n\n");
}

/** Dateiname fuer den Export (Projekt-Id-basiert, kein Freitext-Pfad). */
export function buildSrtFileName(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9-_]/g, "-");
  return `${safe}.srt`;
}

/** Strukturelle Validierung eines SRT-Texts (Indices, Fenster, Syntax). */
export function validateSrt(srt: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const blocks = srt.split("\n\n").filter((b) => b.trim().length > 0 && !b.startsWith("Hinweis:"));

  blocks.forEach((block, i) => {
    const lines = block.split("\n");
    if (Number(lines[0]) !== i + 1) {
      issues.push(`Block ${i + 1}: Index "${lines[0]}" nicht fortlaufend`);
    }
    if (!/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/.test(lines[1] ?? "")) {
      issues.push(`Block ${i + 1}: Zeitfenster fehlt/malformiert`);
    }
    if ((lines[2] ?? "").trim().length === 0) {
      issues.push(`Block ${i + 1}: Untertitel-Text leer`);
    }
  });

  if (blocks.length === 0) issues.push("Keine SRT-Bloecke gefunden");
  return { valid: issues.length === 0, issues };
}
