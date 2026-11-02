/**
 * AI Influenza Team — Motive ohne Bilddienst (Sprint 9b).
 *
 * Wenn der Bildanbieter nicht liefert (Kontingent, Ausfall), bleibt das Paket
 * nicht bei einer flachen Farbe stehen: hier entsteht ein ruhiges Markenmotiv
 * mit Verlauf, Diagonale und Vignette. Alles reine Rechnung, kein Netzwerk,
 * damit es testbar ist und in der CI reproduzierbar bleibt.
 */

export type Rgb = { r: number; g: number; b: number };

export type MotifPalette = {
  from: Rgb;
  to: Rgb;
  accent: Rgb;
};

export const MOTIF_PALETTES: Record<string, MotifPalette> = {
  starter: { from: { r: 10, g: 22, b: 40 }, to: { r: 40, g: 18, b: 58 }, accent: { r: 0, g: 210, b: 200 } },
  growth: { from: { r: 12, g: 20, b: 46 }, to: { r: 58, g: 20, b: 48 }, accent: { r: 240, g: 80, b: 190 } },
};

export function paletteFor(packageId: string): MotifPalette {
  return MOTIF_PALETTES[packageId] ?? MOTIF_PALETTES.growth;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const ratio = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio,
  };
}

/**
 * PPM (P6) statt PNG: kein Encoder noetig, ffmpeg wandelt es in einem Schritt.
 * Verlauf von links oben nach rechts unten, darueber eine weiche Diagonale in
 * der Akzentfarbe und eine Vignette, damit Text darunter lesbar bleibt.
 */
export function buildMotifPpm(input: {
  width: number;
  height: number;
  palette: MotifPalette;
  sceneIndex: number;
}): Buffer {
  const { width, height, palette, sceneIndex } = input;
  if (width <= 0 || height <= 0) throw new Error("Motiv braucht eine Groesse.");
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`, "ascii");
  const pixels = Buffer.alloc(width * height * 3);
  // Jede Szene bekommt eine etwas andere Diagonale, damit vier Szenen nicht gleich aussehen.
  const bandPosition = 0.35 + ((sceneIndex % 4) * 0.09);
  const bandWidth = 0.16;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const v = y / (height - 1);
      const base = mix(palette.from, palette.to, (u + v) / 2);

      // Diagonale: Abstand zur Linie v = u - bandPosition.
      const diagonal = Math.abs(v - u + bandPosition) / bandWidth;
      const band = diagonal < 1 ? (1 - diagonal) * 0.35 : 0;
      const withBand = mix(base, palette.accent, band);

      // Vignette zum Rand, Mitte bleibt klar.
      const dx = u - 0.5;
      const dy = v - 0.5;
      const vignette = 1 - Math.min(0.55, (dx * dx + dy * dy) * 0.9);
      const offset = (y * width + x) * 3;
      pixels[offset] = clampChannel(withBand.r * vignette);
      pixels[offset + 1] = clampChannel(withBand.g * vignette);
      pixels[offset + 2] = clampChannel(withBand.b * vignette);
    }
  }

  return Buffer.concat([header, pixels]);
}
