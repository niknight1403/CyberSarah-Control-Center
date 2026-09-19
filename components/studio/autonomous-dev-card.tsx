import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

/**
 * Sprint 165 — Autonome Entwicklung: Admin-Karte.
 *
 * Der Administrator waehlt ein Template (Spiel/App), formuliert optional
 * einen Wunsch und startet die vollautonome 0-EUR-Entwicklung:
 * Plan -> freie LLM-Personalisierung -> node --check-Verifikation ->
 * Lieferung ins Workspace. Danach zeigt die Karte die letzten Laeufe.
 */

const KIND_LABELS = {
  pong: "Pong",
  snake: "Snake",
  breakout: "Breakout",
  flappy: "Flappy",
  todo: "To-Do",
  notes: "Notizen",
  calculator: "Rechner",
  timer: "Timer",
} as const;

export function AutonomousDevCard({ isAdmin }: { isAdmin: boolean }) {
  const colors = useColors();
  const [selectedKind, setSelectedKind] = useState<"pong" | "snake" | "breakout" | "flappy" | "todo" | "notes" | "calculator" | "timer">("snake");
  const [wish, setWish] = useState("");

  const catalogQuery = trpc.autonomousDev.catalog.useQuery(undefined, { enabled: isAdmin, retry: false });
  const runsQuery = trpc.autonomousDev.runs.useQuery({ limit: 5 }, { enabled: isAdmin, retry: false });
  const developMutation = trpc.autonomousDev.develop.useMutation({
    onSuccess: (run) => {
      Alert.alert(
        "Entwicklung abgeschlossen",
        `${run.label}\nVerifikation: ${run.verificationOk ? "bestanden" : "fehlgeschlagen"} · Kosten: ${run.costEur.toFixed(2)} EUR\nArtefakt: ${run.artifactPath}`,
      );
      setWish("");
      void runsQuery.refetch();
    },
    onError: (error) => Alert.alert("Entwicklung fehlgeschlagen", error.message),
  });

  if (!isAdmin) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.meta, { color: colors.muted }]}>
          Nur für die Admin-Rolle sichtbar — die autonome Entwicklung läuft serverseitig weiter.
        </Text>
      </View>
    );
  }

  const startDevelopment = () => {
    developMutation.mutate({ kind: selectedKind, wish: wish.trim() || undefined });
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Template-Auswahl */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {(catalogQuery.data ?? (Object.keys(KIND_LABELS) as Array<keyof typeof KIND_LABELS>).map((kind) => ({ kind, label: KIND_LABELS[kind], description: "" }))).map(
          (entry) => (
            <TouchableOpacity
              key={entry.kind}
              accessibilityRole="button"
              accessibilityLabel={`Template ${entry.label} auswählen`}
              onPress={() => setSelectedKind(entry.kind as typeof selectedKind)}
              style={[
                styles.chip,
                {
                  backgroundColor: selectedKind === entry.kind ? colors.tint : colors.background,
                  borderColor: selectedKind === entry.kind ? colors.tint : colors.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: selectedKind === entry.kind ? colors.background : colors.text }]}>
                {entry.label}
              </Text>
            </TouchableOpacity>
          ),
        )}
      </ScrollView>

      {/* Wunsch (optional) */}
      <TextInput
        accessibilityLabel="Wunsch für die autonome Entwicklung"
        placeholder="Optional: z. B. Neon-Cyberpunk-Stil"
        placeholderTextColor={colors.muted}
        value={wish}
        onChangeText={setWish}
        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
      />

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Autonome Entwicklung starten"
        onPress={startDevelopment}
        disabled={developMutation.isPending}
        style={[styles.button, { backgroundColor: developMutation.isPending ? colors.border : colors.tint }]}
      >
        {developMutation.isPending ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <Text style={[styles.buttonText, { color: colors.background }]}>Autonom entwickeln (0 EUR)</Text>
        )}
      </TouchableOpacity>

      {/* Letzte Läufe */}
      {runsQuery.data && runsQuery.data.length > 0 && (
        <View style={styles.runsWrap}>
          <Text style={[styles.meta, { color: colors.muted }]}>Letzte Läufe:</Text>
          {runsQuery.data.slice(0, 5).map((run) => (
            <View key={run.id} style={[styles.runRow, { borderColor: colors.border }]}>
              <View style={styles.runMain}>
                <Text style={[styles.runTitle, { color: colors.text }]} numberOfLines={1}>
                  {run.label}
                </Text>
                <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
                  {run.artifactPath}
                </Text>
              </View>
              <Text style={[styles.runMeta, { color: colors.tint }]}>{run.costEur.toFixed(2)} EUR</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, gap: 10, padding: 14 },
  chipRow: { gap: 8, paddingRight: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: "700" },
  input: { borderRadius: 10, borderWidth: 1, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
  button: { borderRadius: 10, alignItems: "center", paddingVertical: 12 },
  buttonText: { fontSize: 14, fontWeight: "800" },
  runsWrap: { gap: 4 },
  runRow: { borderBottomWidth: 0.5, flexDirection: "row", gap: 8, paddingVertical: 6 },
  runMain: { flex: 1 },
  runTitle: { fontSize: 12, fontWeight: "700" },
  runMeta: { fontSize: 12, fontWeight: "800" },
  meta: { fontSize: 12 },
});
