/**
 * Cyber-Design-System (Sprint 126) — futuristisches Dark-Theme.
 *
 * Einheitliche Design-Tokens fuer alle Cyber-Screens: OLED-Schwarz als
 * Grundflaeche, Neon-Cyan/Cyber-Pink als Akzente, klare Typografie.
 * Bewusst als eigenes Modul: Die Cyber-Screens sind self-contained und
 * kollidieren nicht mit dem bestehenden App-Theme (useColors).
 */

export const cyber = {
  /** OLED-Grundflaeche — echtes Schwarz spart auf OLED-Displays Akku. */
  bg: "#0B0F19",
  surface: "#0F172A",
  surfaceElevated: "#131B2E",
  border: "#1E293B",
  borderGlow: "rgba(0, 242, 254, 0.35)",
  /** Neon-Akzente. */
  cyan: "#00F2FE",
  pink: "#FF007F",
  green: "#00FF66",
  amber: "#F5A623",
  /** Typografie. */
  text: "#F8FAFC",
  textMuted: "#94A3B8",
  textDim: "#64748B",
} as const;

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
