/**
 * Design-Theme-Logik (rein, testbar): Die App kennt drei optische Designs
 * ("Cyber Neon", "Enterprise Slate", "Glas-Modern"), die unabhaengig von der
 * Hell/Dunkel-Praeferenz geschaltet werden koennen. Jedes Design definiert
 * seine eigene Palette pro Farbschema plus Effekt-Tokens (Glow, Blur,
 * Gradient) — siehe lib/_core/design-theme-palettes.ts.
 */

export type DesignTheme = "neon" | "slate" | "glass";

export const DESIGN_THEMES: readonly DesignTheme[] = ["neon", "slate", "glass"] as const;

export const DESIGN_THEME_STORAGE_KEY = "cybersarah.design-theme.v1";

export function normalizeDesignTheme(value: unknown): DesignTheme {
  return value === "neon" || value === "slate" || value === "glass" ? value : "neon";
}

export function designThemeLabel(theme: DesignTheme): string {
  if (theme === "slate") return "Enterprise Slate";
  if (theme === "glass") return "Glas-Modern";
  return "Cyber Neon";
}

export function designThemeDescription(theme: DesignTheme): string {
  if (theme === "slate") {
    return "Professionell, hell und dicht — klare neutrale Flächen für Produktivität.";
  }
  if (theme === "glass") {
    return "Transluzente Flächen, weiche Gradients und Blur-Overlays.";
  }
  return "Kontrastreicher Obsidian-Dark-Look mit Cyan-/Magenta-Glow-Akzenten.";
}

export function designThemeIcon(theme: DesignTheme): "bolt.fill" | "chart.bar.fill" | "sparkles" {
  if (theme === "slate") return "chart.bar.fill";
  if (theme === "glass") return "sparkles";
  return "bolt.fill";
}
