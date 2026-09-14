/**
 * Sprint 107 (Erweiterung) — App-Varianten: Entwicklung vs. Admin-Produktion.
 *
 * Zwei APK-Varianten aus einem Codestand (Owner-Wunsch 14.09.2026):
 * - "development": alle Entwicklungsanzeigen sichtbar (Service-Diagnose,
 *   Entwicklungs-Guidance, Theme-Lab) — die Entwicklungs-APK (Debug-Build).
 * - "admin": voller Funktionsumfang (Rollen, Agent, Business-Tools bleiben
 *   unberuehrt), aber Entwicklungsanzeigen werden ausgeblendet — die
 *   Admin-APK (signierter Release-Build, auch Basis fuer den Play-Store).
 *
 * Die Variante wird zur Build-Zeit ueber EXPO_PUBLIC_APP_VARIANT eingebrannt
 * (Expo inlines EXPO_PUBLIC_*-Variablen in den Web-Export). Reine Logik —
 * keine React-Native-Imports, deterministisch testbar.
 */

export type AppVariant = "development" | "admin";

/**
 * Entwicklungsanzeigen, die in der Admin-Variante ausgeblendet werden.
 * Funktionalitaet (Rollen, Agent, Business-Tools, Git-Workflow) bleibt in
 * beiden Varianten vollstaendig erhalten — es geht nur um Anzeigen.
 */
export type DevSurface =
  | "serviceDiagnosis"
  | "developmentGuidance"
  | "themeLab";

export const DEV_SURFACES: readonly DevSurface[] = [
  "serviceDiagnosis",
  "developmentGuidance",
  "themeLab",
];

/**
 * Normalisiert die Build-Zeit-Variable. Unbekannte oder fehlende Werte
 * fallen bewusst auf "development" zurueck (bisheriges Verhalten) — ein
 * Tippfehler im Workflow haelt so nie Produktions-Anzeigen zurueck.
 */
export function resolveAppVariant(raw: string | undefined): AppVariant {
  const normalized = (raw ?? "").trim().toLowerCase();
  return normalized === "admin" ? "admin" : "development";
}

/** Wahr, wenn eine Entwicklungsanzeige in der Variante sichtbar ist. */
export function showDevSurface(variant: AppVariant, surface: DevSurface): boolean {
  if (!DEV_SURFACES.includes(surface)) return false;
  return variant === "development";
}

/** Label fuer Build-Berichte und About-Anzeigen (tokenfrei). */
export function appVariantLabel(variant: AppVariant): string {
  return variant === "admin" ? "Admin (Produktion)" : "Entwicklung";
}

/**
 * Prueft, ob ein Rohergebnis aus der Build-Umgebung als gueltige Variante
 * gilt — dient dem Workflow-Assert vor dem teuren Gradle-Build.
 */
export function isAppVariantValue(raw: string | undefined): boolean {
  const normalized = (raw ?? "").trim().toLowerCase();
  return normalized === "development" || normalized === "admin";
}
