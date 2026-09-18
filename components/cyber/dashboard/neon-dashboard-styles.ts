/**
 * Sprint 156 — Wiederverwendbare Neon-Pulse-Styles.
 * Glassmorphism per semi-transparenter Flaeche + Border-Glow — performant
 * ohne permanente Blur-Animationen, Web- und Mobile-kompatibel.
 */
import { StyleSheet } from "react-native";

import { neonPulse as t } from "@/lib/neon-pulse-theme";

export const neonStyles = StyleSheet.create({
  neonCard: {
    backgroundColor: t.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: t.border,
    padding: 16,
    overflow: "hidden",
  },
  neonCardGreen: {
    borderColor: "rgba(0, 245, 155, 0.42)",
    shadowColor: "rgba(45, 255, 154, 0.22)",
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  neonCardViolet: {
    borderColor: "rgba(168, 85, 247, 0.45)",
    shadowColor: "rgba(168, 85, 247, 0.25)",
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  neonCardBlue: {
    borderColor: "rgba(37, 168, 255, 0.42)",
    shadowColor: "rgba(37, 168, 255, 0.22)",
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  neonCardGradient: {
    borderColor: "rgba(25, 230, 255, 0.55)",
    shadowColor: "rgba(240, 45, 255, 0.28)",
    shadowOpacity: 0.85,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  glassSurface: {
    backgroundColor: "rgba(10, 34, 50, 0.66)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(91, 219, 255, 0.18)",
  },
  neonButton: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: t.textPrimary, letterSpacing: 0.4 },
  mutedLabel: { fontSize: 11, fontWeight: "600", color: t.textMuted, letterSpacing: 0.8 },
  metricValue: { fontSize: 24, fontWeight: "800", color: t.textPrimary, fontVariant: ["tabular-nums"] },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});
