/**
 * Sprint 174 — Qualitaetszentrale auf "CyberSarah Future Glass" umgebaut.
 *
 * Logik (Repository-Qualitaet, CI-Checks, Review-Zahlen, Sync-Risiko,
 * Nutzungsbudget) bleibt unveraendert; nur die visuelle Schicht wechselt auf
 * das verbindliche Glass-System aus Sprint 168: GlassBackdrop, GlassCard,
 * GlowButton, StatusChip und Typography/Token aus lib/design/future-glass.
 */
import { ScreenContainer } from "@/components/screen-container";
import { TopNavigation } from "@/components/responsive/top-navigation";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, GlowButton, StatusChip } from "@/components/glass/glass-primitives";
import type { GlassAccent } from "@/lib/design/future-glass";
import { accentAlpha, glassPalette, glassSpacing, glassSurface, glassType } from "@/lib/design/future-glass";
import type { RepositoryQuality } from "@/lib/remote-workspace-client";
import { useStudioSettings } from "@/lib/studio-settings";
import { getWorkspaceSyncState } from "@/lib/workspace-sync-logic";
import { loadUsageEntries } from "@/lib/usage-budget-store";
import { buildUsageBudgetView, getUsageBudgetConfig, type UsageBudgetView } from "@/lib/usage-budget-view-logic";
import { useWorkspace } from "@/lib/workspace-context";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

type Tone = "ready" | "warning" | "neutral";

const toneAccent: Record<Tone, GlassAccent> = { ready: "green", warning: "amber", neutral: "blue" };

export default function QualityScreen() {
  const { files } = useWorkspace();
  const { loadRepositoryDetails, loadRepositoryQuality, settings } = useStudioSettings();
  const [quality, setQuality] = useState<RepositoryQuality | null>(null);
  const [budgetView, setBudgetView] = useState<UsageBudgetView | null>(null);
  const [remoteAhead, setRemoteAhead] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const hasRepository = Boolean(settings.workspaceId);
  const changedCount = useMemo(() => files.filter((file) => file.changed && file.remote).length, [files]);
  const syncState = getWorkspaceSyncState(changedCount, remoteAhead);

  const refresh = useCallback(async () => {
    if (!hasRepository) return;
    setState("loading");
    setError("");
    const [qualityResult, detailsResult, usageResult] = await Promise.allSettled([
      loadRepositoryQuality(),
      loadRepositoryDetails(),
      loadUsageEntries(),
    ]);
    if (qualityResult.status === "fulfilled") setQuality(qualityResult.value);
    if (detailsResult.status === "fulfilled") setRemoteAhead(detailsResult.value.remoteAhead);
    if (usageResult.status === "fulfilled") {
      setBudgetView(buildUsageBudgetView(usageResult.value, getUsageBudgetConfig(Date.now())));
    }
    if (qualityResult.status === "rejected") setError(qualityResult.reason instanceof Error ? qualityResult.reason.message : "Qualitätssignale konnten nicht geladen werden.");
    setState(qualityResult.status === "fulfilled" ? "ready" : "error");
  }, [hasRepository, loadRepositoryDetails, loadRepositoryQuality]);

  // Fetch-on-Mount: Der Refresh-Callback setzt synchron "loading"/"error" —
  // gewollter initialer Ladezustand, dokumentierte Ausnahme.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  if (!hasRepository) {
    return (
      <GlassBackdrop accent="cyan">
        <ScreenContainer style={styles.transparent} containerClassName="bg-transparent" edges={["top", "left", "right", "bottom"]}>
          <TopNavigation />
          <Text style={styles.eyebrow}>QUALITÄTSZENTRALE</Text>
          <Text style={styles.title}>Qualität</Text>
          <GlassCard accent="cyan" style={styles.emptyCard}>
            <IconSymbol name="chart.bar.fill" size={26} color={glassPalette.cyan} />
            <Text style={styles.emptyTitle}>Repository verbinden</Text>
            <Text style={styles.emptyText}>Verbinde zuerst einen Workspace, um Merge-, Review-, CI- und Konfliktsignale konsolidiert zu sehen.</Text>
          </GlassCard>
        </ScreenContainer>
      </GlassBackdrop>
    );
  }

  const mergeTone = getTone(quality?.merge.state ?? "unknown");
  const ciTone = getTone(quality?.ci.state ?? "unknown");
  return (
    <GlassBackdrop accent="cyan">
      <ScreenContainer style={styles.transparent} containerClassName="bg-transparent" edges={["top", "left", "right", "bottom"]}>
        <TopNavigation />
        <FlatList
          contentContainerStyle={styles.content}
          data={quality?.ci.checks ?? []}
          keyExtractor={(check, index) => `${check.name}-${index}`}
          ListHeaderComponent={<>
            <Text style={styles.eyebrow}>QUALITÄTSZENTRALE</Text>
            <Text style={styles.title}>Qualität</Text>
            <GlassCard accent="cyan" glow={1} style={styles.overviewCard}>
              <View style={styles.overviewTop}>
                <View>
                  <Text style={styles.overviewTitle}>{settings.branch}</Text>
                  <Text style={styles.overviewText}>Konsolidierter Stand von Merge, Review, CI und lokalem Arbeitsbereich.</Text>
                </View>
                <GlowButton
                  label={state === "loading" ? "Prüft …" : "Aktualisieren"}
                  onPress={() => void refresh()}
                  disabled={state === "loading"}
                  accent="cyan"
                  variant="secondary"
                  testID="quality-refresh"
                />
              </View>
              <View style={styles.signalRow}>
                <StatusChip label={quality?.merge.label ?? "Merge unbekannt"} accent={toneAccent[mergeTone]} />
                <StatusChip label={quality?.ci.label ?? "CI unbekannt"} accent={toneAccent[ciTone]} />
                <StatusChip label={budgetView?.badgeLabel ?? "Budget unbekannt"} accent={toneAccent[budgetView?.tone === "ready" ? "ready" : budgetView?.tone === "warning" ? "warning" : "neutral"]} />
                <StatusChip label={syncState.hasConflictRisk ? "Möglicher Konflikt" : syncState.offlineDraftCount ? "Offline-Entwurf" : "Synchron"} accent={syncState.hasConflictRisk || syncState.offlineDraftCount ? "amber" : "green"} />
              </View>
              {state === "error" ? <Text style={styles.errorText}>{error}</Text> : null}
            </GlassCard>
            <Text style={styles.sectionLabel}>ZUSAMMENFASSUNG</Text>
            <Text style={styles.sectionTitle}>Entscheidungssignale</Text>
            <GlassCard style={styles.metricsCard}>
              <Metric label="Checks bestanden" value={quality?.ci.passed ?? 0} accent="green" />
              <Metric label="Checks offen" value={quality?.ci.pending ?? 0} accent="amber" />
              <Metric label="Checks fehlerhaft" value={quality?.ci.failed ?? 0} accent="red" />
              <Metric label="Reviewer" value={quality?.reviews.reviewerCount ?? 0} accent="blue" />
              <Metric label="Genehmigt" value={quality?.reviews.approvedCount ?? 0} accent="green" />
              <Metric label="Änderungen" value={quality?.reviews.requestedChangesCount ?? 0} accent="amber" />
            </GlassCard>
            <GlassCard accent={syncState.hasConflictRisk ? "amber" : "green"} style={styles.syncCard}>
              <IconSymbol
                name={syncState.hasConflictRisk ? "exclamationmark.triangle.fill" : "checkmark.circle.fill"}
                size={18}
                color={syncState.hasConflictRisk ? glassPalette.amber : glassPalette.green}
              />
              <View style={styles.syncCopy}>
                <Text style={styles.syncTitle}>{syncState.hasConflictRisk ? "Vor Synchronisierung prüfen" : syncState.offlineDraftCount ? "Lokale Entwürfe vorhanden" : "Arbeitsbereich synchron"}</Text>
                <Text style={styles.syncText}>{syncState.hasConflictRisk ? "Remote-Commits und lokale Entwürfe bestehen gleichzeitig. Prüfe den Diff vor Commit oder Pull." : syncState.offlineDraftCount ? `${syncState.offlineDraftCount} Datei(en) warten noch auf Remote-Synchronisierung.` : "Keine lokalen Remote-Dateiänderungen ausstehend."}</Text>
              </View>
            </GlassCard>
            <Text style={styles.sectionLabel}>NUTZUNG</Text>
            <Text style={styles.sectionTitle}>Nutzungsbudget</Text>
            <GlassCard accent="green" style={styles.budgetCard}>
              <View style={styles.budgetTop}>
                <View>
                  <Text style={styles.budgetPercent}>{budgetView ? `${budgetView.usagePercent} %` : "–"}</Text>
                  <Text style={styles.budgetWindow}>{budgetView ? `Verbraucht ${budgetView.usedCostUnits} von ${budgetView.usedCostUnits + budgetView.remainingCostUnits} Einheiten im 30-Tage-Fenster.` : "Nutzungseinträge werden geladen …"}</Text>
                </View>
                <StatusChip label={budgetView?.badgeLabel ?? "Budget unbekannt"} accent={toneAccent[budgetView?.tone === "ready" ? "ready" : budgetView?.tone === "warning" ? "warning" : "neutral"]} />
              </View>
              <View style={styles.budgetProgress}>
                <View style={[styles.budgetProgressBar, { width: `${budgetView?.usagePercent ?? 0}%`, backgroundColor: budgetView?.level === "exhausted" ? glassPalette.red : accentAlpha("green", 0.8) }]} />
              </View>
              <Text style={styles.budgetSummary}>{budgetView?.summary ?? "Es liegen noch keine Nutzungseinträge vor."}</Text>
              {budgetView?.level === "exhausted" ? <Text style={styles.budgetAdmission}>{budgetView.admissionReason}</Text> : null}
            </GlassCard>
            <Text style={styles.sectionLabel}>CI-DETAILS</Text>
            <Text style={styles.sectionTitle}>Check-Runs</Text>
          </>}
          ListEmptyComponent={<Text style={styles.emptyChecks}>{state === "loading" ? "CI-Prüfungen werden geladen …" : "Für diesen Branch liegen noch keine Check-Runs vor."}</Text>}
          renderItem={({ item }) => (
            <GlassCard style={styles.checkRow} testID="quality-check-row">
              <View style={[styles.dot, { backgroundColor: getTone(item.conclusion ?? item.status) === "ready" ? glassPalette.green : getTone(item.conclusion ?? item.status) === "warning" ? glassPalette.amber : glassPalette.blue }]} />
              <Text numberOfLines={1} style={styles.checkName}>{item.name}</Text>
              <Text style={styles.checkState}>{item.conclusion ?? item.status}</Text>
            </GlassCard>
          )}
          showsVerticalScrollIndicator={false}
        />
      </ScreenContainer>
    </GlassBackdrop>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent: GlassAccent }) {
  return (
    <View style={styles.metric}>
      <Text style={[glassType.headline, { color: glassPalette[accent] }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function getTone(state: string): Tone {
  if (["ready", "passed", "success", "merged"].includes(state)) return "ready";
  if (["failing", "blocked", "failure", "error", "cancelled", "timed_out", "running", "checking", "attention", "draft"].includes(state)) return "warning";
  return "neutral";
}

const styles = StyleSheet.create({
  transparent: { backgroundColor: "transparent" },
  content: { paddingBottom: glassSpacing.xxl },
  eyebrow: { ...glassType.label, color: accentAlpha("cyan", 0.9), marginTop: glassSpacing.xl },
  title: { ...glassType.display, color: glassSurface.textPrimary, marginTop: glassSpacing.xs },
  sectionLabel: { ...glassType.label, color: glassSurface.textMuted, marginTop: glassSpacing.xxl },
  sectionTitle: { ...glassType.headline, color: glassSurface.textPrimary, marginTop: glassSpacing.xs },
  emptyCard: { alignItems: "center", marginTop: glassSpacing.xl, padding: glassSpacing.xxl },
  emptyTitle: { ...glassType.title, color: glassSurface.textPrimary, marginTop: glassSpacing.sm },
  emptyText: { ...glassType.caption, color: glassSurface.textSecondary, lineHeight: 18, marginTop: glassSpacing.xs, textAlign: "center" },
  overviewCard: { marginBottom: glassSpacing.xl, padding: glassSpacing.lg },
  overviewTop: { alignItems: "flex-start", flexDirection: "row", gap: glassSpacing.md, justifyContent: "space-between" },
  overviewTitle: { ...glassType.title, color: glassPalette.cyan, fontFamily: "monospace" },
  overviewText: { ...glassType.caption, color: glassSurface.textSecondary, flex: 1, fontSize: 11, lineHeight: 16, maxWidth: 205 },
  signalRow: { flexDirection: "row", flexWrap: "wrap", gap: glassSpacing.sm, marginTop: glassSpacing.lg },
  errorText: { ...glassType.caption, color: glassPalette.red, lineHeight: 16, marginTop: glassSpacing.md },
  metricsCard: { flexDirection: "row", flexWrap: "wrap", marginBottom: glassSpacing.md, padding: glassSpacing.md },
  metric: { minHeight: 64, paddingHorizontal: glassSpacing.sm, paddingVertical: 7, width: "33%" },
  metricLabel: { ...glassType.label, fontSize: 9, lineHeight: 13, color: glassSurface.textMuted, marginTop: 2 },
  syncCard: { flexDirection: "row", gap: glassSpacing.md, marginBottom: glassSpacing.xl, padding: glassSpacing.md },
  syncCopy: { flex: 1 },
  syncTitle: { ...glassType.caption, color: glassSurface.textPrimary, marginBottom: 3 },
  syncText: { ...glassType.caption, color: glassSurface.textSecondary, fontSize: 11, lineHeight: 16 },
  budgetCard: { marginBottom: glassSpacing.xl, padding: glassSpacing.lg },
  budgetTop: { alignItems: "flex-start", flexDirection: "row", gap: glassSpacing.md, justifyContent: "space-between" },
  budgetPercent: { ...glassType.headline, fontSize: 22, color: glassSurface.textPrimary, marginBottom: glassSpacing.xs },
  budgetWindow: { ...glassType.caption, color: glassSurface.textSecondary, flex: 1, fontSize: 11, lineHeight: 16, maxWidth: 205 },
  budgetProgress: { backgroundColor: accentAlpha("blue", 0.14), borderRadius: 6, height: 8, marginTop: glassSpacing.md, overflow: "hidden" },
  budgetProgressBar: { borderRadius: 6, height: 8 },
  budgetSummary: { ...glassType.caption, color: glassSurface.textPrimary, fontSize: 11, lineHeight: 16, marginTop: glassSpacing.md },
  budgetAdmission: { ...glassType.caption, color: glassPalette.red, fontSize: 11, lineHeight: 16, marginTop: glassSpacing.xs },
  checkRow: { alignItems: "center", flexDirection: "row", gap: glassSpacing.sm, marginBottom: 7, minHeight: 50, paddingHorizontal: glassSpacing.lg, paddingVertical: glassSpacing.sm },
  dot: { borderRadius: 4, height: 8, width: 8 },
  checkName: { ...glassType.caption, color: glassSurface.textPrimary, flex: 1 },
  checkState: { ...glassType.label, color: glassSurface.textMuted, fontFamily: "monospace" },
  emptyChecks: { ...glassType.caption, color: glassSurface.textMuted, lineHeight: 17, marginTop: glassSpacing.sm },
});
