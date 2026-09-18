/**
 * Sprint 154 — Admin-Karte „Provider & API-Keys".
 *
 * Server-gated (providerAdmin-Router ist admin-gated): zeigt Provider-
 * Matrix mit Status, maskiertem Key-Fingerprint, Ablaufwarnung und
 * Fallback-Rang. Aktionen: Einzel-/Gesamt-Health-Check, Provider
 * deaktivieren/reaktivieren, neuen Standby-Key verschlüsselt hinterlegen,
 * Rotation starten. Zeigt niemals Voll-Keys — nur maskierte Fingerprints
 * und sichere Diagnosen.
 */
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type ProviderId = "openai" | "gemini" | "anthropic" | "openrouter" | "groq" | "together" | "huggingface" | "ollama" | "lmstudio" | "custom";

type MatrixRow = {
  id: ProviderId;
  label: string;
  model: string | null;
  envVar: string | null;
  local: boolean;
  keySource: "env" | "admin_store" | "none";
  maskedKey: string | null;
  diagnosis: string;
  diagnosisLabel: string;
  lastCheckedAt: string | null;
  lastSafeError: string | null;
  expiresAt: string | null;
  expiryWarning: string;
  expiryLabel: string;
  disabled: boolean;
  standbyStaged: boolean;
  fallbackRank: number | null;
};

const STATUS_COLORS: Record<string, string> = {
  healthy: "#00FF66",
  configured: "#00F2FE",
  missing_key: "#F5A623",
  invalid: "#FF007F",
  expired: "#FF007F",
  revoked: "#FF007F",
  permission_denied: "#FF007F",
  rate_limited: "#F5A623",
  quota: "#F5A623",
  timeout: "#F5A623",
  unavailable: "#F5A623",
  network_error: "#F5A623",
  disabled: "#64748B",
  unknown: "#94A3B8",
};

export function ProviderAdminCard({ isAdmin }: { isAdmin: boolean }) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [expiryInput, setExpiryInput] = useState("");

  const matrixQuery = trpc.providerAdmin.list.useQuery(undefined, { enabled: isAdmin, retry: false });
  const eventsQuery = trpc.providerAdmin.events.useQuery(undefined, { enabled: isAdmin, retry: false });

  const healthCheck = trpc.providerAdmin.healthCheck.useMutation();
  const healthCheckAll = trpc.providerAdmin.healthCheckAll.useMutation();
  const setDisabled = trpc.providerAdmin.setDisabled.useMutation();
  const stageKey = trpc.providerAdmin.stageKey.useMutation();
  const rotate = trpc.providerAdmin.rotate.useMutation();

  const refresh = () => {
    void matrixQuery.refetch();
    void eventsQuery.refetch();
  };

  const runAction = async (action: () => Promise<unknown>, successTitle: string) => {
    setBusy(true);
    try {
      const result = await action();
      if (result && typeof result === "object" && "safeMessage" in result) {
        const message = (result as { safeMessage?: string }).safeMessage;
        if (message) Alert.alert(successTitle, message);
      }
      refresh();
    } catch (error) {
      Alert.alert("Aktion fehlgeschlagen", error instanceof Error ? error.message : "Unbekannter Fehler.");
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) return null;
  const rows = (matrixQuery.data ?? []) as MatrixRow[];
  const events = (eventsQuery.data ?? []) as { id: string; kind: string; provider: string; at: string; detail: string }[];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Provider &amp; API-Keys</Text>
        {matrixQuery.isFetching ? <ActivityIndicator size="small" color={colors.tint} /> : null}
      </View>
      <Text style={[styles.cardHint, { color: colors.muted }]}>
        Keys werden ausschließlich serverseitig verschlüsselt gespeichert und nur maskiert angezeigt. Fehlende Keys werden ehrlich als Blocker ausgewiesen — das System verwendet keine erfundenen Keys.
      </Text>

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.button, { backgroundColor: colors.tint }]}
          disabled={busy || healthCheckAll.isPending}
          onPress={() => void runAction(() => healthCheckAll.mutateAsync(), "Health-Check (alle)")}
        >
          <Text style={[styles.buttonText, { color: colors.background }]}>
            {healthCheckAll.isPending ? "Prüfe…" : "Alle Provider testen"}
          </Text>
        </Pressable>
      </View>

      {rows.map((row) => {
        const statusColor = STATUS_COLORS[row.diagnosis] ?? colors.muted;
        return (
          <View key={row.id} style={[styles.providerRow, { borderBottomColor: colors.border }]}>
            <View style={styles.providerMain}>
              <View style={styles.providerTitleRow}>
                <Text style={[styles.providerLabel, { color: colors.text }]}>{row.label}</Text>
                <View style={[styles.badge, { borderColor: `${statusColor}66` }]}>
                  <Text style={[styles.badgeText, { color: statusColor }]}>{row.diagnosisLabel}</Text>
                </View>
                {row.disabled ? (
                  <View style={[styles.badge, { borderColor: `${colors.muted}66` }]}>
                    <Text style={[styles.badgeText, { color: colors.muted }]}>DEAKTIVIERT</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.providerMeta, { color: colors.muted }]}>
                Key: {row.maskedKey ?? "kein"} ({row.keySource === "admin_store" ? "Admin-Store" : row.keySource === "env" ? "ENV" : "—"})
                {row.fallbackRank != null ? ` · Fallback-Rang ${row.fallbackRank}` : ""}
                {row.model ? ` · ${row.model}` : ""}
              </Text>
              <Text style={[styles.providerMeta, { color: colors.muted }]}>
                {row.expiryLabel}
                {row.lastCheckedAt ? ` · Geprüft: ${new Date(row.lastCheckedAt).toLocaleString("de-DE")}` : " · Noch nicht geprüft"}
              </Text>
              {row.expiryWarning === "warn_14d" || row.expiryWarning === "warn_7d" || row.expiryWarning === "warn_24h" || row.expiryWarning === "expired" ? (
                <Text style={[styles.warningText, { color: "#F5A623" }]}>⚠ {row.expiryLabel} — bitte rotieren.</Text>
              ) : null}
              {row.lastSafeError ? (
                <Text style={[styles.errorText, { color: "#FF007F" }]}>{row.lastSafeError}</Text>
              ) : null}
            </View>
            <View style={styles.rowActions}>
              <Pressable
                style={[styles.smallButton, { borderColor: `${colors.tint}55` }]}
                disabled={busy || healthCheck.isPending}
                onPress={() => void runAction(() => healthCheck.mutateAsync({ provider: row.id }), "Health-Check")}
              >
                <Text style={[styles.smallButtonText, { color: colors.tint }]}>Testen</Text>
              </Pressable>
              <Pressable
                style={[styles.smallButton, { borderColor: `${colors.muted}55` }]}
                disabled={busy || setDisabled.isPending}
                onPress={() =>
                  void runAction(
                    () => setDisabled.mutateAsync({ provider: row.id, disabled: !row.disabled }),
                    row.disabled ? "Provider reaktiviert" : "Provider deaktiviert",
                  )
                }
              >
                <Text style={[styles.smallButtonText, { color: colors.muted }]}>{row.disabled ? "Aktivieren" : "Deaktivieren"}</Text>
              </Pressable>
              {row.standbyStaged ? (
                <Pressable
                  style={[styles.smallButton, { borderColor: "#00FF6655" }]}
                  disabled={busy || rotate.isPending}
                  onPress={() => void runAction(() => rotate.mutateAsync({ provider: row.id }), "Rotation")}
                >
                  <Text style={[styles.smallButtonText, { color: "#00FF66" }]}>Rotieren</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Neuen Key hinterlegen (Rotation)</Text>
      <Text style={[styles.cardHint, { color: colors.muted }]}>
        Key wird verschlüsselt als Standby gespeichert, per Health-Check geprüft und erst nach Erfolg aktiviert. Der aktive Key bleibt bei Misserfolg unberührt.
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text }]}
          placeholder="API-Key (sk-… / AIza… / gsk_…)"
          placeholderTextColor={colors.muted}
          value={keyInput}
          onChangeText={setKeyInput}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <TextInput
          style={[styles.inputSmall, { borderColor: colors.border, color: colors.text }]}
          placeholder="Ablaufdatum (optional, YYYY-MM-DD)"
          placeholderTextColor={colors.muted}
          value={expiryInput}
          onChangeText={setExpiryInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <Pressable
        style={[styles.button, { backgroundColor: keyInput.trim().length >= 8 && !busy ? colors.tint : `${colors.muted}55` }]}
        disabled={busy || keyInput.trim().length < 8 || stageKey.isPending}
        onPress={() => {
          void runAction(async () => {
            const result = await stageKey.mutateAsync({
              provider: "openai",
              apiKey: keyInput.trim(),
              expiresAt: expiryInput.trim() || null,
            });
            setKeyInput("");
            setExpiryInput("");
            return result;
          }, "Key hinterlegt");
        }}
      >
        <Text style={[styles.buttonText, { color: colors.background }]}>
          {stageKey.isPending ? "Hinterlege…" : "Key als Standby hinterlegen (OpenAI)"}
        </Text>
      </Pressable>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Audit-Events (secret-frei)</Text>
      {events.length === 0 ? (
        <Text style={[styles.cardHint, { color: colors.muted }]}>Noch keine Ereignisse.</Text>
      ) : (
        events.slice(0, 6).map((event) => (
          <Text key={event.id} style={[styles.eventLine, { color: colors.muted }]} numberOfLines={2}>
            · [{new Date(event.at).toLocaleString("de-DE")}] {event.detail}
          </Text>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardHint: { fontSize: 12, lineHeight: 17 },
  actionRow: { flexDirection: "row", gap: 8 },
  button: { borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 4 },
  buttonText: { fontSize: 13, fontWeight: "700" },
  providerRow: { borderBottomWidth: 1, paddingVertical: 10, gap: 6 },
  providerMain: { gap: 3 },
  providerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  providerLabel: { fontSize: 14, fontWeight: "700" },
  providerMeta: { fontSize: 11 },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  rowActions: { flexDirection: "row", gap: 8, marginTop: 2 },
  smallButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  smallButtonText: { fontSize: 11, fontWeight: "700" },
  warningText: { fontSize: 11, fontWeight: "600" },
  errorText: { fontSize: 11 },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginTop: 8 },
  inputRow: { flexDirection: "row", gap: 8 },
  input: { flex: 2, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 13 },
  inputSmall: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 12 },
  eventLine: { fontSize: 11, lineHeight: 15 },
});
