import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";
import { trpc } from "@/lib/trpc";

export function RevenueAutopilotCard() {
  const styles = useMemo(() => createStyles(), []);
  const [runFeedback, setRunFeedback] = useState<string | null>(null);
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 });
  const isAdmin = me.data?.role === "admin";
  const overview = trpc.controlCenterAutopilot.overview.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
  const run = trpc.controlCenterAutopilot.runNow.useMutation();
  const utils = trpc.useUtils();

  if (!isAdmin) return null;

  const data = overview.data;
  const statusAccent = overview.isError ? "red" : overview.isLoading || !data ? "cyan" : data.status === "healthy" ? "green" : "amber";
  const statusLabel = overview.isError ? "Fehler beim Laden" : overview.isLoading ? "Lädt" : data?.status === "healthy"
    ? "stabil"
    : data?.status === "instrument"
      ? "Messung ausbauen"
      : data?.status === "optimize"
        ? "Optimierung aktiv"
        : "wird geprüft";

  return (
    <GlassCard accent="cyan" glow={2} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CONTROL CENTER AUTOPILOT</Text>
          <Text style={styles.title}>Autonome Analyse, Reichweite & Revenue</Text>
          <Text style={styles.subtitle}>
            Startet echte Revenue-Scans, bewertet Live-Signale und erzeugt Creator-, Ideen- und Revenue-Entwürfe über reale LLM-Routen.
          </Text>
        </View>
        <StatusChip label={statusLabel} accent={statusAccent} live={Boolean(data && !overview.isError && data.status === "healthy")} />
      </View>

      {overview.isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={glassPalette.cyan} />
          <Text style={styles.note}>Revenue-Signale werden ausgewertet …</Text>
        </View>
      ) : overview.isError ? (
        <Text style={styles.error}>Autopilot-Daten nicht verfügbar: {overview.error.message}</Text>
      ) : data ? (
        <>
          <View style={styles.metrics}>
            <Metric label="MRR" value={data.snapshot.mrrEur === null ? "—" : `${data.snapshot.mrrEur.toLocaleString("de-DE", { maximumFractionDigits: 0 })} €`} />
            <Metric label="Aktive Abos" value={data.snapshot.activeSubscriptions ?? "—"} />
            <Metric label="Prioritäten" value={data.opportunities.length} />
          </View>

          <View style={styles.list}>
            {data.opportunities.length === 0 ? (
              <Text style={styles.note}>Keine belegte Lücke über den internen Zielen. Der Autopilot beobachtet weiter.</Text>
            ) : (
              data.opportunities.slice(0, 3).map((item, index) => (
                <View key={item.key} style={styles.opportunity}>
                  <View style={styles.rank}><Text style={styles.rankText}>{index + 1}</Text></View>
                  <View style={styles.opportunityCopy}>
                    <Text style={styles.opportunityTitle}>{item.title}</Text>
                    <Text style={styles.opportunityMeta}>
                      Score {item.score}/100 · {item.evidence === "high" ? "hohe" : item.evidence === "medium" ? "mittlere" : "geringe"} Datenbasis
                    </Text>
                    <Text style={styles.opportunityMetric}>{item.baseline} → {item.target}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}

      {run.error ? <Text style={styles.error} accessibilityRole="alert">{run.error.message}</Text> : null}
      {runFeedback && !run.error ? <Text style={styles.feedback} accessibilityLiveRegion="polite">{runFeedback}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Control Center Autopilot jetzt ausführen"
        disabled={run.isPending || overview.isLoading || overview.isError || !data}
        onPress={() => {
          setRunFeedback(null);
          run.mutate(undefined, {
            onSuccess: async (result) => {
              setRunFeedback(result.realActions.length > 0
                ? `Ausgeführt: ${result.realActions.join(" · ")}${result.deferred.length ? ` · Verschoben: ${result.deferred.length} wegen Provider-Limit` : result.blocked.length ? ` · Blockiert: ${result.blocked.join(" · ")}` : ""}`
                : result.deferred.length > 0
                  ? `Provider-Limit erreicht: ${result.deferred.length} Aufgabe(n) werden im nächsten Zyklus fortgesetzt.`
                  : result.blocked.length > 0
                    ? `Keine Aktion abgeschlossen: ${result.blocked.join(" · ")}`
                    : "Autopilot-Lauf abgeschlossen; aktuell war keine neue Aktion erforderlich.");
              await Promise.all([
                utils.controlCenterAutopilot.overview.invalidate(),
                utils.draftEngine.queue.invalidate(),
              ]);
            },
          });
        }}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, (run.isPending || overview.isLoading || overview.isError || !data) && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>{run.isPending ? "Autopilot optimiert …" : "Autopilot jetzt neu bewerten"}</Text>
      </Pressable>

      <Text style={styles.disclaimer}>
        Autonom laufen Analyse, HARA/Expansion-Scans, Priorisierung und Entwurfserstellung. Veröffentlichungen, Preisänderungen und Geldaktionen bleiben als irreversible externe Schritte freigabepflichtig.
      </Text>
    </GlassCard>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={metricStyles.metric}>
      <Text style={metricStyles.value}>{String(value)}</Text>
      <Text style={metricStyles.label}>{label}</Text>
    </View>
  );
}

const metricStyles = StyleSheet.create({
  metric: { backgroundColor: `${glassSurface.border}44`, borderRadius: 12, flex: 1, minWidth: 90, padding: 10 },
  value: { color: glassSurface.textPrimary, fontSize: 16, fontWeight: "900" },
  label: { color: glassSurface.textMuted, fontSize: 11, fontWeight: "700", marginTop: 3 },
});

function createStyles() {
  return StyleSheet.create({
    card: { gap: 14 },
    header: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
    headerCopy: { flex: 1 },
    eyebrow: { color: glassPalette.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
    title: { color: glassSurface.textPrimary, fontSize: 19, fontWeight: "900", lineHeight: 24, marginTop: 5 },
    subtitle: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 5 },
    loadingRow: { alignItems: "center", flexDirection: "row", gap: 10 },
    metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    list: { gap: 8 },
    opportunity: { alignItems: "flex-start", backgroundColor: `${glassSurface.border}38`, borderColor: glassSurface.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, padding: 11 },
    rank: { alignItems: "center", backgroundColor: `${glassPalette.cyan}18`, borderColor: `${glassPalette.cyan}55`, borderRadius: 10, borderWidth: 1, height: 30, justifyContent: "center", width: 30 },
    rankText: { color: glassPalette.cyan, fontSize: 12, fontWeight: "900" },
    opportunityCopy: { flex: 1 },
    opportunityTitle: { color: glassSurface.textPrimary, fontSize: 13, fontWeight: "900" },
    opportunityMeta: { color: glassSurface.textMuted, fontSize: 10, marginTop: 3 },
    opportunityMetric: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 4 },
    note: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 16 },
    error: { color: glassPalette.amber, fontSize: 11, lineHeight: 16 },
    feedback: { color: glassPalette.green, fontSize: 11, lineHeight: 17 },
    button: { alignItems: "center", justifyContent: "center", minHeight: 48, backgroundColor: `${glassPalette.cyan}18`, borderColor: `${glassPalette.cyan}88`, borderRadius: 14, borderWidth: 1, paddingVertical: 12 },
    buttonPressed: { opacity: 0.75 },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: glassPalette.cyan, fontSize: 12, fontWeight: "900" },
    disclaimer: { color: glassSurface.textMuted, fontSize: 11, lineHeight: 17 },
  });
}
