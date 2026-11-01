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

/**
 * Loest die endgueltige Build-Version auf und verhindert das Ueberschreiben
 * eines bereits veroeffentlichten Releases.
 *
 * Anlass (02.11.2026): `.github/release-requests/version.txt` pinnte 2.8.0.
 * Der Workflow uebergab den Pin als Wunschversion, `nextReleaseVersion` gab
 * ihn unveraendert zurueck und der Build lud die neuen APKs per `--clobber`
 * erneut in `v2.8.0-apk`. Neue Staende waren damit an der Versionsnummer
 * nicht erkennbar.
 *
 * Regeln:
 * - Ein Wunsch ist ein Mindeststand, kein Ueberschreibrecht.
 * - Ist die gewuenschte Version bereits als Release-Tag vorhanden, wird auf
 *   die naechste freie Patch-Version erhoeht.
 * - Liegt ein gueltiger Wunsch unter der hoechsten vorhandenen Version, gilt
 *   ebenfalls die naechste freie Version (kein Downgrade).
 */
export function resolveBuildVersion(
  existingTags: string[],
  requested?: string,
  fallback = "2.0.0",
): string {
  const parsed = existingTags
    .map(parseReleaseTag)
    .filter((v): v is ParsedVersion => v != null);

  const released = new Set(parsed.map((v) => `${v.major}.${v.minor}.${v.patch}`));
  const highest = parsed.length
    ? parsed.reduce((a, b) => (compareVersions(b, a) > 0 ? b : a))
    : null;

  const candidate = nextReleaseVersion(existingTags, requested, fallback);
  const [major, minor, patch] = candidate.split(".").map(Number);

  // Ein gueltiger Wunsch unterhalb des hoechsten Releases darf nicht zurueckfallen.
  if (highest && compareVersions({ major, minor, patch }, highest) <= 0) {
    return `${highest.major}.${highest.minor}.${highest.patch + 1}`;
  }

  let nextPatch = patch;
  while (released.has(`${major}.${minor}.${nextPatch}`)) nextPatch += 1;
  return `${major}.${minor}.${nextPatch}`;
}

/**
 * Prueft, ob eine Version bereits als v<version>-apk-Release existiert.
 * Wird als Fail-closed-Guard im Build genutzt: eine bereits veroeffentlichte
 * Version darf niemals erneut gebaut und mit --clobber ueberschrieben werden.
 */
export function isVersionReleased(tags: readonly string[], version: string): boolean {
  const target = version.trim();
  if (!/^\d+\.\d+\.\d+$/.test(target)) return false;
  return tags.some((tag) => {
    const parsed = parseReleaseTag(tag);
    return parsed !== null && `${parsed.major}.${parsed.minor}.${parsed.patch}` === target;
  });
}
