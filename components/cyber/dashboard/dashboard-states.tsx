import { glassDepth,  glassPalette,  glassSurface } from "@/lib/design/future-glass";
import { useMemo , useEffect, useState } from "react";
/**
 * Sprint 156 — Loading-/Empty-/Error-States fuer das Dashboard.
 * Skeleton-Shimmer nur als dezente Opacity-Animation (performant,
 * Reduce-Motion-sicher), kein Blur.
 */
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, useAnimatedValue } from "react-native";

import { createNeonStyles } from "./neon-dashboard-styles";

/** Reduce-Motion sicher abfragen (Web-Polyfill: Promise-API). */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    try {
      AccessibilityInfo.isReduceMotionEnabled?.()
        .then((enabled: boolean) => setReduced(Boolean(enabled)))
        .catch(() => undefined);
    } catch {
      // keine Reduce-Motion-Information verfuegbar
    }
  }, []);
  return reduced;
}

export function DashboardSkeleton() {
  const opacity = useAnimatedValue(0.45);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);
  return (
    <View style={styles.wrap} accessibilityLabel="Dashboard wird geladen">
      <Animated.View style={[styles.block, styles.header, { opacity }]} />
      <Animated.View style={[styles.block, styles.user, { opacity }]} />
      <View style={styles.kpiRow}>
        {[0, 1, 2].map((index) => (
          <Animated.View key={index} style={[styles.block, styles.kpi, { opacity }]} />
        ))}
      </View>
      <View style={styles.kpiRow}>
        {[0, 1, 2].map((index) => (
          <Animated.View key={index} style={[styles.block, styles.system, { opacity }]} />
        ))}
      </View>
      <Animated.View style={[styles.block, styles.activity, { opacity }]} />
      <Animated.View style={[styles.block, styles.superAgent, { opacity }]} />
    </View>
  );
}

export function DashboardErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  
  return (
    <View style={[themeStyles.neonCard, styles.errorCard]} accessibilityLabel={`Fehler: ${message}`}>
      <Text style={styles.errorTitle}>Dashboard-Daten nicht verfügbar</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <Pressable
        accessibilityLabel="Erneut versuchen"
        accessibilityRole="button"
        style={[themeStyles.neonButton, styles.retry]}
        onPress={onRetry}
      >
        <Text style={styles.retryText}>Erneut versuchen</Text>
      </Pressable>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  wrap: { gap: 12 },
  block: { borderRadius: 18, backgroundColor: glassDepth.glass, borderWidth: 1, borderColor: "rgba(91, 219, 255, 0.14)" },
  header: { height: 48 },
  user: { height: 96 },
  kpiRow: { flexDirection: "row", gap: 12 },
  kpi: { flex: 1, height: 110 },
  system: { flex: 1, height: 180 },
  activity: { height: 120 },
  superAgent: { height: 120 },
  errorCard: { gap: 10 },
  errorTitle: { color: glassPalette.red, fontSize: 15, fontWeight: "800" },
  errorMessage: { color: glassSurface.textSecondary, fontSize: 13 },
  retry: { backgroundColor: "rgba(25, 230, 255, 0.12)", borderWidth: 1, borderColor: glassSurface.border, alignSelf: "flex-start" },
  retryText: { color: glassPalette.cyan, fontWeight: "700", fontSize: 13 },
});

const styles = createStyles();
const themeStyles = createNeonStyles();
