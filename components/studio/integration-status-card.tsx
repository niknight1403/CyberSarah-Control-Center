/**
 * Sprint 196 — Admin-Karte „Integrations-Status": LLM-Routen (Health),
 * Telegram-Benachrichtigungsbruecke (maskiert, nie Klartext-Tokens) und
 * Tool-Proxy-Queue-Auslastung auf einen Blick. Server-gated ueber den
 * admin-geschuetzten appStatus.integrationStatus-Endpunkt.
 */
import { Pressable, Text, StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { accentAlpha, glassDepth, glassPalette, glassSurface } from "@/lib/design/future-glass";
import { classifyIntegrationCardHealth } from "@/lib/integration-status-view-logic";

type IntegrationStatus = {
  llm: {
    healthy: number;
    degraded: number;
    total: number;
    preferredOrder: string[];
    checkedAt: string;
  };
  routeRotation: {
    enabled: boolean;
    primary: string | null;
    forced: string | null;
    lastTickAt: string | null;
    configured: number;
    healthy: number;
    recentAction: "keep" | "rotate" | "degraded";
    recentReason: string | null;
  };
  telegram: {
    configured: boolean;
    maskedToken: string;
    chatIdConfigured: boolean;
  };
  queue: {
    concurrency: number;
    maxRetries: number;
    queued: number;
    active: number;
    completed: number;
    failed: number;
    retried: number;
    rateLimited: number;
    peakActive: number;
    lastError: string | null;
  };
  mcp: {
    configured: boolean;
    url: string;
  };
};

function MetricRow({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "muted" }) {
  const colors = useColors();
  const toneColor =
    tone === "ok" ? accentAlpha("green", 0.4) : tone === "warn" ? glassPalette.amber : colors.muted;
  return (
    <View style={styles.metricRow}>
      <Text style={[styles.metricLabel, { color: colors.muted }]}>
        {label}
      </Text>
      <Text style={[styles.metricValue, { color: toneColor }]}>
        {value}
      </Text>
    </View>
  );
}

export function IntegrationStatusCard({ isAdmin }: { isAdmin: boolean }) {
  const colors = useColors();
  const statusQuery = trpc.appStatus.integrationStatus.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
    refetchInterval: isAdmin ? 30_000 : false,
  });
  const status = statusQuery.data as IntegrationStatus | undefined;
  const health = status
    ? classifyIntegrationCardHealth({
        llmHealthy: status.llm.healthy,
        routeHealthy: status.routeRotation.healthy,
        routeConfigured: status.routeRotation.configured,
        queueFailed: status.queue.failed,
      })
    : null;
  const healthTone = health?.state === "healthy" ? "ok" : health?.state === "offline" ? "warn" : "warn";

  return (
    <View style={[styles.card, { backgroundColor: glassDepth.glass, borderColor: glassSurface.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Integrations-Status</Text>
        {health ? (
          <View
            style={[
              styles.healthBadge,
              {
                borderColor: healthTone === "ok" ? accentAlpha("green", 0.4) : glassPalette.amber,
              },
            ]}
          >
            <Text
              style={[
                styles.healthBadgeText,
                { color: healthTone === "ok" ? accentAlpha("green", 0.4) : glassPalette.amber },
              ]}
            >
              {health.label}
            </Text>
          </View>
        ) : null}
      </View>
      {!isAdmin ? (
        <Text style={[styles.cardHint, { color: colors.muted }]}>Nur für Administratoren sichtbar.</Text>
      ) : statusQuery.isLoading ? (
        <Text style={[styles.cardHint, { color: colors.muted }]}>Status wird geladen…</Text>
      ) : statusQuery.isError || !status ? (
        <View style={styles.errorState}>
          <Text style={[styles.cardHint, { color: colors.muted }]}>Status nicht verfügbar.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Integrationsstatus erneut prüfen"
            onPress={() => void statusQuery.refetch()}
            style={[styles.retryButton, { borderColor: glassSurface.border }]}
          >
            <Text style={[styles.retryText, { color: colors.text }]}>Erneut prüfen</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <View style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>LLM-Routen</Text>
            <MetricRow
              label="Gesund / Gesamt"
              value={`${status.llm.healthy} / ${status.llm.total}`}
              tone={status.llm.healthy > 0 ? "ok" : "warn"}
            />
            {status.llm.degraded > 0 ? (
              <MetricRow label="Im Cooldown" value={`${status.llm.degraded}`} tone="warn" />
            ) : null}
            <MetricRow
              label="Bevorzugte Reihenfolge"
              value={status.llm.preferredOrder.length > 0 ? status.llm.preferredOrder.join(" → ") : "Auto (Zero-Cost)"}
              tone="muted"
            />
          </View>

          <View style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>Autonome LLM-Rotation</Text>
            <MetricRow
              label="Primärroute"
              value={status.routeRotation.primary ?? "wird geprüft"}
              tone={status.routeRotation.healthy > 0 ? "ok" : "warn"}
            />
            <MetricRow
              label="Gesund / konfiguriert"
              value={`${status.routeRotation.healthy} / ${status.routeRotation.configured}`}
              tone={status.routeRotation.healthy > 0 ? "ok" : "warn"}
            />
            {status.routeRotation.forced ? (
              <MetricRow label="Admin-Zwang" value={status.routeRotation.forced} tone="warn" />
            ) : null}
            <MetricRow
              label="Letzter Health-Tick"
              value={status.routeRotation.lastTickAt ? new Date(status.routeRotation.lastTickAt).toLocaleTimeString() : "noch keiner"}
              tone="muted"
            />
            {status.routeRotation.recentAction === "degraded" && status.routeRotation.recentReason ? (
              <Text style={[styles.errorText, { color: colors.muted }]} numberOfLines={3}>
                {status.routeRotation.recentReason}
              </Text>
            ) : null}
          </View>

          <View style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>Telegram-Brücke</Text>
            <MetricRow
              label="Zustand"
              value={status.telegram.configured ? "aktiv" : "nicht konfiguriert"}
              tone={status.telegram.configured ? "ok" : "warn"}
            />
            <MetricRow label="Bot-Token" value={status.telegram.maskedToken} tone="muted" />
            <MetricRow
              label="Chat-ID"
              value={status.telegram.chatIdConfigured ? "gesetzt" : "fehlt"}
              tone={status.telegram.chatIdConfigured ? "ok" : "warn"}
            />
          </View>

          <View style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>Tool-Proxy-Queue</Text>
            <MetricRow
              label="Aktiv / Wartend"
              value={`${status.queue.active} / ${status.queue.queued}`}
              tone="muted"
            />
            <MetricRow
              label="Abgeschlossen / Fehlgeschlagen"
              value={`${status.queue.completed} / ${status.queue.failed}`}
              tone={status.queue.failed > 0 ? "warn" : "muted"}
            />
            {status.queue.rateLimited > 0 ? (
              <MetricRow label="429 erkannt (Retries)" value={`${status.queue.rateLimited} (${status.queue.retried})`} tone="warn" />
            ) : null}
            <MetricRow
              label="Limit (Concurrency × Retries)"
              value={`${status.queue.concurrency} × ${status.queue.maxRetries}`}
              tone="muted"
            />
            {status.queue.lastError ? (
              <Text style={[styles.errorText, { color: colors.muted }]} numberOfLines={2}>
                Letzter Fehler: {status.queue.lastError}
              </Text>
            ) : null}
          </View>

          <View style={styles.group}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>MCP-Transport</Text>
            <MetricRow
              label="Remote-Server"
              value={status.mcp.url}
              tone={status.mcp.configured ? "ok" : "warn"}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  healthBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  healthBadgeText: { fontSize: 11, fontWeight: "700" },
  cardHint: { fontSize: 12, lineHeight: 17 },
  errorState: { gap: 10, alignItems: "flex-start" },
  retryButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  retryText: { fontSize: 12, fontWeight: "700" },
  group: { gap: 5 },
  groupTitle: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  metricRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  metricLabel: { fontSize: 12, flex: 1, minWidth: 0 },
  metricValue: { fontSize: 12, fontWeight: "600", textAlign: "right", flex: 1.2, minWidth: 0 },
  errorText: { fontSize: 11, lineHeight: 16 },
});
