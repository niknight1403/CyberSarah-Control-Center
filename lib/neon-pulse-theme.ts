/**
 * Sprint 156 — „CyberSarah Neon Pulse"-Design-Tokens.
 *
 * Zentrales Theme-Modul fuer das neue Dashboard: dunkler Navy-Hintergrund,
 * Neon-Akzente (Cyan/Tuerkis/Violett/Pink/Emerald), leichte Glassmorphism-
 * Flaechen, abgerundete Karten, dezente Glow-Effekte.
 *
 * Regeln aus dem Implementierungsauftrag:
 *  - Werte nur ueber diese Tokens verwenden, nie verstreute Hardcodes.
 *  - Keine permanenten schweren Blur-Animationen; Glow nur als dezente
 *    Border-/Shadow-Kombination.
 *  - Web- und Mobile-kompatibel (react-native Styles).
 */

export const neonPulse = {
  background: "#03111D",
  backgroundElevated: "#071B2A",
  backgroundMuted: "#0A2232",
  surface: "rgba(8, 27, 42, 0.88)",
  surfaceStrong: "#0B2638",
  textPrimary: "#F4F8FF",
  textSecondary: "#A9C1D8",
  textMuted: "#6D8AA4",
  cyan: "#19E6FF",
  turquoise: "#00F5D4",
  emerald: "#00F59B",
  green: "#2DFF9A",
  violet: "#A855F7",
  magenta: "#F02DFF",
  pink: "#FF4FD8",
  blue: "#25A8FF",
  warning: "#FFC857",
  danger: "#FF5577",
  border: "rgba(91, 219, 255, 0.36)",
  shadow: "rgba(0, 229, 255, 0.22)",
} as const;

/** Neon-Akzent fuer Zustandsfarben (nur mit Bedeutungstrage). */
export const statusAccent = {
  healthy: neonPulse.emerald,
  checking: neonPulse.cyan,
  degraded: neonPulse.warning,
  offline: neonPulse.danger,
  unknown: neonPulse.textMuted,
} as const;
