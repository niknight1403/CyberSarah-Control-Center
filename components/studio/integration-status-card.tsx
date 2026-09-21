/**
 * Sprint 196 — Admin-Karte „Integrations-Status": LLM-Routen (Health),
 * Telegram-Benachrichtigungsbruecke (maskiert, nie Klartext-Tokens) und
 * Tool-Proxy-Queue-Auslastung auf einen Blick. Server-gated ueber den
 * admin-geschuetzten appStatus.integrationStatus-Endpunkt.
 */
import { Text, StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { accentAlpha, glassDepth, glassPalette, glassSurface } from "@/lib/design/future-glass";

type IntegrationStatus = {
  llm: {
    healthy: number;
    degraded: number;
    total: number;
    preferredOrder: string[];
    checkedAt: string;
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
      <Text style={[styles.metricLabel, { color: colors.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.metricValue, { color: toneColor }]} numberOfLines={1}>
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
  });
  const status = statusQuery.data as IntegrationStatus | undefined;

  return (
    <View style={[styles.card, { backgroundColor: glassDepth.glass, borderColor: glassSurface.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>Integrations-Status</Text>
      {!isAdmin ? (
        <Text style={[styles.cardHint, { color: colors.muted }]}>Nur für Administratoren sichtbar.</Text>
      ) : statusQuery.isLoading ? (
        <Text style={[styles.cardHint, { color: colors.muted }]}>Status wird geladen…</Text>
      ) : statusQuery.isError || !status ? (
        <Text style={[styles.cardHint, { color: colors.muted }]}>Status nicht verfügbar.</Text>
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
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardHint: { fontSize: 12, lineHeight: 17 },
  group: { gap: 4 },
  groupTitle: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  metricRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  metricLabel: { fontSize: 12, flexShrink: 1 },
  metricValue: { fontSize: 12, fontWeight: "600", textAlign: "right", flexShrink: 1 },
  errorText: { fontSize: 11 },
});
