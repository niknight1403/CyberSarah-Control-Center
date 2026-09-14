import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { ParticleField, ScanlineOverlay } from "@/components/living/living-ui";

/**
 * Sprint 49 — Premium-Hintergrund für den Chatbereich.
 * Tiefes Navy-Schwarz mit subtilen Leucht-Akzenten (Dark Command Center).
 */
export function ChatBackground({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0A0E1F", "#150F38", "#062033"]} locations={[0, 0.55, 1]} style={styles.gradient}>
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
  glowCyan: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(56, 209, 255, 0.12)",
    borderRadius: 220,
    height: 320,
    marginRight: -120,
    marginTop: -140,
    position: "absolute",
    width: 320,
  },
  glowViolet: {
    backgroundColor: "rgba(124, 92, 255, 0.10)",
    borderRadius: 260,
    bottom: -160,
    height: 340,
    left: -140,
    position: "absolute",
    width: 340,
  },
});
