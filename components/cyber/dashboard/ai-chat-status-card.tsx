import { useMemo } from "react";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
/**
 * Sprint 156 — KI-Chat-Karte: Provider-/Modellname nur wenn serverseitig
 * verfuegbar; niemals API-Keys. „Kein Provider verfuegbar" inkl. Pruef-
 * Aktion fuer Berechtigte.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { createNeonStyles } from "./neon-dashboard-styles";
import { chatStatusCopy, type ChatStatus } from "@/lib/dashboard-view-model";

const ACCENT = (glass: RuntimeGlassTheme) => ({ ready: glass.glassPalette.green, checking: glass.glassPalette.cyan, unavailable: glass.glassPalette.red, unknown: glass.glassSurface.textSecondary });

export function AiChatStatusCard({
  status,
  provider,
  model,
  isAdmin,
}: {
  status: ChatStatus;
  provider?: string;
  model?: string;
  isAdmin: boolean;
}) {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  
  const accent = ACCENT(glass)[status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`KI-Chat: ${chatStatusCopy[status]}`}
      style={({ pressed }) => [themeStyles.neonCard, styles.card, pressed && styles.pressed]}
      onPress={() => router.push("/chat")}
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, { borderColor: `${accent}66` }]}>
          <IconSymbol size={16} name="message.fill" color={accent} />
        </View>
        <Text style={themeStyles.sectionTitle}>KI-Chat</Text>
      </View>
      <Text style={[styles.state, { color: accent }]}>{chatStatusCopy[status]}</Text>
      {provider ? <Text style={styles.meta}>{provider}{model ? ` · ${model}` : ""}</Text> : null}
      {status === "unavailable" && isAdmin ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Provider prüfen"
          style={[themeStyles.neonButton, styles.checkButton]}
          onPress={() => router.push("/admin")}
        >
          <Text style={styles.checkButtonText}>Provider prüfen</Text>
        </Pressable>
      ) : null}
      <View style={styles.chevronRow}>
        <Text style={themeStyles.mutedLabel}>Zum Chat</Text>
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
  meta: { fontSize: 12, color: glass.glassSurface.textSecondary },
  checkButton: { backgroundColor: glass.accentAlpha("red", 0.12), borderWidth: 1, borderColor: glass.accentAlpha("red", 0.45) },
  checkButtonText: { color: glass.glassPalette.red, fontWeight: "700", fontSize: 12 },
  chevronRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});


const themeStyles = createNeonStyles();
