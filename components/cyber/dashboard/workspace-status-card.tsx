import { useMemo } from "react";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
/**
 * Sprint 156 — Workspace-Karte: echte Service-Verfuegbarkeit und Anzahl,
 * keine erfundenen Projektzahlen; Empty-State wenn nichts konfiguriert.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { createNeonStyles } from "./neon-dashboard-styles";
import { workspaceStatusCopy, type WorkspaceStatus } from "@/lib/dashboard-view-model";

const ACCENT = (glass: RuntimeGlassTheme) => ({ ready: glass.glassPalette.green, checking: glass.glassPalette.cyan, unavailable: glass.glassPalette.amber, unknown: glass.glassSurface.textSecondary });

export function WorkspaceStatusCard({
  status,
  count,
  detail,
}: {
  status: WorkspaceStatus;
  count: number | null;
  detail: string;
}) {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  
  const accent = ACCENT(glass)[status];
  const countText = count === null ? "—" : String(count);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Workspace: ${detail}`}
      style={({ pressed }) => [themeStyles.neonCard, styles.card, pressed && styles.pressed]}
      onPress={() => router.push("/")}
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, { borderColor: `${accent}66` }]}>
          <IconSymbol size={16} name="folder.fill" color={accent} />
        </View>
        <Text style={themeStyles.sectionTitle}>Workspace</Text>
      </View>
      <Text style={[styles.state, { color: accent }]}>{detail || workspaceStatusCopy[status]}</Text>
      <Text style={styles.meta} accessibilityLabel={`${countText} aktive Workspaces`}>{countText} aktive Workspaces</Text>
      <View style={styles.chevronRow}>
        <Text style={themeStyles.mutedLabel}>Projekte &amp; Automationen</Text>
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
  state: { fontSize: 15, fontWeight: "800" },
  meta: { fontSize: 12, color: glass.glassSurface.textSecondary, fontVariant: ["tabular-nums"] },
  chevronRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});


const themeStyles = createNeonStyles();
