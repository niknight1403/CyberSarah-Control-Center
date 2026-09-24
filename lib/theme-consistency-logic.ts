/**
 * Sprint 302 — Dunkel/Hell-Theme-Konsistenz: reine, deterministische Logik
 * zum Auffinden hartkodierter Farben und Vorschlag des passenden Theme-Tokens.
 *
 * Datenfluss:
 *   Screen-Quelltexte werden als String durchsucht; Hex-Literale ohne
 *   Token-Verwendung werden mit dem naechsten Cyber-Design-System-Token
 *   (Farbabweichung) gemeldet. Kein Dateisystem-Zugriff im Modul.
 *
 * Ehrlichkeits-Grenze: Der Scanner findet nur Hex-Literale. RGBA-Werte,
 * benannte CSS-/RN-Farben und dynamische Konstrukte bleiben unentdeckt —
 * ein sauberer Scan ist kein Beweis fuer vollstaendige Theme-Disziplin.
 */

/** Cyber-Design-System-Palette (Tokens). */
export const THEME_TOKENS: Record<string, string> = {
  background: "#07090E",
  surface: "#0D1117",
  cyan: "#00F2FE",
  magenta: "#FF007F",
  textPrimary: "#E8F1FF",
  textMuted: "#8B9BB4",
  success: "#22E584",
  warning: "#FFB627",
  danger: "#FF4D5E",
};

export type HardcodedColorFinding = {
  line: number;
  literal: string;
  /** Naechstes Token inkl. Farbabstand (0 = identisch). */
  suggestedToken: string;
  distance: number;
};

/** RGB-Euklid-Distanz zweier Hex-Farben (0..441). */
export function colorDistance(a: string, b: string): number {
  const parse = (h: string): [number, number, number] => {
    const c = h.replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(c)) {
      throw new Error(`Ungueltige Hex-Farbe: ${h}`);
    }
    return [
      parseInt(c.slice(0, 2), 16),
      parseInt(c.slice(2, 4), 16),
      parseInt(c.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Findet Hex-Literale im Quelltext und schlaegt das naechste Token vor. */
export function scanForHardcodedColors(
  source: string,
  tokens: Record<string, string> = THEME_TOKENS,
): HardcodedColorFinding[] {
  const lines = source.split("\n");
  const findings: HardcodedColorFinding[] = [];

  lines.forEach((line, idx) => {
    const matches = line.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    for (const literal of matches) {
      // Bereits token-treue Literale sind kein Befund.
      if (Object.values(tokens).includes(literal.toUpperCase())) continue;

      let best: { name: string; dist: number } | null = null;
      for (const [name, hex] of Object.entries(tokens)) {
        const dist = colorDistance(literal, hex);
        if (!best || dist < best.dist) best = { name, dist };
      }
      findings.push({
        line: idx + 1,
        literal: literal.toUpperCase(),
        suggestedToken: best ? best.name : "background",
        distance: best ? best.dist : 0,
      });
    }
  });

  return findings;
}

/** Ehrliche Zusammenfassung eines Screen-Scans. */
export function summarizeScan(
  findings: HardcodedColorFinding[],
): { total: number; critical: number; report: string } {
  // Abstand >= 60 = keine bloede Token-Umbenennung, sondern echte Alt-Farbe.
  const critical = findings.filter((f) => f.distance >= 60).length;
  const total = findings.length;
  const report =
    total === 0
      ? "keine hartkodierten Hex-Farben gefunden"
      : `${total} Hartkodierung(en), davon ${critical} ohne nahes Token`;
  return { total, critical, report };
}
