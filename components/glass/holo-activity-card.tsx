/**
 * HoloActivityCard (Sprint 168) — Live-AI-Monitor der Aktivitaets-Kachel
 * (Referenz §12): LIVE-Chip, Zaehlwert, Trend, animiertes Holo-Line-Chart.
 *
 * Ausschliesslich echte Backend-Zahlen (count/changePercent/points) — bei
 * fehlenden Daten ehrlicher Empty-State, KEINE erfundenen Werte. Die Linie
 * animiert beim Erscheinen neuer Daten sanft ein (Opacity+Breite), keine
 * Dauer-Animation im Leerlauf (Performance).
 */

import React, { useEffect, useMemo } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useAnimatedValue } from "@/lib/use-animated-value";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { sparklineGeometry } from "@/lib/dashboard-view-model";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";

const CHART_WIDTH = 280;
const CHART_HEIGHT = 56;

function buildPath(geometry: { x: number; y: number }[]): string {
  if (geometry.length < 2) return "";
  return geometry
    .map((point, index) => {
      const x = point.x * CHART_WIDTH;
      const y = CHART_HEIGHT - point.y * (CHART_HEIGHT - 8) - 4;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function HoloActivityCard({
  count,
  changePercent,
  points,
}: {
  count: number | null;
  changePercent: number | null;
  points: number[];
}) {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  const geometry = sparklineGeometry(points);
  const hasData = geometry.length >= 2;
  const path = buildPath(geometry);
  const fadeIn = useAnimatedValue(0);

  useEffect(() => {
    fadeIn.setValue(0);
    Animated.timing(fadeIn, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [fadeIn, points.length, count]);

  return (
    <GlassCard accent="blue" glow={0} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>AKTIVITÄTEN</Text>
          <StatusChip label="LIVE" accent="green" live />
        </View>
        <View style={styles.valueRow}>
          <Text style={styles.value}>{count === null ? "—" : String(count)}</Text>
          {typeof changePercent === "number" ? (
            <Text style={[styles.change, { color: changePercent >= 0 ? glass.glassPalette.green : glass.glassPalette.red }]}>
              {changePercent >= 0 ? "+" : ""}{changePercent}%
            </Text>
          ) : null}
        </View>
      </View>

      {hasData ? (
        <Animated.View style={{ opacity: fadeIn }}>
          <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
            <Defs>
              <LinearGradient id="holoFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={glass.glassPalette.blue} stopOpacity={0.35} />
                <Stop offset="1" stopColor={glass.glassPalette.blue} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={`${path} L${CHART_WIDTH},${CHART_HEIGHT} L0,${CHART_HEIGHT} Z`} fill="url(#holoFill)" />
            <Path d={path} stroke={glass.glassPalette.blue} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Animated.View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Noch keine Aktivitätsdaten</Text>
        </View>
      )}
    </GlassCard>
  );
}

const createStyles = (glass: RuntimeGlassTheme) => StyleSheet.create({
  card: { gap: glass.glassSpacing.sm },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  titleRow: { gap: 6 },
  title: { ...glass.glassType.label, color: glass.glassSurface.textMuted },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  value: { fontSize: 26, fontWeight: "900", color: glass.glassSurface.textPrimary, fontVariant: ["tabular-nums"] },
  change: { fontSize: 12, fontWeight: "700" },
  emptyState: {
    height: CHART_HEIGHT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: glass.glassSurface.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { fontSize: 11, color: glass.glassSurface.textMuted },
});
