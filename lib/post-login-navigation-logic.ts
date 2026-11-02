/**
 * Wohin nach dem Login? Ein Klick auf "Paket waehlen" auf der Verkaufsseite
 * soll nach der Anmeldung dort landen, wo der Kauf weitergeht — nicht auf dem
 * Startbildschirm, wo der Besucher den Faden verliert.
 *
 * Bewusst streng: nur app-interne Pfade. Ein Wert wie "https://evil.example"
 * oder "//evil.example" haette sonst eine offene Weiterleitung erzeugt.
 */

const DEFAULT_PATH = "/";

export function resolvePostLoginPath(raw?: string | null): string {
  if (!raw) return DEFAULT_PATH;
  let value = raw.trim();
  if (!value) return DEFAULT_PATH;

  // Absolute URLs und protokoll-relative Ziele grundsaetzlich ablehnen.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return DEFAULT_PATH;
  if (!value.startsWith("/")) return DEFAULT_PATH;
  if (value.startsWith("//")) return DEFAULT_PATH;
  // Backslashes werden von manchen Browsern wie Schraegstriche gelesen.
  if (value.includes("\\")) return DEFAULT_PATH;

  // Ein blosses "/" plus Query ist in Ordnung; Steuerzeichen nicht.
  if (/[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_PATH;

  // Lange Ziele kappen, damit kein Log-Spam oder Header-Problem entsteht.
  if (value.length > 512) return DEFAULT_PATH;

  return value;
}

/** Baut das Login-Ziel fuer ein Paket auf der Verkaufsseite. */
export function buildPackageLoginPath(packageId: string): string {
  const safe = packageId.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,32}$/.test(safe)) return "/login";
  return `/login?next=${encodeURIComponent(`/ai-influenza-team?package=${safe}`)}`;
}

/** Liest das gewuenschte Paket aus dem Query-Wert des Team-Screens. */
export function resolveRequestedPackage(
  raw: string | string[] | undefined,
  allowed: readonly string[],
): string | null {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  if (!value) return null;
  return allowed.includes(value) ? value : null;
}
