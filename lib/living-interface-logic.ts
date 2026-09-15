/**
 * Sprint 89 — "Living AI Interface": reine, deterministische Logik fuer die
 * lebendigen UI-Bausteine (Partikel-Feld, AI-Orb-Puls, Glow-Regeln,
 * Scanline-Overlay). Keine React-Abhaengigkeit — die Komponenten in
 * components/living/living-ui.tsx konsumieren nur diese Funktionen.
 *
 * Design-Regeln des Owners (14.09.2026):
 * - Nicht alles gleichzeitig animieren: Glow NUR bei wichtigen Aktionen,
 *   Partikel driften langsam (>= 20 s), Scanlines extrem dezent.
 * - Hochwertig und futuristisch, aber weiterhin professionelles Control Center.
 */

/* ==================== Partikel-Feld ==================== */

export type LivingParticle = {
  id: number;
  /** Position in Prozent (0-100) relativ zum Container. */
  x: number;
  y: number;
  /** Durchmesser in dp (1-3). */
  size: number;
  /** Senkrechter Drift pro Zyklus in Prozentpunkten (negativ = aufwaerts). */
  driftY: number;
  /** Horizontale Pendelbreite in Prozentpunkten. */
  driftX: number;
  /** Dauer eines kompletten Drift-Zyklus (langsam: >= 20 s). */
  durationMs: number;
  /** Startverzoegerung, damit Partikel nicht synchron loslaufen. */
  delayMs: number;
  /** Basis-Deckkraft (0-1, sehr dezent). */
  opacity: number;
};

export const PARTICLE_MAX_COUNT = 40;
export const PARTICLE_MIN_DURATION_MS = 20_000;
export const PARTICLE_MAX_DURATION_MS = 48_000;

/** Deterministischer PRNG (mulberry32) — gleiches Seed => gleiches Feld (auch Avatar-Geometrie, Sprint 118). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Erzeugt ein deterministisches Partikel-Feld. `count` wird auf 0-40
 * begrenzt, die Dauern auf langsame Drifts (20-48 s) — ruhiger, edler
 * Hintergrund statt hektischem Schneesturm.
 */
export function createParticleField(seed: number, count: number): LivingParticle[] {
  const random = mulberry32(seed);
  const total = clamp(Math.floor(count), 0, PARTICLE_MAX_COUNT);
  const particles: LivingParticle[] = [];
  for (let index = 0; index < total; index += 1) {
    particles.push({
      id: index,
      x: Number((random() * 100).toFixed(2)),
      y: Number((random() * 100).toFixed(2)),
      size: 1 + Math.floor(random() * 3),
      driftY: -4 - Number((random() * 8).toFixed(2)),
      driftX: Number((1 + random() * 3).toFixed(2)),
      durationMs: Math.round(PARTICLE_MIN_DURATION_MS + random() * (PARTICLE_MAX_DURATION_MS - PARTICLE_MIN_DURATION_MS)),
      delayMs: Math.round(random() * 8_000),
      opacity: Number((0.08 + random() * 0.18).toFixed(3)),
    });
  }
  return particles;
}

/* ==================== AI-Orb-Puls ==================== */

export type OrbState = "idle" | "thinking" | "success" | "error";

/** Puls-Dauer pro Zustand — thinking deutlich schneller, sonst ruhig. */
export const ORB_PULSE_DURATION_MS: Record<OrbState, number> = {
  idle: 3_200,
  thinking: 900,
  success: 2_400,
  error: 2_400,
};

/** Maximale relative Skalierung des Orbs pro Zustand. */
export const ORB_PULSE_SCALE: Record<OrbState, number> = {
  idle: 0.06,
  thinking: 0.16,
  success: 0.1,
  error: 0.1,
};

/**
 * Puls-Phase (0..1) des Orbs zum Zeitpunkt `nowMs`. Deterministisch
 * (reine Sinus-Funktion ueber der Zeit) — Komponenten koennen sie per
 * Timer abtasten oder in einen Animated-Loop uebersetzen.
 */
export function orbPulsePhase(nowMs: number, state: OrbState): number {
  const duration = ORB_PULSE_DURATION_MS[state];
  const phase = 0.5 - 0.5 * Math.cos((2 * Math.PI * nowMs) / duration);
  return Number(phase.toFixed(4));
}

/** Absolute Skalierung (1.0-basiert) des Orbs zum Zeitpunkt `nowMs`. */
export function orbScale(nowMs: number, state: OrbState): number {
  return Number((1 + ORB_PULSE_SCALE[state] * orbPulsePhase(nowMs, state)).toFixed(4));
}

/* ==================== Glow-Regeln ==================== */

export type UiAction =
  | "typing"
  | "scroll"
  | "navigation"
  | "settings"
  | "attach"
  | "send-message"
  | "commit"
  | "push"
  | "deploy";

export type GlowLevel = "none" | "soft" | "primary";

/**
 * "Neon-Glow nur bei wichtigen Aktionen": Routine-Interaktionen bleiben
 * ohne Glow, sekundaere Aktionen bekommen einen dezenten Soft-Glow und nur
 * semantisch wichtige Aktionen (Senden, Commit, Push, Deploy) leuchten im
 * Primaer-Glow. Das ist die zentrale Ruhe-Regel des Living Interface.
 */
export function resolveActionGlow(action: UiAction): GlowLevel {
  switch (action) {
    case "send-message":
    case "commit":
    case "push":
    case "deploy":
      return "primary";
    case "attach":
    case "settings":
      return "soft";
    case "typing":
    case "scroll":
    case "navigation":
    default:
      return "none";
  }
}

/* ==================== Scanline-Overlay ==================== */

export type ScanlineIntensity = "off" | "subtle" | "strong";

export type ScanlineConfig = {
  /** Liniendicke in dp. */
  lineHeight: number;
  /** Abstand zwischen Linien in dp. */
  gap: number;
  /** Deckkraft der Linien (0-1) — bleibt immer sehr dezent. */
  opacity: number;
};

const SCANLINE_PRESETS: Record<Exclude<ScanlineIntensity, "off">, ScanlineConfig> = {
  subtle: { lineHeight: 1, gap: 4, opacity: 0.03 },
  strong: { lineHeight: 1, gap: 3, opacity: 0.05 },
};

/** Scanline-Konfiguration — "off" liefert null, damit das Overlay ganz entfaellt. */
export function resolveScanlines(intensity: ScanlineIntensity): ScanlineConfig | null {
  if (intensity === "off") return null;
  return SCANLINE_PRESETS[intensity];
}
