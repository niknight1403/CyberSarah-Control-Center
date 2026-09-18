/**
 * Cyber-Design-System (Sprint 126, Farb-Update Sprint 132, Dark-Cyber-Rebrand)
 * — Dark-Cyber-Theme.
 *
 * Einheitliche Design-Tokens fuer alle Cyber-Screens. Seit dem
 * Dark-Cyber-Rebrand gilt strikt die offizielle CyberSarah-Palette:
 *   Void #0A0D12 · Panel #121823 · Inset #1A2330
 *   Signal Cyan #52D8FF · Electric Violet #8B7CFF
 *   Ready Green #45D996 · Alert Amber #F6BA5E · Fault Coral #FF6B7A
 *   Text #F2F6FC · Secondary #99A7B8
 * Alle bestehenden Token-Namen (cyan, pink, green, amber, bg, surface, …)
 * bleiben erhalten — nur die Werte haben sich geaendert, kein Screen musste
 * angepasst werden. `purple` und `blue` bleiben als Verlaufs-/Akzent-Token
 * erhalten und liegen auf der Palette (Violett bzw. Signal Cyan).
 */

import { Platform } from "react-native";

export const cyber = {
  /** Void — dunkel genug fuer OLED-Ersparnis, leicht blaeulicher Unterton. */
  bg: "#0A0D12",
  /** Panel — Karten und Flaechen. */
  surface: "#121823",
  /** Input/Code-Inset — leicht erhoebene Flaechen und Code-Bloecke. */
  surfaceElevated: "#1A2330",
  border: "#29384A",
  borderGlow: "rgba(139, 124, 255, 0.35)",
  /** Akzente der Dark-Cyber-Palette. */
  pink: "#FF6B7A",
  purple: "#8B7CFF",
  blue: "#52D8FF",
  cyan: "#52D8FF",
  green: "#45D996",
  amber: "#F6BA5E",
  /** Typografie. */
  text: "#F2F6FC",
  textMuted: "#99A7B8",
  textDim: "#6E7B8C",
} as const;

/** Verlauf fuer Hero-Flaechen/Glow-Effekte (Coral → Violet → Signal Cyan). */
export const cyberGradient = [cyber.pink, cyber.purple, cyber.blue, cyber.cyan] as const;

/** Statusfarben — einheitlich in Widgets, Agent-Cards und Terminal. */
export const statusColors = {
  idle: "#6E7B8C",
  running: cyber.cyan,
  error: "#FF6B7A",
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
