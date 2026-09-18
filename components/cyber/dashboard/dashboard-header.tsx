/**
 * Sprint 156 — Dashboard-Header: Logo, Schriftzug, Notification-Bell mit
 * ehrlichem Indikator (nur bei echten Fehlern aus dem Backend-Status).
 */
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { router } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { neonPulse as t } from "@/lib/neon-pulse-theme";

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

export function DashboardHeader({ hasAlerts }: { hasAlerts: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <View style={styles.row}>
      <View style={styles.brand}>
        <View style={styles.logoMark} accessibilityLabel="CyberSarah Logo">
          <Text style={styles.logoGlyph}>CS</Text>
        </View>
        <View>
          <Text style={styles.title}>CyberSarah</Text>
          <Text style={styles.subtitle}>CONTROL CENTER</Text>
        </View>
      </View>
      <Pressable
        accessibilityLabel={
          hasAlerts
            ? "Meldungen öffnen — es gibt Systemmeldungen"
            : "Meldungen öffnen — keine offenen Meldungen"
        }
        accessibilityRole="button"
        style={({ pressed }) => [styles.bell, pressed && styles.bellPressed]}
        onPress={() => router.push("/quality" as never)}
      >
        <IconSymbol size={20} name="exclamationmark.triangle.fill" color={t.textSecondary} />
        {hasAlerts ? <View style={[styles.alertDot, reduceMotion && styles.alertDotStatic]} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(25, 230, 255, 0.12)",
    borderWidth: 1,
    borderColor: t.border,
  },
  logoGlyph: { color: t.cyan, fontWeight: "900", fontSize: 14, letterSpacing: 1 },
  title: { color: t.textPrimary, fontSize: 17, fontWeight: "800", letterSpacing: 0.3 },
  subtitle: { color: t.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.6 },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
  },
  bellPressed: { backgroundColor: t.surfaceStrong },
  alertDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: t.pink,
    shadowColor: t.pink,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  alertDotStatic: { shadowOpacity: 0 },
});
