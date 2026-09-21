import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { ParticleField, ScanlineOverlay } from "@/components/living/living-ui";
import { glassDepth, glassPalette } from "@/lib/design/future-glass";
import { withAlpha } from "@/lib/theme-color-utils";

/**
 * Sprint 49 — Premium-Hintergrund für den Chatbereich.
 * Tiefes Navy-Schwarz mit subtilen Leucht-Akzenten (Dark Command Center).
 *
 * Sprint 195 — Kontrast-Fix: Die Glow-Kreise nutzten faelschlicherweise
 * glassSurface.textSecondary/textMuted (helle Text-Token, ~#99A7B8 /
 * #6E7B8C) als VOLLE Deckkraft-Flaeche. Auf 320-340px-Kreisen wirkte das
 * wie zwei helle, fast weisse Blobs ueber Header und Chatverlauf — der
 * Chattext war darauf kaum noch zu erkennen. Jetzt: echte Akzentfarben
 * (Cyan/Purple) als Licht mit sehr geringer Deckkraft, wie im Rest des
 * Design-Systems (glassPalette = "Licht, nicht Flaeche").
 */
export function ChatBackground({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <LinearGradient colors={[glassDepth.void, glassDepth.deep, glassDepth.abyss]} locations={[0, 0.55, 1]} style={styles.gradient}>
        <View style={styles.readabilitySurface} />
        <View style={styles.glowCyan} />
        <View style={styles.glowViolet} />
        {/* Sprint 89 — Living Layer: langsam driftende Partikel + dezente
            Hologramm-Scanlines. Beide pointerEvents="none" und hinter dem
            Inhalt (zIndex 0/1), damit Interaktionen unberuehrt bleiben. */}
        <ParticleField seed={7} count={22} />
        <ScanlineOverlay intensity="subtle" />
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  gradient: { flex: 1 },
  readabilitySurface: {
    backgroundColor: withAlpha(glassDepth.void, 0.92),
    ...StyleSheet.absoluteFill,
  },
  glowCyan: {
    alignSelf: "flex-end",
    backgroundColor: withAlpha(glassPalette.cyan, 0.018),
    borderRadius: 180,
    height: 220,
    marginRight: -80,
    marginTop: -70,
    position: "absolute",
    width: 220,
  },
  glowViolet: {
    backgroundColor: withAlpha(glassPalette.purple, 0.015),
    borderRadius: 180,
    bottom: -90,
    height: 220,
    left: -80,
    position: "absolute",
    width: 220,
  },
});
