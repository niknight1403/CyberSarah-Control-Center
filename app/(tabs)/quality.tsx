import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { StudioHeader, StatusBadge, StudioSection } from "@/components/studio/primitives";
import type { RepositoryQuality } from "@/lib/remote-workspace-client";
import { useStudioSettings } from "@/lib/studio-settings";
import { getWorkspaceSyncState } from "@/lib/workspace-sync-logic";
import { useWorkspace } from "@/lib/workspace-context";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function QualityScreen() {
  const { files } = useWorkspace();
  const { loadRepositoryDetails, loadRepositoryQuality, settings } = useStudioSettings();
  const [quality, setQuality] = useState<RepositoryQuality | null>(null);
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
    const [qualityResult, detailsResult] = await Promise.allSettled([loadRepositoryQuality(), loadRepositoryDetails()]);
    if (qualityResult.status === "fulfilled") setQuality(qualityResult.value);
    if (detailsResult.status === "fulfilled") setRemoteAhead(detailsResult.value.remoteAhead);
    if (qualityResult.status === "rejected") setError(qualityResult.reason instanceof Error ? qualityResult.reason.message : "Qualitätssignale konnten nicht geladen werden.");
    setState(qualityResult.status === "fulfilled" ? "ready" : "error");
  }, [hasRepository, loadRepositoryDetails, loadRepositoryQuality]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!hasRepository) return <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}><StudioHeader eyebrow="QUALITÄTSZENTRALE" title="Qualität" /><View style={styles.emptyCard}><IconSymbol name="chart.bar.fill" size={26} color="#52D8FF" /><Text style={styles.emptyTitle}>Repository verbinden</Text><Text style={styles.emptyText}>Verbinde zuerst einen Workspace, um Merge-, Review-, CI- und Konfliktsignale konsolidiert zu sehen.</Text></View></ScreenContainer>;

  const mergeTone = getTone(quality?.merge.state ?? "unknown");
  const ciTone = getTone(quality?.ci.state ?? "unknown");
  return <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}><FlatList contentContainerStyle={styles.content} data={quality?.ci.checks ?? []} keyExtractor={(check, index) => `${check.name}-${index}`} ListHeaderComponent={<><StudioHeader eyebrow="QUALITÄTSZENTRALE" title="Qualität" /><View style={styles.overviewCard}><View style={styles.overviewTop}><View><Text style={styles.overviewTitle}>{settings.branch}</Text><Text style={styles.overviewText}>Konsolidierter Stand von Merge, Review, CI und lokalem Arbeitsbereich.</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Qualitätsübersicht aktualisieren" activeOpacity={0.75} disabled={state === "loading"} onPress={() => void refresh()} style={[styles.refreshButton, state === "loading" && styles.disabled]}><Text style={styles.refreshText}>{state === "loading" ? "Prüft …" : "Aktualisieren"}</Text></TouchableOpacity></View><View style={styles.signalRow}><StatusBadge label={quality?.merge.label ?? "Merge unbekannt"} tone={mergeTone} /><StatusBadge label={quality?.ci.label ?? "CI unbekannt"} tone={ciTone} /><StatusBadge label={syncState.hasConflictRisk ? "Möglicher Konflikt" : syncState.offlineDraftCount ? "Offline-Entwurf" : "Synchron"} tone={syncState.hasConflictRisk || syncState.offlineDraftCount ? "warning" : "ready"} /></View>{state === "error" ? <Text style={styles.errorText}>{error}</Text> : null}</View><StudioSection label="Zusammenfassung" title="Entscheidungssignale" /><View style={styles.metricsCard}><Metric label="Checks bestanden" value={quality?.ci.passed ?? 0} color="#7BE5AE" /><Metric label="Checks offen" value={quality?.ci.pending ?? 0} color="#F2C979" /><Metric label="Checks fehlerhaft" value={quality?.ci.failed ?? 0} color="#FFA3AD" /><Metric label="Reviewer" value={quality?.reviews.reviewerCount ?? 0} color="#B8C7D8" /><Metric label="Genehmigt" value={quality?.reviews.approvedCount ?? 0} color="#7BE5AE" /><Metric label="Änderungen" value={quality?.reviews.requestedChangesCount ?? 0} color="#F2C979" /></View><View style={styles.syncCard}><IconSymbol name={syncState.hasConflictRisk ? "exclamationmark.triangle.fill" : "checkmark.circle.fill"} size={18} color={syncState.hasConflictRisk ? "#F2C979" : "#52D8FF"} /><View style={styles.syncCopy}><Text style={styles.syncTitle}>{syncState.hasConflictRisk ? "Vor Synchronisierung prüfen" : syncState.offlineDraftCount ? "Lokale Entwürfe vorhanden" : "Arbeitsbereich synchron"}</Text><Text style={styles.syncText}>{syncState.hasConflictRisk ? "Remote-Commits und lokale Entwürfe bestehen gleichzeitig. Prüfe den Diff vor Commit oder Pull." : syncState.offlineDraftCount ? `${syncState.offlineDraftCount} Datei(en) warten noch auf Remote-Synchronisierung.` : "Keine lokalen Remote-Dateiänderungen ausstehend."}</Text></View></View><StudioSection label="CI-DETAILS" title="Check-Runs" /></>} ListEmptyComponent={<Text style={styles.emptyChecks}>{state === "loading" ? "CI-Prüfungen werden geladen …" : "Für diesen Branch liegen noch keine Check-Runs vor."}</Text>} renderItem={({ item }) => <View style={styles.checkRow}><View style={[styles.dot, getTone(item.conclusion ?? item.status) === "ready" ? styles.dotReady : getTone(item.conclusion ?? item.status) === "warning" ? styles.dotWarning : styles.dotNeutral]} /><Text numberOfLines={1} style={styles.checkName}>{item.name}</Text><Text style={styles.checkState}>{item.conclusion ?? item.status}</Text></View>} showsVerticalScrollIndicator={false} /></ScreenContainer>;
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) { return <View style={styles.metric}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function getTone(state: string): "ready" | "warning" | "neutral" { if (["ready", "passed", "success", "merged"].includes(state)) return "ready"; if (["failing", "blocked", "failure", "error", "cancelled", "timed_out", "running", "checking", "attention", "draft"].includes(state)) return "warning"; return "neutral"; }

const styles = StyleSheet.create({
  content: { paddingBottom: 24 }, emptyCard: { alignItems: "center", backgroundColor: "#111B28", borderColor: "#274157", borderRadius: 18, borderWidth: 1, marginTop: 22, padding: 22 }, emptyTitle: { color: "#EAF5FF", fontSize: 16, fontWeight: "900", marginTop: 10 }, emptyText: { color: "#9AABBF", fontSize: 12, lineHeight: 18, marginTop: 5, textAlign: "center" }, overviewCard: { backgroundColor: "#111B28", borderColor: "#2A5265", borderRadius: 18, borderWidth: 1, marginBottom: 22, padding: 14 }, overviewTop: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" }, overviewTitle: { color: "#EDF6FD", fontFamily: "monospace", fontSize: 15, fontWeight: "900", marginBottom: 4 }, overviewText: { color: "#98AABE", flex: 1, fontSize: 11, lineHeight: 16, maxWidth: 205 }, refreshButton: { alignItems: "center", backgroundColor: "#153645", borderColor: "#3B819A", borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 10 }, refreshText: { color: "#88E7FF", fontSize: 11, fontWeight: "900" }, disabled: { opacity: 0.55 }, signalRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 13 }, errorText: { color: "#FFA3AD", fontSize: 11, lineHeight: 16, marginTop: 10 }, metricsCard: { backgroundColor: "#101824", borderColor: "#283A50", borderRadius: 16, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", marginBottom: 12, padding: 8 }, metric: { minHeight: 64, paddingHorizontal: 8, paddingVertical: 7, width: "33%" }, metricValue: { fontSize: 18, fontWeight: "900" }, metricLabel: { color: "#8FA1B5", fontSize: 9, lineHeight: 13, marginTop: 2 }, syncCard: { alignItems: "flex-start", backgroundColor: "#171B22", borderColor: "#394456", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, marginBottom: 21, padding: 12 }, syncCopy: { flex: 1 }, syncTitle: { color: "#E0EAF3", fontSize: 12, fontWeight: "900", marginBottom: 3 }, syncText: { color: "#94A5B9", fontSize: 11, lineHeight: 16 }, checkRow: { alignItems: "center", backgroundColor: "#101824", borderColor: "#27384C", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 8, marginBottom: 7, minHeight: 50, paddingHorizontal: 11 }, dot: { borderRadius: 4, height: 8, width: 8 }, dotReady: { backgroundColor: "#45D996" }, dotWarning: { backgroundColor: "#F6BA5E" }, dotNeutral: { backgroundColor: "#8A9BB0" }, checkName: { color: "#D3DFEC", flex: 1, fontSize: 11, fontWeight: "800" }, checkState: { color: "#8FA1B5", fontFamily: "monospace", fontSize: 10 }, emptyChecks: { color: "#8496AA", fontSize: 12, lineHeight: 17, marginTop: 8 },
});
