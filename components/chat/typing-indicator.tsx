import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";

import { accentAlpha, glassPalette, glassSurface } from "@/lib/design/future-glass";

function Dot({ delayMs }: { delayMs: number }) {
  const opacity = useSharedValue(0.25);
  useEffect(() => {
    opacity.value = withRepeat(withDelay(delayMs, withSequence(withTiming(1, { duration: 380 }), withTiming(0.25, { duration: 380 }))), -1, false);
  }, [delayMs, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, animated]} />;
}

/**
 * Sprint 49 — Pulsierender „Sarah denkt"-Indikator.
 * Sprint 168 — Future-Glass-Farben + optionales Zustands-Label
 * (Referenz §16: Thinking/Searching/Analyzing/Executing/Completed).
 */
export function TypingIndicator({ label = "Sarah analysiert" }: { label?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.dots}>
        <Dot delayMs={0} />
        <Dot delayMs={180} />
        <Dot delayMs={360} />
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: glassSurface.card, borderColor: glassSurface.border, borderRadius: 16, borderWidth: 1, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 12 },
  dots: { alignItems: "center", flexDirection: "row", gap: 5, height: 8 },
  dot: { backgroundColor: glassPalette.cyan, borderRadius: 3, height: 6, width: 6, shadowColor: glassPalette.cyan, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  label: { color: glassSurface.textSecondary, fontSize: 12, fontWeight: "600" },
});
