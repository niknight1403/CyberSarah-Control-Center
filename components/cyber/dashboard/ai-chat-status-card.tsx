/**
 * Sprint 156 — KI-Chat-Karte: Provider-/Modellname nur wenn serverseitig
 * verfuegbar; niemals API-Keys. „Kein Provider verfuegbar" inkl. Pruef-
 * Aktion fuer Berechtigte.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { neonPulse as t } from "@/lib/neon-pulse-theme";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { neonStyles } from "./neon-dashboard-styles";
import { chatStatusCopy, type ChatStatus } from "@/lib/dashboard-view-model";

const ACCENT: Record<ChatStatus, string> = { ready: t.emerald, checking: t.cyan, unavailable: t.danger, unknown: t.textMuted };

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
  const accent = ACCENT[status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`KI-Chat: ${chatStatusCopy[status]}`}
      style={({ pressed }) => [neonStyles.neonCard, styles.card, pressed && styles.pressed]}
      onPress={() => router.push("/chat")}
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, { borderColor: `${accent}66` }]}>
          <IconSymbol size={16} name="message.fill" color={accent} />
        </View>
        <Text style={neonStyles.sectionTitle}>KI-Chat</Text>
      </View>
      <Text style={[styles.state, { color: accent }]}>{chatStatusCopy[status]}</Text>
      {provider ? <Text style={styles.meta}>{provider}{model ? ` · ${model}` : ""}</Text> : null}
      {status === "unavailable" && isAdmin ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Provider prüfen"
          style={[neonStyles.neonButton, styles.checkButton]}
          onPress={() => router.push("/admin")}
        >
          <Text style={styles.checkButtonText}>Provider prüfen</Text>
        </Pressable>
      ) : null}
      <View style={styles.chevronRow}>
        <Text style={neonStyles.mutedLabel}>Zum Chat</Text>
        <IconSymbol size={13} name="chevron.right" color={t.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 220, gap: 10 },
  pressed: { opacity: 0.8 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10, 34, 50, 0.5)" },
  state: { fontSize: 15, fontWeight: "800" },
  meta: { fontSize: 12, color: t.textSecondary },
  checkButton: { backgroundColor: "rgba(255, 85, 119, 0.12)", borderWidth: 1, borderColor: "rgba(255, 85, 119, 0.45)" },
  checkButtonText: { color: t.danger, fontWeight: "700", fontSize: 12 },
  chevronRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
