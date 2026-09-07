import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/**
 * Sprint 49 — Premium-Hintergrund für den Chatbereich.
 * Tiefes Navy-Schwarz mit subtilen Leucht-Akzenten (Dark Command Center).
 */
export function ChatBackground({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <LinearGradient colors={["#04070E", "#071120", "#050A14"]} locations={[0, 0.55, 1]} style={styles.gradient}>
        <View style={styles.glowCyan} />
        <View style={styles.glowViolet} />
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
    backgroundColor: "rgba(56, 225, 255, 0.10)",
    borderRadius: 220,
    height: 320,
    marginRight: -120,
    marginTop: -140,
    position: "absolute",
    width: 320,
  },
  glowViolet: {
    backgroundColor: "rgba(124, 92, 255, 0.08)",
    borderRadius: 260,
    bottom: -160,
    height: 340,
    left: -140,
    position: "absolute",
    width: 340,
  },
});
