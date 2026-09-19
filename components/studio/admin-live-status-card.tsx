import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useState } from "react";

import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import {
  buildAdminLiveStatusViewModel,
  type AdminLiveStatusLogLine,
} from "@/lib/live-runtime-view-logic";

/**
 * Sprint 148 — Live-Status-Karte fuer den Admin-Screen.
 *
 * Zeigt den echten Backend-Laufzeit-Status (Zustand, Uptime, Latenz) und
 * die letzten Fehler/Warnungen aus dem Server-Ringpuffer — 5 s-Polling,
 * ehrliche Nicht-Verfuegbar-Zustaende, keine erfundenen Daten. Der
 * "Logs leeren"-Button greift auf die admin-gesicherte clearLogs-Route.
 */
export function AdminLiveStatusCard({ isAdmin }: { isAdmin: boolean }) {
  const colors = useColors();
  const statusQuery = trpc.appStatus.status.useQuery(undefined, {
    refetchInterval: 5_000,
    refetchOnWindowFocus: false,
  });
  const issuesQuery = trpc.appStatus.recentLogs.useQuery(
    { levels: ["error", "warn"], limit: 3 },
    { refetchInterval: 5_000, refetchOnWindowFocus: false },
  );
  const [clearedAt, setClearedAt] = useState<number | null>(null);
  // Sprint 171: Zeitstempel direkt im Mutation-Callback setzen statt
  // nachtraeglich per Effect zu spiegeln.
  const clearLogsMutation = trpc.appStatus.clearLogs.useMutation({
    onSuccess: () => {
      setClearedAt(Date.now());
      void statusQuery.refetch();
      void issuesQuery.refetch();
    },
  });

  const viewModel = buildAdminLiveStatusViewModel({
    status: statusQuery.data ?? null,
    issueEntries: (issuesQuery.data?.entries ?? []) as AdminLiveStatusLogLine[],
    isAdmin,
  });

  const dotColor = !viewModel.statusLoaded
    ? colors.muted
    : viewModel.isHealthy
      ? "#37E58C"
      : viewModel.stateBadge.tone === "warning"
        ? "#FF007F"
        : "#F5A623";

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.statusRow}>
        <View
          accessibilityLabel={`Backend-Status: ${viewModel.stateBadge.label}`}
          style={[styles.dot, { backgroundColor: dotColor }]}
        />
        <Text style={[styles.headline, { color: colors.text }]}>{viewModel.headline}</Text>
        {statusQuery.isFetching ? (
          <ActivityIndicator size="small" color={colors.tint} style={styles.spinner} />
        ) : null}
      </View>

      <View style={styles.metricRow}>
        <Metric label="Uptime" value={viewModel.uptimeLabel} />
        <Metric label="Latenz" value={viewModel.pingLabel} />
        <Metric label="Logs" value={viewModel.logCountLabel} />
        <Metric label="Fehler" value={viewModel.errorCountLabel} />
      </View>

      {viewModel.recentIssueLines.length > 0 ? (
        <View style={styles.logBox}>
          {viewModel.recentIssueLines.map((entry, index) => (
            <Text
              key={`${entry.atMs}-${index}`}
              style={[
                styles.logLine,
                { color: entry.level === "error" ? "#FF007F" : "#F5A623" },
              ]}
              numberOfLines={2}
            >
              · [{entry.level}] {entry.message}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={[styles.noIssues, { color: colors.muted }]}>
          Keine Fehler oder Warnungen im Server-Protokoll.
        </Text>
      )}

      {clearedAt != null ? (
        <Text style={[styles.clearedHint, { color: colors.muted }]}>
          Ringpuffer geleert — Live-Status bleibt erhalten.
        </Text>
      ) : null}

      {viewModel.showClearButton ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Server-Logpuffer leeren"
          disabled={clearLogsMutation.isPending}
          onPress={() => clearLogsMutation.mutate()}
          style={[styles.clearButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.clearButtonText, { color: colors.tint }]}>
            {clearLogsMutation.isPending ? "Leere …" : "Logs leeren"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, gap: 10, padding: 14 },
  statusRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  dot: { borderRadius: 5, height: 10, width: 10 },
  headline: { flex: 1, fontSize: 14, fontWeight: "700" },
  spinner: { marginLeft: 4 },
  metricRow: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, gap: 2 },
  metricLabel: { fontSize: 10 },
  metricValue: { fontSize: 12, fontWeight: "700" },
  logBox: { gap: 4 },
  logLine: { fontFamily: "monospace", fontSize: 11 },
  noIssues: { fontSize: 12 },
  clearedHint: { fontSize: 11 },
  clearButton: { alignItems: "center", borderRadius: 10, borderWidth: 1, paddingVertical: 10 },
  clearButtonText: { fontWeight: "700" },
});
