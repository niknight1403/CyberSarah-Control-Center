import { useCallback, useMemo, useState } from "react";
import { EmptySurface, PrimaryButton, StatusBadge, StudioHeader, StudioSection } from "@/components/studio/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useLiveRuntimeLogs, useLiveRuntimeStatus, useClearRuntimeLogs, usePreviewTargetUrl } from "@/lib/live-runtime-client";
import { buildPreviewViewModel } from "@/lib/live-runtime-view-logic";
import { formatLogTime, type LiveRuntimeLogEntry } from "@/lib/live-runtime-sse-logic";
import { useStudioSettings } from "@/lib/studio-settings";
import { trpc } from "@/lib/trpc";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { withAlpha } from "@/lib/theme-color-utils";
import { useColors } from "@/hooks/use-colors";

/**
 * Sprint 111 — Preview-Tab mit echter Live-Runtime-Anbindung.
 *
 * Web: SSE-Log-Streaming (5-s-Status-Polling). Nativ: tRPC-Polling.
 * Der Protokollverlauf ist echt, Status/Ping/Uptime kommen vom Server —
 * ohne Workspace-Service oder Verbindung gelten ehrliche Offline-Zustaende.
 */
export default function PreviewScreen() {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
  const status = useLiveRuntimeStatus();
  const { entries, connection, clearLocal } = useLiveRuntimeLogs(200);
  const clearLogs = useClearRuntimeLogs();
  const previewUrl = usePreviewTargetUrl();
  const { settings } = useStudioSettings();
  const hasWorkspaceService = Boolean(settings.workspaceUrl);
  const [clearBusy, setClearBusy] = useState(false);
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const isAdmin = (accountQuery.data?.role ?? null) === "admin";

  const vm = useMemo(
    () => buildPreviewViewModel({ status, connection, previewUrl, isAdmin, logEntryCount: entries.length }),
    [status, connection, previewUrl, isAdmin, entries.length],
  );

  const handleClearLogs = useCallback(async () => {
    if (clearBusy) return;
    setClearBusy(true);
    try {
      if (connection === "streaming") {
        // Nur der lokale Zwischenstand — der Server-Puffer bleibt fuer alle Nutzer.
        clearLocal();
      } else {
        const result = await clearLogs.mutateAsync();
        clearLocal();
        const cleared = typeof result === "number" ? result : null;
        Alert.alert("Protokoll geleert", cleared !== null ? `${cleared} Server-Einträge wurden entfernt.` : "Der Server-Zwischenstand wurde geleert.");
      }
    } catch (error) {
      Alert.alert("Leeren fehlgeschlagen", error instanceof Error ? error.message : "Das Protokoll konnte nicht geleert werden.");
    } finally {
      setClearBusy(false);
    }
  }, [clearBusy, clearLocal, clearLogs, connection]);

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <FlatList
                initialNumToRender={12}
                maxToRenderPerBatch={8}
                windowSize={9}
        contentContainerStyle={styles.content}
        data={entries}
        keyExtractor={(entry) => entry.id}
        ListHeaderComponent={
          <>
            <StudioHeader eyebrow="Remote Runtime" title="Vorschau" actionIcon="arrow.clockwise" actionLabel="Laufzeit aktualisieren" onAction={() => void accountQuery.refetch()} />
            <View style={styles.statusCard}>
              <View style={styles.statusColumn}>
                <Text style={styles.statusLabel}>AUSFÜHRUNGSUMGEBUNG</Text>
                <Text style={styles.statusTitle}>{vm.headline}</Text>
                <Text style={styles.statusText}>{vm.description}</Text>
              </View>
              <View style={styles.badgeColumn}>
                <StatusBadge label={vm.stateBadge.label} tone={vm.stateBadge.tone} />
                <StatusBadge label={vm.connectionBadge.label} tone={vm.connectionBadge.tone} />
              </View>
            </View>
            <View style={styles.metricsRow}>
              <View style={styles.metricChip}>
                <Text style={styles.metricValue}>{vm.uptimeLabel}</Text>
                <Text style={styles.metricLabel}>Uptime</Text>
              </View>
              <View style={styles.metricChip}>
                <Text style={styles.metricValue}>{vm.pingLabel}</Text>
                <Text style={styles.metricLabel}>Latenz</Text>
              </View>
              <View style={styles.metricChip}>
                <Text style={styles.metricValue}>{status?.port ?? "–"}</Text>
                <Text style={styles.metricLabel}>Port</Text>
              </View>
              <View style={styles.metricChip}>
                <Text style={styles.metricValue}>{vm.logCountLabel.split(" ")[0]}</Text>
                <Text style={styles.metricLabel}>Ereignisse</Text>
              </View>
            </View>
            <View style={styles.previewFrame}>
              <View style={styles.previewBrowserBar}>
                <View style={styles.browserDots}>
                  <View style={styles.browserDot} />
                  <View style={styles.browserDot} />
                  <View style={styles.browserDot} />
                </View>
                <Text numberOfLines={1} style={styles.previewUrl}>{vm.urlLabel}</Text>
                {vm.isLive ? <View style={styles.liveDot} /> : null}
              </View>
              {hasWorkspaceService ? (
                <View style={styles.previewBody}>
                  <EmptySurface
                    description="Die Workspace-Vorschau läuft im Service-Prozess. Status, Protokoll und Preview-URL hierüber bleiben live verbunden."
                    icon="play.rectangle.fill"
                    title={vm.isLive ? "Live-Verbindung zum Workspace-Service" : "Workspace-Service verbunden"}
                  />
                </View>
              ) : (
                <View style={styles.previewBody}>
                  <EmptySurface
                    description="Ohne Workspace-Service zeigt die Vorschau den Web-Export der produktiven API. Verbinde einen Workspace-Service für Hot Reload und eigene Preview-Prozesse."
                    icon="play.rectangle.fill"
                    title="Web-Export als Vorschau-Ziel"
                  />
                </View>
              )}
            </View>
            <View style={styles.actionBlock}>
              <PrimaryButton
                icon={clearBusy ? "hourglass" : "trash"}
                label={clearBusy ? "Leert Protokoll …" : "Protokoll leeren"}
                disabled={!vm.showClearButton || clearBusy}
                onPress={() => void handleClearLogs()}
              />
              <Text style={styles.refreshCaption}>
                {vm.showClearButton
                  ? connection === "streaming"
                    ? "Leert den lokalen Live-Zwischenstand (Server-Puffer bleibt erhalten)."
                    : "Leert den Server-Protokollpuffer (Admin)."
                  : "Das Leeren ist ab Admin-Rolle mit vorhandenen Ereignissen verfügbar."}
              </Text>
            </View>
            <StudioSection label="Console" title="Live-Laufzeitprotokoll" />
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyLogsCard}>
            <IconSymbol name="terminal.fill" size={26} color={colors.tint} />
            <Text style={styles.emptyLogsTitle}>{vm.isLive ? "Warte auf Ereignisse …" : "Keine Ereignisse empfangen"}</Text>
            <Text style={styles.emptyLogsText}>{vm.isLive ? "Die Live-Verbindung steht — sobald der Server protokolliert, erscheinen die Einträge hier in Echtzeit." : "Sobald eine Live-Verbindung zur Laufzeit besteht, erscheinen hier Server-Ereignisse in Echtzeit."}</Text>
          </View>
        }
        renderItem={({ item }: { item: LiveRuntimeLogEntry }) => (
          <View style={styles.logRow}>
            <IconSymbol
              name={item.level === "success" ? "checkmark.circle.fill" : item.level === "warn" || item.level === "error" ? "exclamationmark.triangle.fill" : "terminal.fill"}
              size={18}
              color={item.level === "success" ? colors.success : item.level === "warn" ? colors.warning : item.level === "error" ? colors.error : colors.tint}
            />
            <View style={styles.logTextArea}>
              <View style={styles.logMetaRow}>
                <Text style={styles.logSource}>{item.source}</Text>
                <Text style={styles.logTime}>{formatLogTime(item.atMs)}</Text>
              </View>
              <Text style={styles.logDetail}>{item.message}</Text>
            </View>
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
  content: { paddingBottom: 20 },
  statusCard: {
    backgroundColor: "#151C28",
    borderColor: "#29384A",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 12,
    padding: 15,
  },
  statusColumn: { flex: 1, gap: 4 },
  statusLabel: { color: "#75859B", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  statusTitle: { color: "#EAF0F8", flex: 1, flexWrap: "wrap", fontSize: 14, fontWeight: "800" },
  statusText: { color: "#8493A7", flex: 1, flexWrap: "wrap", fontSize: 11, lineHeight: 16 },
  badgeColumn: { alignItems: "flex-end", gap: 6, justifyContent: "flex-start" },
  metricsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  metricChip: {
    alignItems: "center",
    backgroundColor: "#111825",
    borderColor: "#243248",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  metricValue: { color: "#E7EEF7", fontSize: 14, fontWeight: "900" },
  metricLabel: { color: "#718094", fontSize: 10, fontWeight: "700", marginTop: 3 },
  previewFrame: { backgroundColor: "#0E131B", borderColor: "#2A3950", borderRadius: 19, borderWidth: 1, overflow: "hidden" },
  previewBrowserBar: {
    alignItems: "center",
    backgroundColor: "#161E2B",
    borderBottomColor: "#29384A",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  browserDots: { flexDirection: "row", gap: 4 },
  browserDot: { backgroundColor: "#536175", borderRadius: 3, height: 6, width: 6 },
  previewUrl: { color: "#8090A4", flex: 1, fontSize: 11 },
  liveDot: { backgroundColor: colors.success, borderRadius: 4, height: 8, shadowColor: colors.success, shadowOpacity: 0.7, shadowRadius: 5, width: 8 },
  previewBody: { padding: 14 },
  actionBlock: { marginBottom: 20, marginTop: 14 },
  refreshCaption: { color: "#718094", fontSize: 11, lineHeight: 16, marginTop: 9, textAlign: "center" },
  emptyLogsCard: { alignItems: "center", backgroundColor: "#111B28", borderColor: withAlpha(colors.tint, 0.16), borderRadius: 16, borderWidth: 1, marginTop: 10, padding: 22 },
  emptyLogsTitle: { color: "#EAF5FF", fontSize: 15, fontWeight: "900", marginTop: 10 },
  emptyLogsText: { color: "#9AABBF", fontSize: 12, lineHeight: 18, marginTop: 5, textAlign: "center" },
  logRow: {
    alignItems: "center",
    backgroundColor: "#121823",
    borderColor: "#202F44",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    marginBottom: 9,
    minHeight: 44,
    padding: 13,
  },
  logTextArea: { flex: 1 },
  logMetaRow: { alignItems: "center", flexDirection: "row", gap: 8, marginBottom: 3 },
  logSource: { color: lightenSafe(colors.tint), flex: 1, fontSize: 10, fontWeight: "900" },
  logTime: { color: "#617187", fontSize: 10, fontWeight: "700" },
  logDetail: { color: "#8493A7", fontSize: 12, lineHeight: 17 },
  });
}

function lightenSafe(tint: string): string {
  try {
    return withAlpha(tint, 0.95);
  } catch {
    return tint;
  }
}
