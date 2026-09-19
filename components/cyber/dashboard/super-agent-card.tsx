import { glassDepth,  glassPalette,  glassSurface } from "@/lib/design/future-glass";
import { useMemo , useEffect, useState } from "react";
/**
 * Sprint 156 — Superagenten-Modul: breite Neon-Glas-Karte mit ECHTEM
 * Backend-Status. Zeigt niemals „LIVE · AKTIV" ohne aktiven Agenten und
 * startet keine kostenpflichtigen LLM-Aufrufe beim Oeffnen des Dashboards.
 */
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View, useAnimatedValue } from "react-native";
import { router } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { superAgentStatusCopy, type SuperAgentStatus } from "@/lib/dashboard-view-model";
import { createNeonStyles } from "./neon-dashboard-styles";

const STATUS_COLOR = () => ({ active: glassPalette.green, ready: glassPalette.cyan, paused: glassPalette.amber, unconfigured: glassSurface.textSecondary, offline: glassPalette.red, error: glassPalette.red });

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

export function SuperAgentCard({
  status,
  name,
  detail,
  onRetry,
}: {
  status: SuperAgentStatus;
  name: string;
  detail: string;
  onRetry: () => void;
}) {
  
  const accent = STATUS_COLOR()[status];
  const pulse = useAnimatedValue(1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion || status !== "active") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion, status]);

  const deadBackend = status === "offline" || status === "error";

  return (
    <View style={[themeStyles.neonCard, themeStyles.neonCardGradient, styles.card]}>
      <View style={styles.left}>
        <View
          style={[styles.avatarRing, { borderColor: `${accent}99`, shadowColor: accent }]}
          accessibilityLabel="Superagent-Avatar"
        >
          <View style={styles.avatar}>
            <IconSymbol size={26} name="wand.and.stars" color={accent} />
          </View>
        </View>
        <Animated.View
          style={[styles.liveDot, { backgroundColor: accent, opacity: pulse }]}
          accessibilityLabel={`Superagent-Status: ${superAgentStatusCopy[status]}`}
        />
      </View>
      <View style={styles.center}>
        <Text style={styles.title}>{name.toUpperCase()}</Text>
        <Text style={styles.subtitle}>Autonomer KI-Assistent</Text>
        <View style={styles.statusRow}>
          <Text style={[styles.statusText, { color: accent }]}>{superAgentStatusCopy[status]}</Text>
          <Text style={styles.detailText}>· {detail}</Text>
        </View>
      </View>
      <View style={styles.right}>
        {deadBackend ? (
          <Pressable
            accessibilityLabel="Superagent-Status erneut laden"
            accessibilityRole="button"
            style={({ pressed }) => [
              themeStyles.neonButton,
              styles.openButton,
              { borderColor: "rgba(255, 200, 87, 0.45)" },
              pressed && styles.pressed,
            ]}
            onPress={onRetry}
          >
            <Text style={[styles.openButtonText, { color: glassPalette.amber }]}>Erneut laden</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="Superagenten öffnen"
            accessibilityRole="button"
            style={({ pressed }) => [
              themeStyles.neonButton,
              styles.openButton,
              { borderColor: `${accent}66`, backgroundColor: `${accent}1A` },
              pressed && styles.pressed,
            ]}
            onPress={() => router.push("/superagent" as never)}
          >
            <Text style={[styles.openButtonText, { color: accent }]}>Öffnen</Text>
            <IconSymbol size={13} name="chevron.right" color={accent} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 18 },
  left: { alignItems: "center", gap: 4 },
  avatarRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: glassDepth.void,
  },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  center: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: "900", color: glassSurface.textPrimary, letterSpacing: 1.2 },
  subtitle: { fontSize: 12, color: glassSurface.textSecondary },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 },
  statusText: { fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  detailText: { fontSize: 11, color: glassSurface.textSecondary },
  right: { alignItems: "flex-end" },
  openButton: { flexDirection: "row", gap: 6, borderWidth: 1, backgroundColor: "rgba(25, 230, 255, 0.1)" },
  openButtonText: { fontWeight: "800", fontSize: 13 },
  pressed: { opacity: 0.7 },
});

const styles = createStyles();
const themeStyles = createNeonStyles();
