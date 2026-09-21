import { useMemo } from "react";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
/**
 * Sprint 156 — Systemstatus-Karte: echte Werte aus appStatus (Uptime,
 * Workspace-Ping), korrekt abgeleitet — „/api/health != DB-Readiness".
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { createNeonStyles } from "./neon-dashboard-styles";
import type { SystemStatus } from "@/lib/dashboard-view-model";

const ACCENT = (glass: RuntimeGlassTheme) => ({ healthy: glass.glassPalette.green, checking: glass.glassPalette.cyan, degraded: glass.glassPalette.amber, offline: glass.glassPalette.red, unknown: glass.glassSurface.textSecondary });

export function SystemStatusCard({
  status,
  detail,
  uptimeText,
  offline,
  onRetry,
}: {
  status: SystemStatus;
  detail: string;
  uptimeText: string;
  offline: boolean;
  onRetry: () => void;
}) {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  
  const accent = ACCENT(glass)[status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Systemstatus: ${detail}, Uptime ${uptimeText}`}
      style={({ pressed }) => [themeStyles.neonCard, styles.card, pressed && styles.pressed]}
      onPress={() => router.push("/quality")}
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, { borderColor: `${accent}66` }]}>
          <IconSymbol size={16} name="checkmark.circle.fill" color={accent} />
        </View>
        <Text style={themeStyles.sectionTitle}>Systemstatus</Text>
      </View>
      <Text style={[styles.state, { color: accent }]}>{detail}</Text>
      <View style={styles.uptimeRow}>
        <View style={styles.uptimeTrack} accessibilityLabel="Uptime-Anzeige">
          <View style={[styles.uptimeBar, { backgroundColor: accent, width: status === "healthy" ? "100%" : status === "degraded" ? "55%" : "12%" }]} />
        </View>
        <Text style={styles.uptimeValue}>{uptimeText}</Text>
      </View>
      {offline ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Erneut prüfen" style={[themeStyles.neonButton, styles.retry]} onPress={onRetry}>
          <Text style={styles.retryText}>Erneut prüfen</Text>
        </Pressable>
      ) : null}
      <View style={styles.chevronRow}>
        <Text style={themeStyles.mutedLabel}>Details</Text>
        <IconSymbol size={13} name="chevron.right" color={glass.glassSurface.textSecondary} />
      </View>
    </Pressable>
  );
}

const createStyles = (glass: RuntimeGlassTheme) => StyleSheet.create({
  card: { flex: 1, minWidth: 220, gap: 10 },
  pressed: { opacity: 0.8 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: glass.glassOverlay.scrim },
  state: { fontSize: 16, fontWeight: "800" },
  uptimeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  uptimeTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: glass.glassOverlay.track, overflow: "hidden" },
  uptimeBar: { height: 6, borderRadius: 3 },
  uptimeValue: { fontSize: 13, fontWeight: "800", color: glass.glassSurface.textPrimary, fontVariant: ["tabular-nums"] },
  retry: { backgroundColor: glass.accentAlpha("amber", 0.12), borderWidth: 1, borderColor: glass.accentAlpha("amber", 0.4) },
  retryText: { color: glass.glassPalette.amber, fontWeight: "700", fontSize: 12 },
  chevronRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});


const themeStyles = createNeonStyles();
