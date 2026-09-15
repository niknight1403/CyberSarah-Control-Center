/**
 * Farbhilfen fuer dynamische Theme-Toenungen (rein, testbar).
 *
 * Screens und Studio-Komponenten leiten Marken-/Status-Akzente
 * (Helligkeits-Abstufungen, Transparenz-Stufen) dynamisch aus der aktiven
 * Design-Theme-Palette (useColors) ab, damit sie beim Theme-Wechsel
 * (z. B. Aurora Glass) automatisch die richtige Akzentfarbe zeigen,
 * statt eine im Cyber-Neon-Design hart codierte Farbe zu behalten.
 */

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function toHex(value: number): string {
  return clamp255(value).toString(16).padStart(2, "0");
}

/** rgba(...)-String aus Hex-Farbe + Alpha (0..1). */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Mischt die Farbe Richtung Weiss (amount 0..1 = Anteil Weiss). */
export function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (channel: number) => channel + (255 - channel) * amount;
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/** Mischt die Farbe Richtung Schwarz (amount 0..1 = Anteil Schwarz). */
export function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (channel: number) => channel * (1 - amount);
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/**
 * Dreht den Farbton (Hue) einer Hex-Farbe um `degrees` Grad (0-359,-wrap-around)
 * und gibt die Ergebnisfarbe als Hex zurueck — rein, fuer Avatar-Nuancen
 * (Sprint 118) und Theme-Experimente. S/W-Farben (Saettigung 0) bleiben unveraendert.
 */
export function shiftHue(hex: string, degrees: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return hex;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  const shifted = ((hue + degrees) % 360 + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(((shifted / 60) % 2) - 1));
  let rgb: [number, number, number];
  const segment = Math.floor(shifted / 60) % 6;
  if (segment === 0) rgb = [chroma, secondary, 0];
  else if (segment === 1) rgb = [secondary, chroma, 0];
  else if (segment === 2) rgb = [0, chroma, secondary];
  else if (segment === 3) rgb = [0, secondary, chroma];
  else if (segment === 4) rgb = [secondary, 0, chroma];
  else rgb = [chroma, 0, secondary];
  const match = lightness - (chroma + secondary) / 2;
  const toHex = (value: number) => Math.round((value + match) * 255).toString(16).padStart(2, "0");
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}
