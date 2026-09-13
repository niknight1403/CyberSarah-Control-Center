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
