/**
 * Cyber-Design-System (Sprint 126, Farb-Update Sprint 132) — futuristisches
 * Dark-Theme.
 *
 * Einheitliche Design-Tokens fuer alle Cyber-Screens: Indigo-Schwarz als
 * Grundflaeche, ein vierfarbiges Neon-Spektrum (Pink → Violett → Blau →
 * Cyan) als Akzente, klare Typografie. Bewusst als eigenes Modul: Die
 * Cyber-Screens sind self-contained und kollidieren nicht mit dem
 * bestehenden App-Theme (useColors).
 *
 * Sprint 132: Palette auf Wunsch durch ein moderneres, kontrastreicheres
 * Neon-Spektrum ersetzt (inspiriert von aktuellen App-Store-Neon-Brandings —
 * Pink/Magenta → Violett → Elektroblau → Cyan statt reinem Cyan/Pink-Duo).
 * Alle bestehenden Token-Namen (cyan, pink, green, amber, bg, surface, …)
 * bleiben erhalten — nur die Werte aendern sich, kein Screen musste
 * angepasst werden. `purple` und `blue` sind neu und stehen fuer Verlaeufe
 * und zusaetzliche Akzent-Faelle zur Verfuegung.
 */

export const cyber = {
  /** Indigo-Schwarz-Grundflaeche — dunkel genug fuer OLED-Ersparnis, mit
   * leichtem Blau-/Violett-Unterton statt reinem Neutral-Schwarz. */
  bg: "#0A0A14",
  surface: "#12121F",
  surfaceElevated: "#181830",
  border: "#242440",
  borderGlow: "rgba(139, 92, 246, 0.35)",
  /** Neon-Spektrum (Pink → Violett → Blau → Cyan). */
  pink: "#FF2D95",
  purple: "#8B5CF6",
  blue: "#3D8BFD",
  cyan: "#00E5FF",
  green: "#39FF88",
  amber: "#FFB020",
  /** Typografie. */
  text: "#F5F5FF",
  textMuted: "#9C9CC0",
  textDim: "#6B6B8F",
} as const;

/** Vierfarbiger Verlauf fuer Hero-Flaechen/Glow-Effekte (Pink → Cyan). */
export const cyberGradient = [cyber.pink, cyber.purple, cyber.blue, cyber.cyan] as const;

/** Statusfarben — einheitlich in Widgets, Agent-Cards und Terminal. */
export const statusColors = {
  idle: "#6B7280",
  running: cyber.cyan,
  error: cyber.pink,
  success: cyber.green,
  warn: cyber.amber,
} as const;

export type CyberStatus = keyof typeof statusColors;

export const cyberTypography = {
  display: { fontSize: 28, fontWeight: "800", letterSpacing: 1.5 } as const,
  headline: { fontSize: 18, fontWeight: "700", letterSpacing: 0.5 } as const,
  body: { fontSize: 14, fontWeight: "500" } as const,
  caption: { fontSize: 11, fontWeight: "600", letterSpacing: 1 } as const,
  mono: { fontSize: 12, fontWeight: "500", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) } as const,
} as const;

import { Platform } from "react-native";
