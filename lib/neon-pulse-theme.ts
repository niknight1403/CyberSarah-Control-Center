/**
 * Sprint 156 — „CyberSarah Neon Pulse"-Design-Tokens.
 * Dark-Cyber-Rebrand: Palette auf die offizielle Dark-Cyber-Familie
 * umgestellt (Void/Panel/Inset + Signal Cyan/Electric Violet/Ready Green/
 * Alert Amber/Fault Coral). Token-Namen unveraendert, nur Werte.
 *
 * Zentrales Theme-Modul fuer das Dashboard: dunkler Void-Hintergrund,
 * Cyan/Violet-Akzente, leichte Glassmorphism-Flaechen, abgerundete Karten,
 * dezente Glow-Effekte.
 *
 * Regeln aus dem Implementierungsauftrag:
 *  - Werte nur ueber diese Tokens verwenden, nie verstreute Hardcodes.
 *  - Keine permanenten schweren Blur-Animationen; Glow nur als dezente
 *    Border-/Shadow-Kombination.
 *  - Web- und Mobile-kompatibel (react-native Styles).
 */

export const neonPulse = {
  background: "#0A0D12",
  backgroundElevated: "#121823",
  backgroundMuted: "#1A2330",
  surface: "rgba(18, 24, 35, 0.88)",
  surfaceStrong: "#1A2330",
  textPrimary: "#F2F6FC",
  textSecondary: "#99A7B8",
  textMuted: "#6E7B8C",
  cyan: "#52D8FF",
  turquoise: "#45D996",
  emerald: "#45D996",
  green: "#45D996",
  violet: "#8B7CFF",
  magenta: "#FF6B7A",
  pink: "#FF6B7A",
  blue: "#52D8FF",
  warning: "#F6BA5E",
  danger: "#FF6B7A",
  border: "rgba(82, 216, 255, 0.36)",
  shadow: "rgba(82, 216, 255, 0.22)",
} as const;

/** Neon-Akzent fuer Zustandsfarben (nur mit Bedeutungstrage). */
export const statusAccent = {
  healthy: neonPulse.emerald,
  checking: neonPulse.cyan,
  degraded: neonPulse.warning,
  offline: neonPulse.danger,
  unknown: neonPulse.textMuted,
} as const;
