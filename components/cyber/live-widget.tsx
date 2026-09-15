import React from "react";
import { StyleSheet, Text, View, type ViewProps } from "react-native";

import { cyber, cyberTypography } from "@/lib/cyber-theme";

/**
 * Sprint 126 — LiveWidget: Wiederverwendbarer Widget-Rahmen mit
 * Neon-Kante und optionalem Live-Puls-Indikator. Performant bewusst ohne
 * Dauer-Animationen (Akku): Der Puls ist ein statischer Glow-Dot, echte
 * Bewegung gibt es nur bei Reanimated-Micro-Interaktionen.
 */

export interface LiveWidgetProps extends ViewProps {
  title: string;
  /** Zusaetzlicher Badge rechts oben (z. B. "LIVE", "4s"). */
  badge?: string;
  /** Akzentfarbe des Widgets (Neon-Kante + Titel-Glow). */
  accent?: string;
  children: React.ReactNode;
}

export function LiveWidget({ title, badge, accent = cyber.cyan, children, style, ...rest }: LiveWidgetProps) {
  return (
    <View style={[styles.widget, { borderColor: `${accent}33` }, style]} {...rest}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: accent }]}>{title.toUpperCase()}</Text>
        {badge ? (
          <View style={[styles.badge, { borderColor: `${accent}55` }]}>
            <Text style={[styles.badgeText, { color: accent }]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.accentLine, { backgroundColor: `${accent}66` }]} />
      {children}
    </View>
  );
}

/** Kompakter KPI-Wert im Widget (gross, neon, mono bei Zahlen). */
export function WidgetMetric({
  label,
  value,
  accent,
  mono = true,
}: {
  label: string;
  value: string;
  accent?: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label.toUpperCase()}</Text>
      <Text style={[mono ? cyberTypography.mono : styles.metricValue, { color: accent ?? cyber.text }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  widget: {
    backgroundColor: cyber.surface,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { ...cyberTypography.caption },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  accentLine: { height: 1, borderRadius: 1, opacity: 0.5 },
  metric: { gap: 2 },
  metricLabel: { ...cyberTypography.caption, color: cyber.textDim, fontSize: 9 },
  metricValue: { fontSize: 18, fontWeight: "800" },
});
