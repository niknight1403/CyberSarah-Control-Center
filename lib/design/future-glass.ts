/**
 * CYBERSARAH FUTURE GLASS — Design-Token-System (Sprint 168)
 *
 * Zentrales, verbindliches Token-System fuer das komplette Control-Center
 * (Referenz-Richtung: "Next-Generation AI Control Center"). KEINE
 * hardcodierten Farben ausserhalb dieser Datei und lib/cyber-theme.ts.
 *
 * Aufbau:
 *   - glassPalette : Lichtquellen-System (Akzente als LICHT, nicht als Flaeche)
 *   - glassDepth   : Tiefen-Basis (Void-Hintergruende, nie flach)
 *   - glassSurface : CyberGlass-Flaechen (semi-transparent, Glow-Border)
 *   - glassRadii   : Border-Radius-System
 *   - glassSpacing : Abstands-System
 *   - glassType    : Typografie-System
 *   - glassMotion  : Animations-Dauern (60-FPS-freundlich, Native Driver)
 *   - aiCoreStates : Statusmaschine des AI-Cores mit Zustandsfarben
 *
 * Web- und Mobile-kompatibel (Expo-Web-Export → Capacitor): kein Blur,
 * Glas-Effekt per semi-transparenter Schichten + Gradient + Glow.
 */

/** Akzent-Farben als Lichtquellen. Bedeutung: Cyan=System/Technik,
 *  Purple=KI, Green=aktiv/erfolgreich, Magenta=Automation/Kreativitaet,
 *  Blue=Daten/Analytics. */
export const glassPalette = {
  cyan: "#00E5FF",
  purple: "#8B5CF6",
  magenta: "#EC4899",
  green: "#00FFA3",
  blue: "#2EA7FF",
  amber: "#F6BA5E",
  red: "#FF5C73",
} as const;

export type GlassAccent = keyof typeof glassPalette;

/** Deep-Void-Hintergrund-Skala — OLED-schonend, nie flach. */
export const glassDepth = {
  void: "#030712",
  abyss: "#050816",
  deep: "#07111F",
  layer: "#081321",
  /** Halbtransparente Karten-Flaeche (CyberGlass). */
  glass: "rgba(8, 18, 35, 0.72)",
  /** Hoeher gelegene Glas-Flaeche (Modals, Hero-Cards). */
  glassElevated: "rgba(10, 20, 40, 0.82)",
} as const;

/** CyberGlass-Flaechen-System. */
export const glassSurface = {
  background: glassDepth.void,
  card: glassDepth.glass,
  cardElevated: glassDepth.glassElevated,
  border: "rgba(148, 163, 184, 0.16)",
  borderStrong: "rgba(148, 163, 184, 0.28)",
  /** Highlight-Kante (innerer Lichtsaum oben). */
  highlightEdge: "rgba(255, 255, 255, 0.08)",
  textPrimary: "#F2F6FC",
  textSecondary: "#99A7B8",
  textMuted: "#6E7B8C",
} as const;

export const glassRadii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  pill: 999,
  /** Standard-Card-Radius der Referenz (20-28px). */
  card: 24,
} as const;

export const glassSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
} as const;

export const glassType = {
  display: { fontSize: 28, fontWeight: "800", letterSpacing: 1.2 } as const,
  headline: { fontSize: 20, fontWeight: "800", letterSpacing: 0.5 } as const,
  title: { fontSize: 16, fontWeight: "700", letterSpacing: 0.3 } as const,
  body: { fontSize: 14, fontWeight: "500" } as const,
  caption: { fontSize: 12, fontWeight: "600", letterSpacing: 0.4 } as const,
  label: { fontSize: 10, fontWeight: "700", letterSpacing: 1.2 } as const,
} as const;

/** Animations-System: kurze, performante, deterministische Motion. */
export const glassMotion = {
  fast: 140,
  base: 220,
  slow: 400,
  /** AI-Core-Rotationen (unaufdraenglich, kontinuierlich). */
  orbRotationSlow: 18_000,
  orbRotationFast: 3_200,
  orbPulse: 1_800,
  particleDrift: 9_000,
  /** Touch-Feedback: Press 0.98 → Release 1.0. */
  pressScale: 0.98,
} as const;

/** Akzent in RGBA-Schreibweise (fuer Glow/Verlauf, Alpha 0-1). */
export function accentAlpha(accent: GlassAccent, alpha: number): string {
  const hex = glassPalette[accent];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Mehrschichtiger Glow-Shadow eines Akzents (aussen). */
export function glassGlow(accent: GlassAccent, intensity: 0 | 1 | 2 = 1) {
  const radii = [6, 14, 22];
  const opacities = [0.18, 0.32, 0.46];
  return {
    shadowColor: glassPalette[accent],
    shadowOpacity: opacities[intensity],
    shadowRadius: radii[intensity],
    shadowOffset: { width: 0, height: 0 },
    elevation: intensity * 2,
  } as const;
}

// ---------------------------------------------------------------------------
// AI-CORE: Statusmaschine (Sprint 168)
// ---------------------------------------------------------------------------

export type AiCoreState =
  | "idle"
  | "listening"
  | "thinking"
  | "processing"
  | "executing"
  | "success"
  | "warning"
  | "error";

export interface AiCoreVisual {
  accent: GlassAccent;
  /** Ring-Rotation in ms (0 = keine Rotation). */
  rotationMs: number;
  /** Puls-Geschwindigkeit des Kerns in ms (0 = statisch). */
  pulseMs: number;
  /** Partikel-Anzahl (0-4). */
  particles: number;
  /** Glow-Intensitaet 0-2. */
  glow: 0 | 1 | 2;
}

/** Zustandsabhaengige Visualisierung des AI-Cores (Referenz §7). */
export const aiCoreStates: Record<AiCoreState, AiCoreVisual> = {
  idle: { accent: "purple", rotationMs: glassMotion.orbRotationSlow, pulseMs: glassMotion.orbPulse, particles: 2, glow: 0 },
  listening: { accent: "cyan", rotationMs: glassMotion.orbRotationSlow, pulseMs: glassMotion.orbPulse / 1.5, particles: 2, glow: 1 },
  thinking: { accent: "purple", rotationMs: glassMotion.orbRotationSlow / 2, pulseMs: glassMotion.orbPulse / 2, particles: 3, glow: 1 },
  processing: { accent: "blue", rotationMs: glassMotion.orbRotationFast * 2, pulseMs: glassMotion.orbPulse / 2.5, particles: 3, glow: 1 },
  executing: { accent: "magenta", rotationMs: glassMotion.orbRotationFast, pulseMs: glassMotion.orbPulse / 3, particles: 4, glow: 2 },
  success: { accent: "green", rotationMs: 0, pulseMs: glassMotion.orbPulse, particles: 1, glow: 1 },
  warning: { accent: "amber", rotationMs: glassMotion.orbRotationFast * 2, pulseMs: glassMotion.orbPulse / 2, particles: 1, glow: 1 },
  error: { accent: "red", rotationMs: 0, pulseMs: 600, particles: 0, glow: 2 },
} as const;

/** Lesebare Zustands-Beschriftung (UI-Sprache: Deutsch). */
export const aiCoreStateLabels: Record<AiCoreState, string> = {
  idle: "BEREIT",
  listening: "HÖRT ZU",
  thinking: "DENKT",
  processing: "VERARBEITET",
  executing: "FÜHRT AUS",
  success: "ERFOLGREICH",
  warning: "WARNUNG",
  error: "FEHLER",
} as const;
