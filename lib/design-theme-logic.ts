/**
 * Design-Theme-Logik (rein, testbar): Die App kennt vier optische Designs
 * ("Cyber Neon", "Enterprise Slate", "Glas-Modern", "Aurora Glass"), die
 * unabhaengig von der Hell/Dunkel-Praeferenz geschaltet werden koennen.
 * Jedes Design definiert seine eigene Palette pro Farbschema plus
 * Effekt-Tokens (Glow, Blur, Gradient) — siehe
 * lib/_core/design-theme-palettes.ts.
 *
 * "Aurora Glass" ist seit v1.3.1 das Standard-Design (weicher
 * Violett-Teal-Verlauf, Milchglas-Flaechen, sanfte Glows).
 */

export type DesignTheme = "neon" | "slate" | "glass" | "aurora";

export const DESIGN_THEMES: readonly DesignTheme[] = ["aurora", "neon", "slate", "glass"] as const;

export const DEFAULT_DESIGN_THEME: DesignTheme = "aurora";

/**
 * Storage-Key v2: mit dem Design-Refresh (v1.3.1) wird der Standard auf
 * Aurora Glass gesetzt — Bestandsinstallationen mit v1-Key ("neon") starten
 * einmal frisch mit dem neuen Design.
 */
export const DESIGN_THEME_STORAGE_KEY = "cybersarah.design-theme.v2";

export function normalizeDesignTheme(value: unknown): DesignTheme {
  return value === "neon" || value === "slate" || value === "glass" || value === "aurora" ? value : DEFAULT_DESIGN_THEME;
}

export function designThemeLabel(theme: DesignTheme): string {
  if (theme === "slate") return "Enterprise Slate";
  if (theme === "glass") return "Glas-Modern";
  if (theme === "aurora") return "Aurora Glass";
  return "Cyber Neon";
}

export function designThemeDescription(theme: DesignTheme): string {
  if (theme === "slate") {
    return "Professionell, hell und dicht — klare neutrale Flächen für Produktivität.";
  }
  if (theme === "glass") {
    return "Transluzente Flächen, weiche Gradients und Blur-Overlays.";
  }
  if (theme === "aurora") {
    return "Violett-Teal-Aurora-Verlauf auf Indigo, Milchglas-Karten mit Blur und sanften Glows.";
  }
  return "Kontrastreicher Obsidian-Dark-Look mit Cyan-/Magenta-Glow-Akzenten.";
}

export function designThemeIcon(theme: DesignTheme): "bolt.fill" | "chart.bar.fill" | "sparkles" | "wand.and.stars" {
  if (theme === "slate") return "chart.bar.fill";
  if (theme === "glass") return "sparkles";
  if (theme === "aurora") return "wand.and.stars";
  return "bolt.fill";
}
