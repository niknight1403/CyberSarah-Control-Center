/**
 * Sprint 156 — Wiederverwendbare Neon-Pulse-Styles.
 * Glassmorphism per semi-transparenter Flaeche + Border-Glow — performant
 * ohne permanente Blur-Animationen, Web- und Mobile-kompatibel.
 */
import { StyleSheet } from "react-native";

import { useColors } from "@/hooks/use-colors";

export function createNeonStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
  neonCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    overflow: "hidden",
  },
  neonCardGreen: {
    borderColor: `${colors.success}6B`,
    shadowColor: `${colors.success}38`,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  neonCardViolet: {
    borderColor: `${colors.tint}73`,
    shadowColor: `${colors.tint}40`,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  neonCardBlue: {
    borderColor: `${colors.tint}6B`,
    shadowColor: `${colors.tint}38`,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  neonCardGradient: {
    borderColor: `${colors.tint}8C`,
    shadowColor: `${colors.tint}47`,
    shadowOpacity: 0.85,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  glassSurface: {
    backgroundColor: `${colors.surface}A8`,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${colors.border}45`,
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
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text, letterSpacing: 0.4 },
  mutedLabel: { fontSize: 11, fontWeight: "600", color: colors.icon, letterSpacing: 0.8 },
  metricValue: { fontSize: 24, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  });
}
