/**
 * Sprint 69 — Erlaubte CORS-Ursprünge (reine Logik).
 *
 * Die Android-APK (Capacitor-Wrapper, androidScheme https) sendet als Origin
 * "https://localhost". Ohne explizite Freigabe blockiert die Produktiv-API
 * jeden Cross-Origin-Request der App mit einem CORS-Fehler — im Frontend
 * sichtbar als generisches "Failed to fetch" bei Registrierung/Login.
 *
 * Diese Ursprünge sind ab Produktionsstart immer erlaubt und mit
 * APP_ALLOWED_ORIGINS erweiterbar.
 */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  // Capacitor-Android (androidScheme https) und -iOS
  "https://localhost",
  "capacitor://localhost",
  // Lokale Expo-Web-Entwicklung
  "http://localhost:8081",
  "http://localhost:19006",
];

export type ResolveAllowedOriginsInput = {
  configuredRaw?: string | null | undefined;
  isProduction?: boolean;
};

/**
 * Vereinigt die konfigurierten Origins (APP_ALLOWED_ORIGINS, kommasepariert)
 * mit den Standard-Ursprüngen. In Nicht-Produktionsumgebungen gelten die
 * Dev-Ursprünge immer.
 */
export function resolveAllowedOrigins(input: ResolveAllowedOriginsInput): Set<string> {
  const configured = (input.configuredRaw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const origins = new Set<string>(configured);
  for (const origin of DEFAULT_ALLOWED_ORIGINS) {
    origins.add(origin);
  }
  if (input.isProduction === false) {
    origins.add("http://localhost:8081");
  }
  return origins;
}
