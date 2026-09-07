import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";

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
 */
export function TypingIndicator({ label = "Sarah analysiert" }: { label?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.dots}>
        <Dot delayMs={0} />
        <Dot delayMs={180} />
        <Dot delayMs={360} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignSelf: "flex-start", backgroundColor: "#0B1522", borderColor: "#1C2C42", borderRadius: 16, borderWidth: 1, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 12 },
  dots: { alignItems: "center", flexDirection: "row", gap: 5, height: 8 },
  dot: { backgroundColor: "#38E1FF", borderRadius: 3, height: 6, width: 6 },
});
