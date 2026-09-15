/**
 * Sprint 118 — Agent-Avatar-System: reine, deterministische Logik fuer
 * prozedural animierte Avatare (React Native), inspiriert vom Tech-Scan-Fund
 * `karacca/moodstone` (Relevanz 14, hoechster Fund).
 *
 * Wie beim Living-AI-Interface (Sprint 89) gilt: Bewertung/Geometrie rein
 * und getestet, Animation rendert die Komponente
 * (components/living/agent-avatar.tsx). Design-Regeln des Owners:
 * ruhige Grundanimation, Glow NUR bei wichtigen Zustaenden, nichts Tackern.
 *
 * Kernidee: aus einem stabilen Seed (Agent-Name) entsteht reproduzierbar
 * eine individuelle Geometrie — Ringe mit Dashes, Blueten-Segmente, Kern —
 * die je Stimmung (idle/thinking/speaking/success/error) unterschiedlich
 * atmet, rotiert und glowed. Gleicher Seed => gleicher Avatar, fuer immer.
 */

import { mulberry32 } from "@/lib/living-interface-logic";

/* ==================== Stimmungen ==================== */

export type AvatarMood = "idle" | "thinking" | "speaking" | "success" | "error";

export function normalizeAvatarMood(value: unknown): AvatarMood {
  return value === "thinking" || value === "speaking" || value === "success" || value === "error" ? value : "idle";
}

/* ==================== Animations-Parameter je Stimmung ==================== */

export type AvatarMoodAnimation = {
  /** Atem-Amplitude des Kerns (1 = keine Skalierung, 1.04 = +-4 %). */
  breathAmplitude: number;
  /** Dauer eines Atem-Zyklus (ruhig: >= 3.2 s). */
  breathDurationMs: number;
  /** Rotationsgeschwindigkeit der Ringe in Grad/s (0 = still). */
  ringRotationDegPerSec: number;
  /** Glow-Intensitaet 0..1 — nach Design-Regel nur bei wichtigen Zustaenden. */
  glowIntensity: number;
};

export const AVATAR_MOOD_ANIMATION: Record<AvatarMood, AvatarMoodAnimation> = {
  idle: { breathAmplitude: 1.02, breathDurationMs: 4200, ringRotationDegPerSec: 4, glowIntensity: 0 },
  thinking: { breathAmplitude: 1.05, breathDurationMs: 2200, ringRotationDegPerSec: 18, glowIntensity: 0.18 },
  speaking: { breathAmplitude: 1.07, breathDurationMs: 1600, ringRotationDegPerSec: 26, glowIntensity: 0.22 },
  success: { breathAmplitude: 1.09, breathDurationMs: 1800, ringRotationDegPerSec: 30, glowIntensity: 0.55 },
  error: { breathAmplitude: 1.03, breathDurationMs: 3000, ringRotationDegPerSec: -12, glowIntensity: 0.6 },
};

/* ==================== Seed ==================== */

/**
 * Stabiler String-Hash (FNV-1a, 32 Bit): aus dem Agent-Namen entsteht immer
 * derselbe Seed — der Avatar ist eine Identitaet, kein Zufall pro Start.
 */
export function avatarSeedFromName(name: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/* ==================== Geometrie ==================== */

export type AvatarRing = {
  /** Radius in Prozent der Avatar-Groesse (20-46). */
  radius: number;
  /** Strichbreite in dp (1-4). */
  strokeWidth: number;
  /** Startwinkel der Dash-Phase (Grad, 0-359). */
  dashPhase: number;
  /** Sweep des sichtbaren Bogens (Grad, 40-320). */
  sweep: number;
  /** Rotationsrichtung (+1/-1). */
  direction: 1 | -1;
};

export type AvatarPetal = {
  /** Mittelpunkt-Winkel (Grad, 0-359). */
  angle: number;
  /** Laenge in Prozent (16-30). */
  length: number;
  /** Breite in Prozent (3-9). */
  width: number;
};

export type AvatarGeometry = {
  /** 2-3 Ringe, von innen nach aussen sortiert. */
  rings: AvatarRing[];
  /** 4-8 Blueten-Segmente um den Kern. */
  petals: AvatarPetal[];
  /** Kern-Radius in Prozent (18-30). */
  coreRadius: number;
  /** Abgeleiteter Farbversatz (Grad, 0-359) fuer Nuancen im Theme. */
  hueOffset: number;
};

/** Deterministisch aus dem Seed — gleicher Seed, gleicher Avatar. */
export function createAvatarGeometry(seed: number): AvatarGeometry {
  const random = mulberry32(seed);
  const ringCount = 2 + Math.floor(random() * 2); // 2-3
  const petalCount = 4 + Math.floor(random() * 5); // 4-8

  const rings: AvatarRing[] = [];
  for (let index = 0; index < ringCount; index += 1) {
    rings.push({
      radius: Math.min(46, 24 + index * 10 + random() * 4),
      strokeWidth: 1 + Math.floor(random() * 3),
      dashPhase: Math.floor(random() * 360),
      sweep: 40 + Math.floor(random() * 281),
      direction: random() < 0.5 ? -1 : 1,
    });
  }

  const petals: AvatarPetal[] = [];
  for (let index = 0; index < petalCount; index += 1) {
    const rawAngle = Math.round((index * 360) / petalCount + random() * 18 - 9);
    petals.push({
      // Winkel fest in 0-359 wrap-en (negative Werte wuerden das Sortieren brechen).
      angle: ((rawAngle % 360) + 360) % 360,
      length: 16 + random() * 14,
      width: 3 + random() * 6,
    });
  }
  petals.sort((a, b) => a.angle - b.angle);

  return {
    rings,
    petals,
    coreRadius: 18 + random() * 12,
    hueOffset: Math.floor(random() * 360),
  };
}

/* ==================== SVG-Pfad (rein, fuer Tests/Export) ==================== */

/**
 * SVG-Bogen-Pfad fuer einen Ring- Abschnitt — Eingabe in Grad, Ausgabe
 * Pfad-String (M/L mit A-Bogen). Wird von der Komponente fuer die Ringe
 * genutzt und hier getestet: gleiche Parameter => gleicher Pfad.
 */
export function buildRingArcPath(size: number, radius: number, startAngleDeg: number, sweepDeg: number): string {
  const cx = size / 2;
  const cy = size / 2;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const start = rad(startAngleDeg);
  const end = rad(startAngleDeg + sweepDeg);
  const r = (radius / 100) * size;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const largeArc = sweepDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/* ==================== Stimmungs-Ableitung ==================== */

/**
 * Leitet die Avatar-Stimmung aus dem Chat-Zustand ab (rein): Fehler schlaegt
 * alles, Denken schlaegt Erfolg, ohne Aktivitaet ist der Avatar ruhig.
 */
export function resolveAvatarMood(state: {
  isThinking: boolean;
  hasError: boolean;
  isSuccess: boolean;
  isSpeaking?: boolean;
}): AvatarMood {
  if (state.hasError) return "error";
  if (state.isThinking) return "thinking";
  if (state.isSuccess) return "success";
  if (state.isSpeaking) return "speaking";
  return "idle";
}
