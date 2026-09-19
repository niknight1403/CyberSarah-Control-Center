import {  glassPalette,  glassSurface } from "@/lib/design/future-glass";
/**
 * Sprint 156 — Workspace-Karte: echte Service-Verfuegbarkeit und Anzahl,
 * keine erfundenen Projektzahlen; Empty-State wenn nichts konfiguriert.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { createNeonStyles } from "./neon-dashboard-styles";
import { workspaceStatusCopy, type WorkspaceStatus } from "@/lib/dashboard-view-model";

const ACCENT = () => ({ ready: glassPalette.green, checking: glassPalette.cyan, unavailable: glassPalette.amber, unknown: glassSurface.textSecondary });

export function WorkspaceStatusCard({
  status,
  count,
  detail,
}: {
  status: WorkspaceStatus;
  count: number | null;
  detail: string;
}) {
  
  const accent = ACCENT()[status];
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
        <IconSymbol size={13} name="chevron.right" color={glassSurface.textSecondary} />
      </View>
    </Pressable>
  );
}

const createStyles = () => StyleSheet.create({
  card: { flex: 1, minWidth: 220, gap: 10 },
  pressed: { opacity: 0.8 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10, 34, 50, 0.5)" },
  state: { fontSize: 15, fontWeight: "800" },
  meta: { fontSize: 12, color: glassSurface.textSecondary, fontVariant: ["tabular-nums"] },
  chevronRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});

const styles = createStyles();
const themeStyles = createNeonStyles();
