/**
 * MetricTile (Sprint 168) — futuristische Mini-Kennzahlen-Kachel
 * (Referenz §10: Aktive Agents/Provider/Uptime …). Konfigurierbar statt
 * Duplikat-Komponenten pro Tab: <MetricTile icon label value accent />.
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { GlassCard } from "@/components/glass/glass-primitives";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
import { type GlassAccent } from "@/lib/design/future-glass";

interface MetricTileProps {
  icon: string;
  label: string;
  value: string;
  accent?: GlassAccent;
  statusNote?: string;
  onPress?: () => void;
}

export function MetricTile({ icon, label, value, accent = "cyan", statusNote, onPress }: MetricTileProps) {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  return (
    <GlassCard accent={accent} glow={1} onPress={onPress} style={styles.card}>
      {/* Diagonaler Akzent-Wash — Kachel bekommt Licht von oben links (Sprint 192). */}
      <LinearGradient
        colors={[glass.accentAlpha(accent, 0.12), "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 0.9 }}
        style={styles.wash}
        pointerEvents="none"
      />
      <View style={[styles.iconWrap, { backgroundColor: glass.accentAlpha(accent, 0.14) }]}>
        <IconSymbol size={16} name={icon as never} color={glass.glassPalette[accent]} />
      </View>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      {statusNote ? <Text style={[styles.note, { color: glass.glassPalette[accent] }]} numberOfLines={1}>{statusNote}</Text> : null}
    </GlassCard>
  );
}

const createStyles = (glass: RuntimeGlassTheme) => StyleSheet.create({
  card: { flex: 1, gap: 6, paddingVertical: glass.glassSpacing.md, paddingHorizontal: glass.glassSpacing.md, minHeight: 92 },
  iconWrap: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  wash: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  value: { ...glass.glassType.headline, color: glass.glassSurface.textPrimary, fontSize: 20 },
  label: { ...glass.glassType.label, color: glass.glassSurface.textMuted },
  note: { fontSize: 10, fontWeight: "700" },
});
