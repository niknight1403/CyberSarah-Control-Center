/**
 * Glass-Atmosphere-Logik (Sprint 192) — reine, deterministische Logik
 * fuer die aufgewertete Future-Glass-Grafik (Backdrop-Aurora, Cyber-Grid,
 * driftende Lichtpartikel). Bewusst ohne React/RN-Importe: hier wird nur
 * gerechnet, gerendert wird in components/glass/*.
 *
 * Determinismus statt Math.random() im Render-Pfad: alle Felder werden aus
 * einem Seed abgeleitet (LCG) — gleiche Seed, gleiches Bild, keine
 * Hydration-/Snapshot-Spruenge, testbar ohne Mock-Objekte.
 */

/** Einfacher linearer Kongruenzgenerator (LCG) — deterministisch, leichtgewichtig. */
export function createSeededRandom(seed: number): () => number {
  let state = Math.floor(Math.abs(seed)) % 2147483647 || 42;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

export interface AtmosphereParticle {
  /** Horizontale Startposition in Prozent (0-100). */
  leftPercent: number;
  /** Vertikale Startposition in Prozent (0-100). */
  topPercent: number;
  /** Durchmesser in px (2-5). */
  size: number;
  /** Aufstiegsdauer in ms (glassMotion.particleDrift als Basisrahmen). */
  driftMs: number;
  /** Alpha 0-1 (maximal dezent). */
  opacity: number;
  /** Akzent-Index in glassPalette-Reihenfolge. */
  accentIndex: number;
}

export interface GridMeshSpec {
  /** Anzahl vertikaler Linien (ohne Randlinien). */
  verticalLines: number;
  /** Anzahl horizontaler Linien (ohne Randlinien). */
  horizontalLines: number;
  /** Linienstaerke in px (1 auf allen Dichten — hairline). */
  lineWidth: number;
}

export interface AuroraSpec {
  /** Farbverlaufs-Stops fuer den vertikalen Verlauf (RGBA-Strings). */
  colors: [string, string, ...string[]];
  /** Drift-Amplitude in px (sanfte Pendelbewegung). */
  driftAmplitudePx: number;
  /** Drift-Dauer fuer eine Richtung in ms. */
  driftMs: number;
}

/** Interne Reihenfolge der Atmosphaeren-Akzente (zu glassPalette). */
const ATMOSPHERE_ACCENTS = ["cyan", "purple", "magenta", "blue"] as const;

/** Driftende Lichtpartikel deterministisch aus Seed ableiten. */
export function buildParticleField(seed: number, count: number): AtmosphereParticle[] {
  const clampedCount = Math.max(0, Math.min(8, Math.floor(count)));
  const rand = createSeededRandom(seed);
  const particles: AtmosphereParticle[] = [];
  for (let i = 0; i < clampedCount; i += 1) {
    particles.push({
      leftPercent: Math.round(rand() * 1000) / 10,
      topPercent: Math.round((0.15 + rand() * 0.85) * 1000) / 10,
      size: 2 + Math.floor(rand() * 4),
      driftMs: 7000 + Math.floor(rand() * 5000),
      opacity: Math.round((0.08 + rand() * 0.14) * 100) / 100,
      accentIndex: Math.floor(rand() * ATMOSPHERE_ACCENTS.length) % ATMOSPHERE_ACCENTS.length,
    });
  }
  return particles;
}

/** Akzent-Schluessel eines Partikels (zu glassPalette). */
export function particleAccent(particle: AtmosphereParticle): (typeof ATMOSPHERE_ACCENTS)[number] {
  return ATMOSPHERE_ACCENTS[particle.accentIndex];
}

/** Cyber-Grid-Spezifikation aus Groesse und gewuenschter Maschenweite. */
export function buildGridMesh(widthPx: number, heightPx: number, spacingPx: number): GridMeshSpec {
  const spacing = Math.max(60, Math.min(160, Math.floor(spacingPx)));
  const verticalLines = Math.max(0, Math.floor(widthPx / spacing) - 1);
  const horizontalLines = Math.max(0, Math.floor(heightPx / spacing) - 1);
  return { verticalLines, horizontalLines, lineWidth: 1 };
}

/** Aurora-Verlauf eines Akzents (RGBA aus Hex ableiten, Alpha fix dezent). */
export function buildAurora(hex: string): AuroraSpec {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return {
    // Sprint 355 — Aurora Flow: die Akzentfarbe schmilzt mit Violett und
    // Petrol zu einer Polarlicht-Welle (vertikaler 4-Stufen-Verlauf).
    colors: [
      `rgba(${r}, ${g}, ${b}, 0.14)`,
      `rgba(124, 58, 237, 0.09)`,
      `rgba(0, 242, 254, 0.06)`,
      `rgba(0, 229, 176, 0.04)`,
      "rgba(0, 229, 176, 0)",
    ],
    driftAmplitudePx: 28,
    driftMs: 26_000,
  };
}

/** Valider Seed-Bereich (0, Negativ und NaN fallen auf 42 zurueck). */
export function normalizeAtmosphereSeed(seed: number): number {
  if (!Number.isFinite(seed) || seed <= 0) return 42;
  return Math.floor(seed);
}
