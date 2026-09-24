/**
 * Sprint 328 — Crash-Reporting v2: reine, deterministische Logik zum
 * Klassifizieren clientseitiger Fehler.
 *
 * Datenfluss:
 *   Rohfehler (Typ, Meldung, Stack-Ausschnitt) werden nach bekannten
 *   Mustern in Kategorien eingeteilt; Fingerprints deduplizieren
 *   gleiche Ursachen.
 *
 * Ehrlichkeits-Grenze: "unknown" ist eine ehrliche Kategorie, kein
 *   Sammelbecken-Schwaechen. Die Klassifizierung nennt ihre Basis
 *   (welches Muster traf zu) — keine Raten ohne Beleg.
 */

export type CrashCategory =
  | "netzwerk"
  | "auth"
  | "daten"
  | "third-party"
  | "frontend"
  | "unbekannt";

export type CrashInput = {
  errorType: string;
  message: string;
  stackHead: string;
};

export type CrashClassification = {
  category: CrashCategory;
  basis: string;
  fingerprint: string;
};

const PATTERNS: Array<{ category: CrashCategory; test: RegExp; label: string }> = [
  { category: "netzwerk", test: /fetch|network|timeout|ECONNREFUSED|offline/i, label: "Netzwerk-Muster" },
  { category: "auth", test: /401|403|unauthori[sz]ed|token|session/i, label: "Auth-Muster" },
  { category: "daten", test: /JSON\.parse|null is not|undefined is not|TypeError: Cannot read/i, label: "Daten-Muster" },
  { category: "third-party", test: /stripe|openai|google|firebase|expo/i, label: "Third-Party-Muster" },
];

/** Klassifizierung: erstes passendes Muster gewinnt, sonst ehrlich unbekannt. */
export function classifyCrash(input: CrashInput): CrashClassification {
  const haystack = `${input.errorType} ${input.message} ${input.stackHead}`;
  const hit = PATTERNS.find((p) => p.test.test(haystack));
  const category = hit?.category ?? "unbekannt";
  const basis = hit ? hit.label : "kein bekanntes Muster — unbekannt, nicht geraten";
  return { category, basis, fingerprint: buildFingerprint(input) };
}

/** Fingerprint: Typ + normalisierte Meldung (Zahlen raus) — dedupliziert. */
export function buildFingerprint(input: CrashInput): string {
  const normalized = `${input.errorType}|${input.message}`.replace(/\d+/g, "N").toLowerCase();
  return normalized.slice(0, 120);
}

/** Ist dieser Fehler bereits gemeldet (Fingerprint-Abgleich)? */
export function isDuplicateCrash(knownFingerprints: string[], fingerprint: string): boolean {
  return knownFingerprints.includes(fingerprint);
}

/** Meldungszeile fuers Crash-Dashboard mit Kategorie und Basis. */
export function formatCrashLine(classification: CrashClassification, message: string): string {
  return `[${classification.category}] ${message} — Basis: ${classification.basis}`;
}

/** Prioritaet: unbekannte Fehler zuerst angucken (ehrlich: wir wissen wenig). */
export function crashPriority(category: CrashCategory): 1 | 2 | 3 {
  if (category === "unbekannt") return 1;
  if (category === "daten" || category === "third-party") return 2;
  return 3;
}
