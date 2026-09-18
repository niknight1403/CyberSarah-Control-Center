/**
 * Produktive Neon-Theme-Registry für das CyberSarah Control Center.
 * Die vier Designs sind unabhängig von Hell/Dunkel und werden von
 * Onboarding, Einstellungen und ThemeProvider gemeinsam verwendet.
 */

export type DesignTheme = "pulse" | "orbit" | "synthwave" | "minimal";

export const DESIGN_THEMES: readonly DesignTheme[] = ["pulse", "orbit", "synthwave", "minimal"] as const;
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
  return "Neon Pulse";
}

export function designThemeDescription(theme: DesignTheme): string {
  if (theme === "orbit") return "Futuristisches Blau, Violett und Türkis mit orbitaler Systemübersicht.";
  if (theme === "synthwave") return "Modernes Pink, Orange und Cyan mit dynamischer KI-SaaS-Energie.";
  if (theme === "minimal") return "Reduziertes Emerald-Cyan-Design mit klarer Benutzer- und Adminübersicht.";
  return "Modernes Cyan-, Lime- und Magenta-Neon mit Glasflächen und Superagent-Fokus.";
}

export function designThemeIcon(theme: DesignTheme): "bolt.fill" | "chart.bar.fill" | "sparkles" | "wand.and.stars" {
  if (theme === "orbit") return "chart.bar.fill";
  if (theme === "synthwave") return "sparkles";
  if (theme === "minimal") return "wand.and.stars";
  return "bolt.fill";
}

export function isNeonDesign(theme: DesignTheme): boolean {
  return DESIGN_THEMES.includes(theme);
}

export function designThemeAccent(theme: DesignTheme): string {
  if (theme === "orbit") return "#8B5CFF";
  if (theme === "synthwave") return "#FF4FD8";
  if (theme === "minimal") return "#00F5D4";
  return "#19E6FF";
}
