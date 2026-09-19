import { glassOverlay, glassPalette, glassSurface } from "@/lib/design/future-glass";
/**
 * Sprint 156 — KPI-Karte: Icon, Wert, Label mit ehrlichen Zustaenden —
 * Loading (Skeleton), Fehler (— mit Hinweis), Empty (— statt erfundener 0/99,9).
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { createNeonStyles } from "./neon-dashboard-styles";

export function DashboardKpiCard({
  icon,
  value,
  label,
  status,
  loading,
  error,
  onPress,
  accent,
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
  
  const resolvedAccent = accent ?? glassPalette.cyan;
  const body = (
    <View style={styles.inner}>
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, { borderColor: `${resolvedAccent}55` }]} accessibilityLabel={label}>
          <IconSymbol size={16} name={icon} color={resolvedAccent} />
        </View>
        {loading ? <ActivityIndicator size="small" color={resolvedAccent} /> : null}
      </View>
      <Text style={styles.value} accessibilityLabel={`${label}: ${value}`}>{loading ? "…" : value}</Text>
      <Text style={themeStyles.mutedLabel}>{label.toUpperCase()}</Text>
      {status ? <Text style={[styles.status, { color: resolvedAccent }]}>{status}</Text> : null}
      {error && !loading ? <Text style={styles.error}>Nicht verfügbar</Text> : null}
    </View>
  );
  if (!onPress) return <View style={[themeStyles.neonCard, styles.card]}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} öffnen`}
      style={({ pressed }) => [themeStyles.neonCard, styles.card, pressed && styles.pressed]}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}

const createStyles = () => StyleSheet.create({
  card: { flex: 1, minWidth: 104, gap: 6 },
  inner: { gap: 4 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconWrap: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: glassOverlay.scrim },
  value: { fontSize: 22, fontWeight: "900", color: glassSurface.textPrimary, fontVariant: ["tabular-nums"] },
  status: { fontSize: 10, fontWeight: "700", marginTop: 2 },
  error: { fontSize: 10, fontWeight: "700", color: glassPalette.red, marginTop: 2 },
  pressed: { opacity: 0.78 },
});

const styles = createStyles();
const themeStyles = createNeonStyles();
