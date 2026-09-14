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

export type DesignTheme = "living" | "retro" | "neon" | "slate" | "glass" | "aurora";

export const DESIGN_THEMES: readonly DesignTheme[] = ["living", "retro", "aurora", "neon", "slate", "glass"] as const;

export const DEFAULT_DESIGN_THEME: DesignTheme = "living";

/**
 * Storage-Key v2: mit dem Design-Refresh (v1.3.1) wird der Standard auf
 * Aurora Glass gesetzt — Bestandsinstallationen mit v1-Key ("neon") starten
 * einmal frisch mit dem neuen Design.
 */
export const DESIGN_THEME_STORAGE_KEY = "cybersarah.design-theme.v4";

export function normalizeDesignTheme(value: unknown): DesignTheme {
  return value === "living" || value === "retro" || value === "neon" || value === "slate" || value === "glass" || value === "aurora" ? value : DEFAULT_DESIGN_THEME;
}

export function designThemeLabel(theme: DesignTheme): string {
  if (theme === "living") return "Living AI Interface";
  if (theme === "retro") return "Retro Cyber-Terminal";
  if (theme === "slate") return "Enterprise Slate";
  if (theme === "glass") return "Glas-Modern";
  if (theme === "aurora") return "Aurora Glass";
  return "Cyber Neon";
}

export function designThemeDescription(theme: DesignTheme): string {
  if (theme === "living") {
    return "Lebendiges KI-Interface: Purple/Blue/Cyan, Milchglas-Ebenen, AI-Orbs und dezente Hologramm-Overlays.";
  }
  if (theme === "retro") {
    return "Echtes Schwarz, scharfes Amber (#FFB000) und harte Kanten im Stil klassischer CRT-Terminals.";
  }
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
  if (theme === "living") return "sparkles";
  if (theme === "slate") return "chart.bar.fill";
  if (theme === "glass") return "sparkles";
  if (theme === "aurora") return "wand.and.stars";
  return "bolt.fill";
}
