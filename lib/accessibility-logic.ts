/**
 * Sprint 301 — Barrierefreiheit: reine, deterministische Logik fuer
 * Kontrast-Audit (WCAG 2.1) und Fokus-Ordnungs-Validierung.
 *
 * Datenfluss:
 *   Screens uebergeben Farbpaare bzw. geordnete Fokus-Knoten; die Logik
 *   berechnet Leuchtdichte-Kontrast und prueft die Fokus-Reihenfolge rein
 *   numerisch — kein DOM-Zugriff noetig.
 *
 * Ehrlichkeits-Grenze: Ein bestandener Kontrast-Check sagt NICHTS ueber
 *   vollstaendige WCAG-Konformitaenz (Tastatur-Fallen, Screenreader etc.
 *   bleiben manuell zu pruefen). Der Audit prueft nur, was er misst.
 */

export type HexColor = string;

/** Relative Leuchtdichte nach WCAG 2.1 (0..1). */
export function relativeLuminance(hex: HexColor): number {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Ungueltige Hex-Farbe: ${hex}`);
  }
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(clean.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrastverhaeltnis 1..21 (WCAG). */
export function contrastRatio(
  foreground: HexColor,
  background: HexColor,
): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export const WCAG_AA_NORMAL_TEXT = 4.5;
export const WCAG_AA_LARGE_TEXT = 3;

/** AA-Check; largeText ab 18pt bzw. 14pt bold. */
export function meetsWCAGAA(
  foreground: HexColor,
  background: HexColor,
  largeText = false,
): boolean {
  const required = largeText ? WCAG_AA_LARGE_TEXT : WCAG_AA_NORMAL_TEXT;
  return contrastRatio(foreground, background) >= required;
}

/** Prueft Text/Badge-Paare eines Screens und liefert Befunde. */
export function auditContrastPairs(
  pairs: Array<{
    label: string;
    foreground: HexColor;
    background: HexColor;
    largeText?: boolean;
  }>,
): Array<{ label: string; ratio: number; passed: boolean }> {
  return pairs.map((p) => {
    const ratio = contrastRatio(p.foreground, p.background);
    return {
      label: p.label,
      ratio,
      passed: meetsWCAGAA(p.foreground, p.background, p.largeText ?? false),
    };
  });
}

export type FocusNode = {
  id: string;
  /** Optional explizite Tab-Ordnung; undefined = DOM-/Deklarationsreihenfolge. */
  tabIndex?: number;
};

/** Fokus-Ordnungs-Validierung: negative Werte, explizite Tab-Spruenge, Duplikate. */
export function validateFocusOrder(
  nodes: FocusNode[],
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const explicit = nodes.filter((n) => n.tabIndex !== undefined);

  for (const n of explicit) {
    if ((n.tabIndex ?? 0) < 0) {
      issues.push(`Negativer tabIndex bei "${n.id}" entfernt Element aus der Tastaturbedienung`);
    }
  }

  const positive = explicit
    .filter((n) => (n.tabIndex ?? 0) > 0)
    .map((n) => n.tabIndex as number);
  if (positive.length > 0) {
    // Ein einziger positiver tabIndex wirft alle anderen Knoten ans Ende.
    issues.push(
      `Positive tabIndex-Werte (${positive.join(", ")}) verwirfen die Deklarationsreihenfolge — bevorzugt Reihenfolge im Baum`,
    );
  }

  const ids = nodes.map((n) => n.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length > 0) {
    issues.push(`Doppelte Fokus-Ids: ${[...new Set(dup)].join(", ")}`);
  }

  return { valid: issues.length === 0, issues };
}
