/**
 * ControlModuleCard (Sprint 168) — grosse interaktive Control-Module
 * (Referenz §11: Systemstatus/KI-Chat/Workspace). Konfigurierbar statt
 * separater Karten-Komponenten pro Modul.
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
import { type GlassAccent } from "@/lib/design/future-glass";

interface ControlModuleCardProps {
  icon: string;
  title: string;
  description: string;
  metricValue?: string;
  metricLabel?: string;
  statusLabel: string;
  accent?: GlassAccent;
  live?: boolean;
  onPress?: () => void;
}

export function ControlModuleCard({
  icon,
  title,
  description,
  metricValue,
  metricLabel,
  statusLabel,
  accent = "cyan",
  live = false,
  onPress,
}: ControlModuleCardProps) {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  return (
    <GlassCard accent={accent} glow={live ? 1 : 0} onPress={onPress} style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.iconWrap, { backgroundColor: glass.accentAlpha(accent, 0.14) }]}>
          <IconSymbol size={18} name={icon as never} color={glass.glassPalette[accent]} />
        </View>
        {onPress ? <IconSymbol size={14} name="chevron.right" color={glass.glassSurface.textMuted} /> : null}
      </View>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <StatusChip label={statusLabel} accent={accent} live={live} />
      <Text style={styles.description} numberOfLines={2}>{description}</Text>
      {metricValue ? (
        <View style={styles.metricRow}>
          <Text style={[styles.metricValue, { color: glass.glassPalette[accent] }]}>{metricValue}</Text>
          {metricLabel ? <Text style={styles.metricLabel}>{metricLabel}</Text> : null}
        </View>
      ) : null}
    </GlassCard>
  );
}

const createStyles = (glass: RuntimeGlassTheme) => StyleSheet.create({
  card: { flex: 1, gap: 8, minHeight: 148 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconWrap: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title: { ...glass.glassType.title, color: glass.glassSurface.textPrimary, fontSize: 14 },
  description: { fontSize: 11, color: glass.glassSurface.textSecondary, lineHeight: 15, marginTop: 2 },
  metricRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: "auto" as const, paddingTop: glass.glassSpacing.xs },
  metricValue: { fontSize: 18, fontWeight: "800" },
  metricLabel: { fontSize: 10, color: glass.glassSurface.textMuted, fontWeight: "600" },
});
