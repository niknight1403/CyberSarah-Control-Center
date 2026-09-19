import { useCallback, useMemo, useState } from "react";
/**
 * Sprint 180 — Preview-Tab auf "CyberSarah Future Glass" uebertragen
 * (Fortsetzung der Sprints 168/173-179). Logik unveraendert; visuelle
 * Schicht auf das Glass-System umgestellt: GlassBackdrop, Glass-Typografie,
 * StatusChip, GlowButton, Glass-Leerflaeche statt Studio-Primitives.
 */
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlowButton, StatusChip } from "@/components/glass/glass-primitives";
import type { GlassAccent } from "@/lib/design/future-glass";
import { glassDepth, glassPalette, glassSurface, glassType } from "@/lib/design/future-glass";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useLiveRuntimeLogs, useLiveRuntimeStatus, useClearRuntimeLogs, usePreviewTargetUrl } from "@/lib/live-runtime-client";
import { buildPreviewViewModel } from "@/lib/live-runtime-view-logic";
import { formatLogTime, type LiveRuntimeLogEntry } from "@/lib/live-runtime-sse-logic";
import { useStudioSettings } from "@/lib/studio-settings";
import { trpc } from "@/lib/trpc";
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { withAlpha } from "@/lib/theme-color-utils";

/**
 * Sprint 111 — Preview-Tab mit echter Live-Runtime-Anbindung.
 *
 * Web: SSE-Log-Streaming (5-s-Status-Polling). Nativ: tRPC-Polling.
 * Der Protokollverlauf ist echt, Status/Ping/Uptime kommen vom Server —
 * ohne Workspace-Service oder Verbindung gelten ehrliche Offline-Zustaende.
 */
export default function PreviewScreen() {
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
    <GlassBackdrop accent="green">
      <ScreenContainer className="px-5" containerClassName="bg-transparent" edges={["top", "left", "right", "bottom"]}>
      <FlatList
                initialNumToRender={12}
                maxToRenderPerBatch={8}
                windowSize={9}
        contentContainerStyle={styles.content}
        data={entries}
        keyExtractor={(entry) => entry.id}
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>REMOTE RUNTIME</Text>
                <Text style={styles.screenTitle}>Vorschau</Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="Laufzeit aktualisieren"
                accessibilityRole="button"
                onPress={() => void accountQuery.refetch()}
                style={styles.headerAction}
              >
                <IconSymbol name="arrow.clockwise" size={18} color={glassSurface.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.statusCard}>
              <View style={styles.statusColumn}>
                <Text style={styles.statusLabel}>AUSFÜHRUNGSUMGEBUNG</Text>
                <Text style={styles.statusTitle}>{vm.headline}</Text>
                <Text style={styles.statusText}>{vm.description}</Text>
              </View>
              <View style={styles.badgeColumn}>
                <StatusChip label={vm.stateBadge.label} accent={toneAccent(vm.stateBadge.tone)} />
                <StatusChip label={vm.connectionBadge.label} accent={toneAccent(vm.connectionBadge.tone)} />
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
                  <EmptyGlassSurface
                    description="Die Workspace-Vorschau läuft im Service-Prozess. Status, Protokoll und Preview-URL hierüber bleiben live verbunden."
                    title={vm.isLive ? "Live-Verbindung zum Workspace-Service" : "Workspace-Service verbunden"}
                  />
                </View>
              ) : (
                <View style={styles.previewBody}>
                  <EmptyGlassSurface
                    description="Ohne Workspace-Service zeigt die Vorschau den Web-Export der produktiven API. Verbinde einen Workspace-Service für Hot Reload und eigene Preview-Prozesse."
                    title="Web-Export als Vorschau-Ziel"
                  />
                </View>
              )}
            </View>
            <View style={styles.actionBlock}>
              <GlowButton
                accent="green"
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
            <Text style={styles.sectionLabel}>CONSOLE</Text>
            <Text style={styles.sectionTitle}>Live-Laufzeitprotokoll</Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyLogsCard}>
            <IconSymbol name="terminal.fill" size={26} color={glassPalette.cyan} />
            <Text style={styles.emptyLogsTitle}>{vm.isLive ? "Warte auf Ereignisse …" : "Keine Ereignisse empfangen"}</Text>
            <Text style={styles.emptyLogsText}>{vm.isLive ? "Die Live-Verbindung steht — sobald der Server protokolliert, erscheinen die Einträge hier in Echtzeit." : "Sobald eine Live-Verbindung zur Laufzeit besteht, erscheinen hier Server-Ereignisse in Echtzeit."}</Text>
          </View>
        }
        renderItem={({ item }: { item: LiveRuntimeLogEntry }) => (
          <View style={styles.logRow}>
            <IconSymbol
              name={item.level === "success" ? "checkmark.circle.fill" : item.level === "warn" || item.level === "error" ? "exclamationmark.triangle.fill" : "terminal.fill"}
              size={18}
              color={item.level === "success" ? glassPalette.green : item.level === "warn" ? glassPalette.amber : item.level === "error" ? glassPalette.red : glassPalette.cyan}
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
    </GlassBackdrop>
  );
}

function createStyles() {
  return StyleSheet.create({
  headerRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  headerCopy: { flex: 1 },
  eyebrow: { ...glassType.label, color: glassPalette.cyan },
  screenTitle: { ...glassType.display, color: glassSurface.textPrimary, marginTop: 4 },
  headerAction: { alignItems: "center", borderRadius: 10, height: 36, justifyContent: "center", width: 36 },
  sectionLabel: { ...glassType.label, color: glassSurface.textMuted, marginTop: 18 },
  sectionTitle: { ...glassType.headline, color: glassSurface.textPrimary, marginTop: 2 },
  emptyGlass: { alignItems: "center", paddingHorizontal: 18, paddingVertical: 22 },
  emptyGlassIcon: { alignItems: "center", backgroundColor: glassDepth.layer, borderColor: glassSurface.border, borderRadius: 14, borderWidth: 1, height: 46, justifyContent: "center", marginBottom: 12, width: 46 },
  emptyGlassTitle: { color: glassSurface.textPrimary, fontSize: 13, fontWeight: "800", marginBottom: 5, textAlign: "center" },
  emptyGlassDescription: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 16, textAlign: "center" },
  content: { paddingBottom: 20 },
  statusCard: {
    backgroundColor: glassDepth.layer,
    borderColor: glassSurface.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 12,
    padding: 15,
  },
  statusColumn: { flex: 1, gap: 4 },
  statusLabel: { color: glassSurface.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  statusTitle: { color: glassSurface.textPrimary, flex: 1, flexWrap: "wrap", fontSize: 14, fontWeight: "800" },
  statusText: { color: glassSurface.textMuted, flex: 1, flexWrap: "wrap", fontSize: 11, lineHeight: 16 },
  badgeColumn: { alignItems: "flex-end", gap: 6, justifyContent: "flex-start" },
  metricsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  metricChip: {
    alignItems: "center",
    backgroundColor: glassDepth.layer,
    borderColor: glassSurface.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  metricValue: { color: glassSurface.textPrimary, fontSize: 14, fontWeight: "900" },
  metricLabel: { color: glassSurface.textMuted, fontSize: 10, fontWeight: "700", marginTop: 3 },
  previewFrame: { backgroundColor: glassDepth.deep, borderColor: glassSurface.border, borderRadius: 19, borderWidth: 1, overflow: "hidden" },
  previewBrowserBar: {
    alignItems: "center",
    backgroundColor: glassDepth.layer,
    borderBottomColor: glassSurface.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  browserDots: { flexDirection: "row", gap: 4 },
  browserDot: { backgroundColor: glassSurface.textMuted, borderRadius: 3, height: 6, width: 6 },
  previewUrl: { color: glassSurface.textMuted, flex: 1, fontSize: 11 },
  liveDot: { backgroundColor: glassPalette.green, borderRadius: 4, height: 8, shadowColor: glassPalette.green, shadowOpacity: 0.7, shadowRadius: 5, width: 8 },
  previewBody: { padding: 14 },
  actionBlock: { marginBottom: 20, marginTop: 14 },
  refreshCaption: { color: glassSurface.textMuted, fontSize: 11, lineHeight: 16, marginTop: 9, textAlign: "center" },
  emptyLogsCard: { alignItems: "center", backgroundColor: glassDepth.layer, borderColor: withAlpha(glassPalette.cyan, 0.16), borderRadius: 16, borderWidth: 1, marginTop: 10, padding: 22 },
  emptyLogsTitle: { color: glassSurface.textPrimary, fontSize: 15, fontWeight: "900", marginTop: 10 },
  emptyLogsText: { color: glassSurface.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5, textAlign: "center" },
  logRow: {
    alignItems: "center",
    backgroundColor: glassDepth.layer,
    borderColor: glassSurface.border,
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
  logSource: { color: lightenSafe(glassPalette.cyan), flex: 1, fontSize: 10, fontWeight: "900" },
  logTime: { color: glassSurface.textMuted, fontSize: 10, fontWeight: "700" },
  logDetail: { color: glassSurface.textMuted, fontSize: 12, lineHeight: 17 },
  });
}

function lightenSafe(tint: string): string {
  try {
    return withAlpha(tint, 0.95);
  } catch {
    return tint;
  }
}

/** Tone-Mapping Studio-Badge -> Glass-Akzent (Sprint 180). */
function toneAccent(tone: "ready" | "warning" | "neutral" | "accent"): GlassAccent {
  return tone === "ready" ? "green" : tone === "warning" ? "amber" : tone === "accent" ? "cyan" : "blue";
}

/** Glass-Leerflaeche (ersetzt Studio-EmptySurface, Sprint 180). */
function EmptyGlassSurface({ description, title }: { description: string; title: string }) {
  return (
    <View style={styles.emptyGlass}>
      <View style={styles.emptyGlassIcon}>
        <IconSymbol name="play.rectangle.fill" size={23} color={glassPalette.cyan} />
      </View>
      <Text style={styles.emptyGlassTitle}>{title}</Text>
      <Text style={styles.emptyGlassDescription}>{description}</Text>
    </View>
  );
}

const styles = createStyles();
