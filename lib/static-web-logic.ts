import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Deterministische Logik für die Auslieferung des statischen
 * Expo-Web-Exports durch den API-Server (PaaS-Einzel-Dienst-Betrieb, Render).
 *
 * Der Web-Build liegt im Container unter WEB_DIST_DIR (Standard:
 * "web-dist" relativ zum Arbeitsverzeichnis). Der Server serviert die
 * statischen Dateien und fällt für unbekannte, nicht-API-Pfade auf
 * index.html zurück (Static-Site-Export: eine HTML-Datei je Route).
 */

export const DEFAULT_WEB_DIST_DIR = "web-dist";

/** Resolves the on-disk web dist directory; null wenn nicht vorhanden. */
export function resolveWebDistDir(baseDir: string): string | null {
  const dir = process.env.WEB_DIST_DIR?.trim()
    ? process.env.WEB_DIST_DIR.trim()
    : DEFAULT_WEB_DIST_DIR;
  const resolved = path.isAbsolute(dir) ? dir : path.resolve(baseDir, dir);
  return existsSync(resolved) ? resolved : null;
}

/**
 * Mappt einen URL-Pfad auf eine Datei im Web-Dist-Verzeichnis.
 * Regelwerk (deterministisch, ohne Dateisystem-Zugriff):
 * - "/" -> index.html
 * - "/account" -> account.html (Static-Site-Export-Schema)
 * - "/account/" -> account.html
 * - "/assets/app.js" -> assets/app.js (unverändert)
 * - Pfade mit ".." werden auf null gesetzt (Traversal-Schutz).
 */
export function mapUrlPathToWebFile(urlPath: string): string | null {
  const clean = urlPath.split("?")[0].split("#")[0];
  if (!clean.startsWith("/")) return null;

  const segments = clean.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    return null;
  }
  if (segments.length === 0) return "index.html";

  const last = segments[segments.length - 1];
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(last);
  if (hasExtension) return segments.join("/");

  // Route-Pfad ohne Erweiterung: account -> account.html
  return `${segments.join("/")}.html`;
}

/** true, wenn der Request für die Web-Auslieferung in Frage kommt. */
export function isWebFallbackCandidate(
  method: string,
  urlPath: string,
): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  return !urlPath.startsWith("/api/");
}
