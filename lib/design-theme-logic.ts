/**
 * Sprint 355 — Aurora Flow ist das EINZIGE Design der App.
 * Die Auswahl-Registry (9 Neon-Varianten) wurde auf Wunsch des Owners
 * entfernt: keine Design-/Farbwahl mehr in Onboarding oder Einstellungen.
 * Alte gespeicherte Werte (Profil, AsyncStorage, Server) migrieren ueber
 * normalizeDesignTheme automatisch und unsichtbar auf "aurora".
 */

export type DesignTheme = "aurora";

export const DESIGN_THEMES: readonly DesignTheme[] = ["aurora"] as const;
export const DEFAULT_DESIGN_THEME: DesignTheme = "aurora";
export const DESIGN_THEME_STORAGE_KEY = "cybersarah.design-theme.v6";

/** Alle gespeicherten Werte (auch Legacy-Designs) landen auf Aurora Flow. */
export function normalizeDesignTheme(value: unknown): DesignTheme {
  return "aurora";
}

export function designThemeLabel(theme: DesignTheme): string {
  return "Aurora Flow";
}

export function designThemeDescription(theme: DesignTheme): string {
  return "Polarlicht-Flow: Violett, Cyan und Petrol ziehen als lebendige Aurora ueber Nachtblau — runde Glas-Pills, weiche Ringe.";
}

export function designThemeIcon(theme: DesignTheme): "sparkles" {
  return "sparkles";
}

export function isNeonDesign(theme: DesignTheme): boolean {
  return theme === "aurora";
}

export function designThemeAccent(theme: DesignTheme): string {
  return "#7C3AED";
}

/**
 * Start-Prioritaet bleibt formal gewahrt (Profil > Speicher > Standard),
 * aber jedes Ergebnis ist Aurora Flow — es gibt keine Wahl mehr.
 */
export function resolveInitialDesignTheme(profileTheme: unknown, storedTheme: unknown): DesignTheme {
  return "aurora";
}
