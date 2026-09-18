/**
 * Sprint 156 — KPI-Karte: Icon, Wert, Label mit ehrlichen Zustaenden —
 * Loading (Skeleton), Fehler (— mit Hinweis), Empty (— statt erfundener 0/99,9).
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { neonPulse as t } from "@/lib/neon-pulse-theme";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { neonStyles } from "./neon-dashboard-styles";

export function DashboardKpiCard({
  icon,
  value,
  label,
  status,
  loading,
  error,
  onPress,
  accent = t.cyan,
}: {
  icon: "sparkles" | "bolt.fill" | "checkmark.circle.fill";
  value: string;
  label: string;
  status?: string;
  loading: boolean;
  error: boolean;
  onPress?: () => void;
  accent?: string;
}) {
  const body = (
    <View style={styles.inner}>
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, { borderColor: `${accent}55` }]} accessibilityLabel={label}>
          <IconSymbol size={16} name={icon} color={accent} />
        </View>
        {loading ? <ActivityIndicator size="small" color={accent} /> : null}
      </View>
      <Text style={styles.value} accessibilityLabel={`${label}: ${value}`}>{loading ? "…" : value}</Text>
      <Text style={neonStyles.mutedLabel}>{label.toUpperCase()}</Text>
      {status ? <Text style={[styles.status, { color: accent }]}>{status}</Text> : null}
      {error && !loading ? <Text style={styles.error}>Nicht verfügbar</Text> : null}
    </View>
  );
  if (!onPress) return <View style={[neonStyles.neonCard, styles.card]}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} öffnen`}
      style={({ pressed }) => [neonStyles.neonCard, styles.card, pressed && styles.pressed]}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 104, gap: 6 },
  inner: { gap: 4 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconWrap: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10, 34, 50, 0.5)" },
  value: { fontSize: 22, fontWeight: "900", color: t.textPrimary, fontVariant: ["tabular-nums"] },
  status: { fontSize: 10, fontWeight: "700", marginTop: 2 },
  error: { fontSize: 10, fontWeight: "700", color: t.danger, marginTop: 2 },
  pressed: { opacity: 0.78 },
});
