import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";
import { trpc } from "@/lib/trpc";
import { growthAdminStatus } from "@/lib/growth-admin-status";

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
  const throughput = trpc.revenueOsV2.throughput.useQuery(undefined, { enabled: isAdmin, retry: false, staleTime: 30_000, refetchInterval: 60_000 });
  const b2b = trpc.growthNetwork.b2bOverview.useQuery(undefined, { enabled: isAdmin, retry: false, staleTime: 30_000, refetchInterval: 120_000 });
  const learning = trpc.growthNetwork.influencerLearning.useQuery(undefined, { enabled: isAdmin, retry: false, staleTime: 30_000, refetchInterval: 120_000 });
  const learningLoop = trpc.growthNetwork.learningLoopStatus.useQuery(undefined, { enabled: isAdmin, retry: false, staleTime: 15_000, refetchInterval: 60_000 });
  const growth = trpc.controlCenterAutopilot.growthOverview.useQuery(undefined, { enabled: isAdmin, retry: false, staleTime: 30_000, refetchInterval: 120_000 });
  const growthRuntime = trpc.controlCenterAutopilot.growthRuntimeStatus.useQuery(undefined, { enabled: isAdmin, retry: false, staleTime: 30_000, refetchInterval: 60_000 });
  const growNow = trpc.controlCenterAutopilot.growthRunNow.useMutation();
  const growthHealth = growth.data ? growthAdminStatus(growth.data.quality, growth.data.runtime, growth.data.enabled) : null;
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
            <Metric label="30d Revenue Run-Rate" value={throughput.data ? `${throughput.data.revenueVelocity.monthlyRunRateEur.toLocaleString("de-DE")} €` : "—"} />
            <Metric label="Aktive Abos" value={data.snapshot.activeSubscriptions ?? "—"} />
            <Metric label="Prioritäten" value={data.opportunities.length} />
            <Metric label="B2B Health" value={b2b.data ? `${b2b.data.health.healthScore}/100` : "—"} />
            <Metric label="B2B Beziehungen" value={b2b.data?.counts.edges ?? "—"} />
            <Metric label="Persona-Zuordnungen" value={b2b.data?.personaAssignments?.length ?? "—"} />
            <Metric label="Expansion Queue" value={b2b.data?.expansionQueue?.length ?? "—"} />
            <Metric label="KI Personas" value={learning.data?.states.length ?? "—"} />
          </View>

          <View style={styles.learningStrip}>
            <Text style={styles.opportunityTitle}>Core Revenue Supervisor</Text>
            <StatusChip
              label={throughput.isError ? "Supervisor-Fehler" : throughput.isLoading ? "Prüft" : throughput.data?.status === "scale" ? "Revenue-Pfade stabil" : "Revenue-Reparatur"}
              accent={throughput.isError ? "red" : throughput.data?.status === "scale" ? "green" : "amber"}
              live={Boolean(throughput.data && throughput.data.status === "scale")}
            />
            {throughput.data ? (
              <>
                <Text style={styles.note}>
                  Revenue Velocity 7d: {throughput.data.revenueVelocity.changePct === null ? "—" : throughput.data.revenueVelocity.changePct + "%"}
                  {" · "}Conversions: {throughput.data.revenueVelocity.recent7Conversions}
                  {" · "}MRR-Projektion: {throughput.data.mrrVelocity.available ? String(throughput.data.mrrVelocity.projectedMrrEur) : "noch nicht belastbar"}
                </Text>
                <Text style={styles.note}>
                  Payments: Stripe {throughput.data.payments.stripeConnected ? "✓" : "✕"}
                  {" · "}Stripe Webhook {throughput.data.payments.stripeWebhookConfigured ? "✓" : "✕"}
                  {" · "}Digistore24 IPN {throughput.data.payments.digistoreIpnConfigured ? "✓" : "✕"}
                  {" · "}DB {throughput.data.infrastructure.databaseReady ? "✓" : "✕"}
                </Text>
                <Text style={styles.note}>
                  Webhook-Laufzeit: Stripe Fehlerfolge {throughput.data.payments.stripeWebhookConsecutiveFailures}
                  {" · "}Digistore24 Fehlerfolge {throughput.data.payments.digistoreWebhookConsecutiveFailures}
                </Text>
                {throughput.data.bottleneck ? (
                  <Text style={styles.note}>
                    Funnel-Engpass: {throughput.data.bottleneck.key} · Conversion {throughput.data.bottleneck.ratePct ?? "—"}%
                  </Text>
                ) : null}
                {throughput.data.blockers.length ? (
                  <Text style={styles.error}>Revenue-Blocker: {throughput.data.blockers.slice(0, 3).join(" · ")}</Text>
                ) : (
                  <Text style={styles.note}>Keine kritischen Revenue-Blocker erkannt. Nächste Priorität: bestes messbares Experiment skalieren.</Text>
                )}
              </>
            ) : throughput.isError ? (
              <Text style={styles.error}>Revenue Supervisor nicht verfügbar: {throughput.error.message}</Text>
            ) : (
              <Text style={styles.note}>Prüfe Funnel, Payments, Datenbank und Provider-Kapazität …</Text>
            )}
          </View>

          <View style={styles.learningStrip}>
            <Text style={styles.opportunityTitle}>24/7 Growth Pulse · Reichweite → Gewinn</Text>
            <StatusChip
              label={growth.isError ? "Growth-Fehler" : growth.isLoading ? "Analyse" : growth.data?.enabled === false ? "Pausiert" : growth.data?.plan.focus ?? "Ohne Daten"}
              accent={growth.isError ? "red" : growth.data?.plan.stage === "repair" ? "amber" : "cyan"}
              live={Boolean(growth.data && !growth.isError)}
            />
            {growth.data ? (
              <>
                <Text style={styles.note}>{growth.data.plan.title} · {growth.data.plan.reason}</Text>
                <Text style={styles.note} accessibilityRole="summary">
                  Status: {growthHealth?.label} · {growthHealth?.detail}
                </Text>
                <Text style={styles.note}>Letzter Lauf: {growth.data.runtime.completedAt
                  ? new Date(growth.data.runtime.completedAt).toLocaleString("de-DE")
                  : "kein Nachweis"} · Fehler in Folge: {growth.data.runtime.consecutiveFailures}</Text>
                <Text style={styles.note}>7-Tage-Reichweite/Tag: {growth.data.trend.ready
                  ? growth.data.trend.recentImpressionsPerDay
                  : "nicht belastbar"} · Änderung gegenüber vorherigen 23 Tagen: {
                    growth.data.trend.reachDailyChangePct === null ? "—"
                      : growth.data.trend.reachDailyChangePct + "%"
                  }</Text>
                <View style={styles.metrics}>
                  <Metric label="Impressionen" value={growth.data.metrics.impressions} />
                  <Metric label="Klicks" value={growth.data.metrics.clicks} />
                  <Metric label="Käufe" value={growth.data.metrics.purchases} />
                  <Metric label="Attribution*" value={growth.data.metrics.confirmedRevenueCents.toLocaleString("de-DE") + " Minor Units"} />
                </View>
                <Text style={styles.note}>Nächster Schritt: {growth.data.plan.nextActions[0]} · Datenbasis: {growth.data.plan.evidence}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Growth Pulse analysieren und Entwürfe vorbereiten"
                  disabled={growNow.isPending || !growth.data.enabled || growth.data.quality.status === "blocked"}
                  style={[styles.button, (growNow.isPending || !growth.data.enabled || growth.data.quality.status === "blocked") && styles.buttonDisabled]}
                  onPress={() => {
                    setRunFeedback(null);
                    growNow.mutate(undefined, {
                      onSuccess: async result => {
                        setRunFeedback(result.generated > 0
                          ? result.generated + " neue Reichweiten-/Funnel-Entwürfe zur Freigabe vorbereitet."
                          : "Growth Pulse: " + (result.skipped ?? "Keine neuen Daten – kein Entwurf erforderlich."));
                        await Promise.all([
                          utils.controlCenterAutopilot.growthOverview.invalidate(),
                          utils.draftEngine.queue.invalidate(),
                        ]);
                      },
                    });
                  }}
                >
                  <Text style={styles.buttonText}>{growNow.isPending ? "Werte Signale aus …" : "Growth Pulse jetzt starten"}</Text>
                </Pressable>
                {growNow.error ? <Text style={styles.error}>{growNow.error.message}</Text> : null}
                <Text style={styles.note}>*Attributierter Umsatzwert abzüglich Refunds; Währung nicht verifiziert, kein belegter Gewinn. Veröffentlichungen, Werbeausgaben und Preisänderungen bleiben freigabepflichtig.</Text>
              </>
            ) : growth.isError ? (
                <>
                  <Text style={styles.error}>Growth Pulse nicht erreichbar: {growth.error.message}</Text>
                  <Text style={styles.note}>Serverlauf: {growthRuntime.data?.runtime.lastOutcome ?? "unbekannt"}
                    {" · "}Letzter Abschluss: {growthRuntime.data?.runtime.completedAt ?? "kein Nachweis"}
                    {" · "}Quelle: Prozessdiagnose, kein Live-Datenbeleg
                  </Text>
                </>
              )
              : <Text style={styles.note}>Lese bestehende Reichweiten-, Funnel- und Publishing-Daten …</Text>}
          </View>
          <View style={styles.learningStrip}>
            <StatusChip
              label={learningLoop.data?.enabled ? (learningLoop.data.lastError ? "KI-Lernen gestört" : "KI-Lernen 24/7") : "KI-Lernen aus"}
              accent={learningLoop.data?.lastError ? "amber" : learningLoop.data?.enabled ? "green" : "red"}
              live={Boolean(learningLoop.data?.enabled && !learningLoop.data?.lastError)}
            />
            <Text style={styles.note}>
              {learningLoop.data?.lastCompletedAt
                ? `Letzter Lernlauf ${new Date(learningLoop.data.lastCompletedAt).toLocaleString("de-DE")} · ${learningLoop.data.personasLearned} Personas · ${learningLoop.data.experimentsQueued} Experimente`
                : "Always-on Learning wartet auf den ersten Messzyklus."}
            </Text>
          </View>

          {b2b.data?.saasLoop ? (
            <View style={styles.learningStrip}>
              <Text style={styles.opportunityTitle}>B2B · Persona · SaaS Loop Engineering</Text>
              <StatusChip
                label={`${b2b.data.saasLoop.focus} · ${b2b.data.saasLoop.ownerPersona}`}
                accent="magenta"
                live
              />
              <Text style={styles.note}>
                {b2b.data.saasLoop.title} · Metrik: {b2b.data.saasLoop.metric} · Aktuell: {String(b2b.data.saasLoop.current)}
              </Text>
              <Text style={styles.note}>
                {b2b.data.saasLoop.stages.slice(0, 3).join(" → ")}
              </Text>
              {b2b.data.expansionQueue?.[0] ? (
                <Text style={styles.note}>
                  Nächste B2B-Aktion: {b2b.data.expansionQueue[0].nodeKey} · Persona {b2b.data.expansionQueue[0].persona} · {b2b.data.expansionQueue[0].nextStep}
                </Text>
              ) : null}
              <Text style={styles.note}>
                Externe Kontakte bleiben freigabepflichtig; Analyse, Persona-Zuordnung, Priorisierung und Loop-Entwurf laufen autonom.
              </Text>
            </View>
          ) : null}

          {b2b.data?.health.nextActions?.[0] ? (
            <Text style={styles.note}>B2B nächster Schritt: {b2b.data.health.nextActions[0]}</Text>
          ) : null}

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
                utils.revenueOsV2.throughput.invalidate(),
                utils.draftEngine.queue.invalidate(),
                utils.growthNetwork.b2bOverview.invalidate(),
                utils.growthNetwork.influencerLearning.invalidate(),
                utils.growthNetwork.learningLoopStatus.invalidate(),
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
    learningStrip: { gap: 8, alignItems: "flex-start" },
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
