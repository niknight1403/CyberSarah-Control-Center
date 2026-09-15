/**
 * Design-Theme-Logik (rein, testbar): Die App kennt genau drei optische
 * Designs ("Cyber Neon", "Enterprise Slate", "Glas-Modern"), die
 * unabhaengig von der Hell/Dunkel-Praeferenz geschaltet werden koennen.
 * Jedes Design definiert seine eigene Palette pro Farbschema plus
 * Effekt-Tokens (Glow, Blur, Gradient) — siehe
 * lib/_core/design-theme-palettes.ts.
 *
 * "Cyber Neon" ist seit v2.1.0 das Standard-Design. (Sprint 128:
 * Design-Kuration auf die drei im Play-Store-Listing beworbenen Themes.)
 */

export type DesignTheme = "neon" | "slate" | "glass";

/** Sprint 128 — Design-Kuration: nur die drei im Play-Store-Listing
 * beworbenen Designs bleiben auswaehlbar ("Cyber Neon", "Enterprise
 * Slate", "Glas-Modern"). Alte Auswahlwerte werden beim Lesen per
 * normalizeDesignTheme automatisch auf den Standard gemappt. */
export const DESIGN_THEMES: readonly DesignTheme[] = ["neon", "slate", "glass"] as const;

export const DEFAULT_DESIGN_THEME: DesignTheme = "neon";

/**
 * Storage-Key v2: mit dem Design-Refresh (v1.3.1) wird der Standard auf
 * Aurora Glass gesetzt — Bestandsinstallationen mit v1-Key ("neon") starten
 * einmal frisch mit dem neuen Design.
 */
export const DESIGN_THEME_STORAGE_KEY = "cybersarah.design-theme.v4";

export function normalizeDesignTheme(value: unknown): DesignTheme {
  return value === "neon" || value === "slate" || value === "glass"
    ? value
    : DEFAULT_DESIGN_THEME;
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
