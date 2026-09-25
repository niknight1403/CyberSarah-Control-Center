/**
 * Produktive Neon-Theme-Registry für das CyberSarah Control Center.
 * Die vier Designs sind unabhängig von Hell/Dunkel und werden von
 * Onboarding, Einstellungen und ThemeProvider gemeinsam verwendet.
 */

export type DesignTheme =
  | "pulse"
  | "orbit"
  | "synthwave"
  | "minimal"
  | "oracle"
  | "borealis"
  | "quantum"
  | "nebula"
  | "phoenix";

export const DESIGN_THEMES: readonly DesignTheme[] = [
  "pulse",
  "orbit",
  "synthwave",
  "minimal",
  "oracle",
  "borealis",
  "quantum",
  "nebula",
  "phoenix",
] as const;
export const DEFAULT_DESIGN_THEME: DesignTheme = "pulse";
export const DESIGN_THEME_STORAGE_KEY = "cybersarah.design-theme.v5";

/** Legacy-Werte werden beim Lesen sicher auf das neue Neon-Pulse-Design migriert. */
export function normalizeDesignTheme(value: unknown): DesignTheme {
  return DESIGN_THEMES.includes(value as DesignTheme) ? (value as DesignTheme) : DEFAULT_DESIGN_THEME;
}

export function designThemeLabel(theme: DesignTheme): string {
  if (theme === "orbit") return "Cyber Orbit";
  if (theme === "synthwave") return "Neon Synthwave";
  if (theme === "minimal") return "Neon Minimal";
  if (theme === "oracle") return "Aurum Oracle";
  if (theme === "borealis") return "Aurora Veil";
  if (theme === "quantum") return "Quantum Rift";
  if (theme === "nebula") return "Nebula Drift";
  if (theme === "phoenix") return "Phoenix Ember";
  return "Neon Pulse";
}

export function designThemeDescription(theme: DesignTheme): string {
  if (theme === "orbit") return "Futuristisches Blau, Violett und Türkis mit orbitaler Systemübersicht.";
  if (theme === "synthwave") return "Modernes Pink, Orange und Cyan mit dynamischer KI-SaaS-Energie.";
  if (theme === "minimal") return "Reduziertes Emerald-Cyan-Design mit klarer Benutzer- und Adminübersicht.";
  if (theme === "oracle") return "Kosmisches Gold auf Tiefenindigo — Orakel-Glanz fuer Entscheidungen.";
  if (theme === "borealis") return "Polarlicht aus Jade, Eisblau und Violett ueber Nacht-Himmel.";
  if (theme === "quantum") return "Quanten-Violett und Elektrik-Blau fuer gesprungene Realitaeten.";
  if (theme === "nebula") return "Magenta-Nebel und Sternenstaub fuer die kosmische Kommandozentrale.";
  if (theme === "phoenix") return "Glut-Orange und Flammen-Rot — Wiedergeburt im Ember-Void.";
  return "Modernes Cyan-, Lime- und Magenta-Neon mit Glasflächen und Superagent-Fokus.";
}

export function designThemeIcon(theme: DesignTheme): "bolt.fill" | "chart.bar.fill" | "sparkles" | "wand.and.stars" | "moon.stars.fill" | "sun.max.fill" | "hurricane" | "cloud.fill" | "flame.fill" {
  if (theme === "orbit") return "chart.bar.fill";
  if (theme === "synthwave") return "sparkles";
  if (theme === "minimal") return "wand.and.stars";
  if (theme === "oracle") return "moon.stars.fill";
  if (theme === "borealis") return "sun.max.fill";
  if (theme === "quantum") return "hurricane";
  if (theme === "nebula") return "cloud.fill";
  if (theme === "phoenix") return "flame.fill";
  return "bolt.fill";
}

export function isNeonDesign(theme: DesignTheme): boolean {
  return DESIGN_THEMES.includes(theme);
}

export function designThemeAccent(theme: DesignTheme): string {
  if (theme === "orbit") return "#8B5CFF";
  if (theme === "synthwave") return "#FF4FD8";
  if (theme === "minimal") return "#00F5D4";
  if (theme === "oracle") return "#F5C542";
  if (theme === "borealis") return "#4FFFC1";
  if (theme === "quantum") return "#8E7BFF";
  if (theme === "nebula") return "#FF5AD1";
  if (theme === "phoenix") return "#FF7A3D";
  return "#52D8FF";
}

/**
 * Sprint 160 — Prioritaet beim Start: Benutzerprofil > lokaler Speicher >
 * Standardwert. Ungueltige/fehlende/kaputte Werte fallen automatisch auf
 * DEFAULT_DESIGN_THEME zurueck (ueber normalizeDesignTheme).
 */
export function resolveInitialDesignTheme(profileTheme: unknown, storedTheme: unknown): DesignTheme {
  if (typeof profileTheme === "string" && DESIGN_THEMES.includes(profileTheme as DesignTheme)) {
    return profileTheme as DesignTheme;
  }
  if (typeof storedTheme === "string" && DESIGN_THEMES.includes(storedTheme as DesignTheme)) {
    return storedTheme as DesignTheme;
  }
  return DEFAULT_DESIGN_THEME;
}
