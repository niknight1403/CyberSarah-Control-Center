/**
 * MetricTile (Sprint 168) — futuristische Mini-Kennzahlen-Kachel
 * (Referenz §10: Aktive Agents/Provider/Uptime …). Konfigurierbar statt
 * Duplikat-Komponenten pro Tab: <MetricTile icon label value accent />.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { GlassCard } from "@/components/glass/glass-primitives";
import { accentAlpha, glassPalette, glassSpacing, glassSurface, glassType, type GlassAccent } from "@/lib/design/future-glass";

interface MetricTileProps {
  icon: string;
  label: string;
  value: string;
  accent?: GlassAccent;
  statusNote?: string;
  onPress?: () => void;
}

export function MetricTile({ icon, label, value, accent = "cyan", statusNote, onPress }: MetricTileProps) {
  return (
    <GlassCard accent={accent} glow={0} onPress={onPress} style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: accentAlpha(accent, 0.14) }]}>
        <IconSymbol size={16} name={icon as never} color={glassPalette[accent]} />
      </View>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      {statusNote ? <Text style={[styles.note, { color: glassPalette[accent] }]} numberOfLines={1}>{statusNote}</Text> : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 6, paddingVertical: glassSpacing.md, paddingHorizontal: glassSpacing.md, minHeight: 92 },
  iconWrap: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  value: { ...glassType.headline, color: glassSurface.textPrimary, fontSize: 20 },
  label: { ...glassType.label, color: glassSurface.textMuted },
  note: { fontSize: 10, fontWeight: "700" },
});
