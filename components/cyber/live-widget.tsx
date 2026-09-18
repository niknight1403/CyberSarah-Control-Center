import React, { useMemo } from "react";
import { StyleSheet, Text, View, type ViewProps } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { cyberTypography } from "@/lib/cyber-theme";

export interface LiveWidgetProps extends ViewProps {
  title: string;
  badge?: string;
  accent?: string;
  children: React.ReactNode;
}

export function LiveWidget({ title, badge, accent, children, style, ...rest }: LiveWidgetProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const resolvedAccent = accent ?? colors.tint;
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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label.toUpperCase()}</Text><Text style={[mono ? cyberTypography.mono : styles.metricValue, { color: accent ?? colors.text }]}>{value}</Text></View>;
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    widget: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
    titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    title: { ...cyberTypography.caption },
    badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    badgeText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
    accentLine: { height: 1, borderRadius: 1, opacity: 0.5 },
    metric: { gap: 2 },
    metricLabel: { ...cyberTypography.caption, color: colors.icon, fontSize: 9 },
    metricValue: { fontSize: 18, fontWeight: "800" },
  });
}
