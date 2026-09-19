import React, { useMemo } from "react";
import { StyleSheet, Text, View, type ViewProps } from "react-native";
import { glassDepth,  glassPalette,  glassSurface } from "@/lib/design/future-glass";
import { cyberTypography } from "@/lib/cyber-theme";

export interface LiveWidgetProps extends ViewProps {
  title: string;
  badge?: string;
  accent?: string;
  children: React.ReactNode;
}

export function LiveWidget({ title, badge, accent, children, style, ...rest }: LiveWidgetProps) {
  const resolvedAccent = accent ?? glassPalette.cyan;
  return (
    <View style={[styles.widget, { borderColor: `${resolvedAccent}33` }, style]} {...rest}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: resolvedAccent }]}>{title.toUpperCase()}</Text>
        {badge ? <View style={[styles.badge, { borderColor: `${resolvedAccent}55` }]}><Text style={[styles.badgeText, { color: resolvedAccent }]}>{badge}</Text></View> : null}
      </View>
      <View style={[styles.accentLine, { backgroundColor: `${resolvedAccent}66` }]} />
      {children}
    </View>
  );
}

export function WidgetMetric({ label, value, accent, mono = true }: { label: string; value: string; accent?: string; mono?: boolean }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label.toUpperCase()}</Text><Text style={[mono ? cyberTypography.mono : styles.metricValue, { color: accent ?? glassSurface.textPrimary }]}>{value}</Text></View>;
}

function createStyles() {
  return StyleSheet.create({
    widget: { backgroundColor: glassDepth.glass, borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
    titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    title: { ...cyberTypography.caption },
    badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    badgeText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
    accentLine: { height: 1, borderRadius: 1, opacity: 0.5 },
    metric: { gap: 2 },
    metricLabel: { ...cyberTypography.caption, color: glassSurface.textSecondary, fontSize: 9 },
    metricValue: { fontSize: 18, fontWeight: "800" },
  });
}

const styles = createStyles();
