/**
 * Release-Versions-Logik (rein, testbar) — Stabilisierung Sprint 133.
 *
 * Anlass: Ein Build-Ausloesung ohne version_name-Input liess den Workflow
 * auf den hartcodierten Default "2.0.0" zurueckfallen und lud die NEUEN
 * APKs in das alte v2.0.0-Release (--clobber). Diese Logik leitet die
 * naechste Patch-Version stattdessen aus dem hoechsten vorhandenen
 * v<major>.<minor>.<patch>-apk-Tag ab — falsche, doppelte oder alte
 * Versionen sind damit ausgeschlossen.
 */

const TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)-apk$/;

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

export function parseReleaseTag(tag: string): ParsedVersion | null {
  const match = TAG_PATTERN.exec(tag.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** Vergleicht zwei Versionen: >0 wenn a neuer als b. */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Ermittelt die naechste Patch-Version aus einer Liste vorhandener Tags.
 * - Keine gueltigen Tags → Fallback (Standardstart 2.0.0).
 * - Expliziter Wunsch (requested) wird validiert: nur semver-artige Eingaben
 *   "X.Y.Z" werden akzeptiert, alles andere faellt auf die Auto-Ableitung
 *   zurueck (kein blindes Vertrauen in Workflow-Inputs).
 */
export function nextReleaseVersion(
  existingTags: string[],
  requested?: string,
  fallback = "2.0.0",
): string {
  const requestedNormalized = requested?.trim();
  if (requestedNormalized && /^\d+\.\d+\.\d+$/.test(requestedNormalized)) {
    return requestedNormalized;
  }

  const parsed = existingTags
    .map(parseReleaseTag)
    .filter((v): v is ParsedVersion => v != null);

  if (parsed.length === 0) return fallback;

  let newest = parsed[0];
  for (const candidate of parsed.slice(1)) {
    if (compareVersions(candidate, newest) > 0) newest = candidate;
  }

  return `${newest.major}.${newest.minor}.${newest.patch + 1}`;
}
