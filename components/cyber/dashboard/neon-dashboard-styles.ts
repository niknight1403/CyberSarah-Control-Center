/**
 * Sprint 156 — Wiederverwendbare Neon-Pulse-Styles.
 * Glassmorphism per semi-transparenter Flaeche + Border-Glow — performant
 * ohne permanente Blur-Animationen, Web- und Mobile-kompatibel.
 */
import { StyleSheet } from "react-native";

import { glassDepth,  glassPalette,  glassSurface } from "@/lib/design/future-glass";

export function createNeonStyles() {
  return StyleSheet.create({
  neonCard: {
    backgroundColor: glassDepth.glass,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: glassSurface.border,
    padding: 16,
    overflow: "hidden",
  },
  neonCardGreen: {
    borderColor: `${glassPalette.green}6B`,
    shadowColor: `${glassPalette.green}38`,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  neonCardViolet: {
    borderColor: `${glassPalette.cyan}73`,
    shadowColor: `${glassPalette.cyan}40`,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  neonCardBlue: {
    borderColor: `${glassPalette.cyan}6B`,
    shadowColor: `${glassPalette.cyan}38`,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  neonCardGradient: {
    borderColor: `${glassPalette.cyan}8C`,
    shadowColor: `${glassPalette.cyan}47`,
    shadowOpacity: 0.85,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  glassSurface: {
    backgroundColor: `${glassDepth.glass}A8`,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${glassSurface.border}45`,
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
  sectionTitle: { fontSize: 15, fontWeight: "800", color: glassSurface.textPrimary, letterSpacing: 0.4 },
  mutedLabel: { fontSize: 11, fontWeight: "600", color: glassSurface.textSecondary, letterSpacing: 0.8 },
  metricValue: { fontSize: 24, fontWeight: "800", color: glassSurface.textPrimary, fontVariant: ["tabular-nums"] },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  });
}
