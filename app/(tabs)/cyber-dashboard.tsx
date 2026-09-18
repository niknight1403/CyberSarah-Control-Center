import { useColors } from "@/hooks/use-colors";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LiveWidget, WidgetMetric } from "@/components/cyber/live-widget";
import { CyberAgentCard } from "@/components/cyber/agent-card";
import {
  backendReachable,
  getAgentStatus,
  listTasks,
  type BackendTask,
} from "@/lib/cybersarah-backend-client";
import { cyber, cyberTypography } from "@/lib/cyber-theme";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { trpc } from "@/lib/trpc";

/**
 * Sprint 126 — Cyber-Dashboard: Live-Widgets fuer Systemstatus,
 * Cloud-Token-Verbrauch und das Orchestrator-Task-Ledger.
 *
 * Performance: Effizientes Polling statt Dauerverbindung — 4 s Intervall
 * nur im Vordergrund (refetchIntervalInBackground aus), dadurch akku-
 * schonend. Widgets sind Flatlist-/ScrollView-freundlich (keine Deep-Trees).
 */

function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

interface BackendState {
  online: boolean;
  mode: string;
  stopped: boolean;
  tasks: BackendTask[];
}

const BACKEND_OFFLINE: BackendState = { online: false, mode: "…", stopped: false, tasks: [] };

export default function CyberDashboardScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [backendState, setBackendState] = React.useState<BackendState>(BACKEND_OFFLINE);

  // Autonomes FastAPI-Backend (Sprint 131): 8-s-Polling nur, wenn erreichbar
  // und die App im Vordergrund ist. Offline-Zustand ist der harmlose Default.
  React.useEffect(() => {
    let cancelled = false;
    const sync = (): void => {
      if (cancelled) return;
      Promise.all([getAgentStatus(), listTasks()])
        .then(([status, tasks]) => {
          if (cancelled) return;
          setBackendState({
            online: true,
            mode: status.mode,
            stopped: status.stopped,
            tasks,
          });
        })
        .catch(() => {
          if (!cancelled) setBackendState(BACKEND_OFFLINE);
        });
    };
    void backendReachable(2_500).then((online) => {
      if (cancelled) return;
      if (!online) {
        setBackendState(BACKEND_OFFLINE);
        return;
      }
      sync();
    });
    const timer = setInterval(sync, 8_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const systemStatus = trpc.appStatus.status.useQuery(undefined, {
    refetchInterval: 4_000,
    refetchIntervalInBackground: false,
  });
  const account = trpc.monetization.account.useQuery();
  const me = trpc.auth.me.useQuery();
  const taskLedger = trpc.orchestrator.tasks.useQuery(
    { limit: 10 },
    { enabled: me.data?.role === "admin" },
  );

  const status = systemStatus.data;
  const systemOnline = status != null && (status.state === "running" || status.state === "building");
  const tasks = taskLedger.data ?? [];

  const navDrawer = useNavDrawer();
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.menuRow}>
            <NavDrawer {...navDrawer.drawerProps} />
            <NavDrawerButton {...navDrawer.hamburgerProps} />
          </View>
          <Text style={styles.headerKicker}>CONTROL CENTER</Text>
          <Text style={styles.headerTitle}>
            CYBER<Text style={{ color: colors.tint }}>SARAH</Text>
          </Text>
          <View style={[styles.headerLine, { backgroundColor: `${colors.tint}55` }]} />
        </View>

        <View style={styles.gridRow}>
          <LiveWidget title="System-Status" badge="LIVE" accent={systemOnline ? colors.success : colors.tint} style={styles.halfWidget}>
            <WidgetMetric label="Backend" value={status?.stateLabel ?? "…"} accent={systemOnline ? colors.success : colors.tint} />
            <WidgetMetric label="Latenz" value={status?.pingMs != null ? `${status.pingMs} ms` : "…"} />
            <WidgetMetric label="Uptime" value={status ? formatUptime(status.serverUptimeMs) : "…"} />
          </LiveWidget>

          <LiveWidget title="Cloud-Tokens" badge={account.data?.planLabel ?? "FREE"} accent={colors.tint} style={styles.halfWidget}>
            <WidgetMetric
              label="Heute"
              value={account.data ? `${account.data.usage.todayTokens.toLocaleString("de-DE")} / ${account.data.limits.dailyCloudTokens.toLocaleString("de-DE")}` : "…"}
            />
            <WidgetMetric
              label="Monat"
              value={account.data ? `${Math.round(account.data.usage.monthTokens / 1000)}k / ${Math.round(account.data.limits.monthlyCloudTokens / 1000)}k` : "…"}
            />
            <WidgetMetric label="Guthaben" value={account.data ? `${Math.round(account.data.usage.creditBalanceTokens / 1000)}k` : "…"} accent={colors.success} />
          </LiveWidget>
        </View>

        <LiveWidget title="Agenten" badge="AUTO" accent={colors.tint}>
          <CyberAgentCard
            name="Leitender Superagent"
            role="Orchestrator — Task-Decomposition & Selbstkorrektur"
            status={systemOnline ? "running" : "error"}
            metric={systemOnline ? "Tools bereit" : "Offline"}
          />
          <CyberAgentCard
            name="Revenue OS"
            role="29-Agenten-Konfiguration — Abrechnung & Betrieb"
            status={systemOnline ? "idle" : "error"}
            metric="29 Agenten"
          />
          <CyberAgentCard
            name="LLM-Switcher"
            role="Modell-Routing & Provider-Failover"
            status={systemOnline ? "running" : "error"}
            metric="Multi-Provider"
          />
        </LiveWidget>

        <LiveWidget
          title="Autonomes Backend"
          badge={backendState.online ? (backendState.stopped ? "GESTOPPT" : "LIVE") : "OFFLINE"}
          accent={backendState.online ? (backendState.stopped ? colors.tint : colors.success) : colors.icon}
        >
          {backendState.online ? (
            <>
              <WidgetMetric label="Executor-Modus" value={backendState.mode.toUpperCase()} accent={colors.success} />
              <WidgetMetric label="Tasks im Ledger" value={`${backendState.tasks.length}`} accent={backendState.tasks.length > 0 ? colors.tint : undefined} />
              <WidgetMetric
                label="Laufend"
                value={`${backendState.tasks.filter((task) => task.status === "running").length}`}
              />
              <WidgetMetric
                label="Emergency Stop"
                value={backendState.stopped ? "AKTIV" : "inaktiv"}
                accent={backendState.stopped ? colors.tint : colors.success}
              />
            </>
          ) : (
            <Text style={styles.emptyText}>
              Autonomes Backend offline — Terminal zeigt Studio-Logs, Ledger nutzt Orchestrator-Daten.
            </Text>
          )}
        </LiveWidget>

        <LiveWidget
          title="Task-Ledger"
          badge={me.data?.role === "admin" ? "ADMIN" : undefined}
          accent={colors.tint}
        >
          {me.data?.role !== "admin" ? (
            <Text style={styles.emptyText}>Admin-Zugang erforderlich für das Orchestrator-Ledger.</Text>
          ) : tasks.length === 0 ? (
            <Text style={styles.emptyText}>Noch keine Tasks — starte einen Workflow im Orchestrator.</Text>
          ) : (
            tasks.slice(0, 5).map((task) => (
              <View key={task.id} style={styles.taskRow}>
                <View style={TASK_DOT_STYLE(task.status)} />
                <View style={styles.taskTextContainer}>
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {task.title}
                  </Text>
                  <Text style={styles.taskMeta}>
                    {task.status.toUpperCase()} · {new Date(task.updatedAt).toLocaleString("de-DE")}
                  </Text>
                </View>
              </View>
            ))
          )}
        </LiveWidget>
      </ScrollView>
    </SafeAreaView>
  );
}

const TASK_DOT_COLORS: Record<string, string> = {
  success: cyber.green,
  failed: cyber.pink,
  escalated: cyber.pink,
  running: cyber.cyan,
};
const TASK_DOT_STYLE = (status: string) => ({
  width: 8,
  height: 8,
  borderRadius: 4,
  backgroundColor: TASK_DOT_COLORS[status] ?? cyber.textDim,
});

const createStyles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  menuRow: { marginBottom: 4 },
  header: { marginBottom: 8, gap: 2 },
  headerKicker: { ...cyberTypography.caption, color: colors.tint },
  headerTitle: { ...cyberTypography.display, color: colors.text },
  headerLine: { height: 2, borderRadius: 1, marginTop: 6 },
  gridRow: { flexDirection: "row", gap: 12 },
  halfWidget: { flex: 1 },
  emptyText: { color: colors.icon, fontSize: 12, lineHeight: 18 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },

  taskTextContainer: { flex: 1 },
  taskTitle: { color: colors.text, fontSize: 13, fontWeight: "600" },
  taskMeta: { color: colors.icon, fontSize: 10, marginTop: 1 },
});
