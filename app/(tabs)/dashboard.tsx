/**
 * Sprint 156 — Neon-Pulse-Dashboard (ersetzt das Haupt-Dashboard).
 *
 * Echte, responsive Benutzeroberflaeche (kein statisches Bild): Header,
 * Benutzeruebersicht, KPI-Karten, System-/Chat-/Workspace-Karten,
 * Aktivitaetsuebersicht und Superagenten-Modul — alle mit echten Backend-
 * Daten, Loading-/Empty-/Fehler-Zustaenden und ohne erfundene Werte.
 * Das bisherige Business-Dashboard (Revenue/Trading/Ops) bleibt vollstaendig
 * unter /business erreichbar.
 */
import { useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { DashboardHeader } from "@/components/cyber/dashboard/dashboard-header";
import { UserOverviewCard } from "@/components/cyber/dashboard/user-overview-card";
import { DashboardKpiCard } from "@/components/cyber/dashboard/dashboard-kpi-card";
import { SystemStatusCard } from "@/components/cyber/dashboard/system-status-card";
import { AiChatStatusCard } from "@/components/cyber/dashboard/ai-chat-status-card";
import { WorkspaceStatusCard } from "@/components/cyber/dashboard/workspace-status-card";
import { ActivitySummaryCard } from "@/components/cyber/dashboard/activity-summary-card";
import { SuperAgentCard } from "@/components/cyber/dashboard/super-agent-card";
import { DashboardErrorState, DashboardSkeleton } from "@/components/cyber/dashboard/dashboard-states";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { formatUptime, systemStatusCopy, workspaceStatusCopy } from "@/lib/dashboard-view-model";
import { neonPulse as t } from "@/lib/neon-pulse-theme";
import { isWideViewport } from "@/lib/viewport-logic";

export default function DashboardScreen() {
  const { vm, state, hasAlerts, isAdmin, retry, serverUptimeText } = useDashboardData();
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && isWideViewport(width);
  const threeColumns = wide;

  const styles = useMemo(() => createStyles(threeColumns), [threeColumns]);

  if (state === "loading" || vm === null) {
    return (
      <ScreenContainer>
        <ScrollView contentContainerStyle={styles.content}>
          <DashboardHeader hasAlerts={false} />
          <DashboardSkeleton />
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (state === "error") {
    return (
      <ScreenContainer>
        <ScrollView contentContainerStyle={styles.content}>
          <DashboardHeader hasAlerts />
          <DashboardErrorState
            message="Die Dashboard-Daten konnten nicht geladen werden. Prüfe die Verbindung und versuche es erneut."
            onRetry={retry}
          />
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <DashboardHeader hasAlerts={hasAlerts} />

        <UserOverviewCard
          name={vm.user.name}
          role={vm.user.role === "admin" ? "admin" : vm.user.role === "user" ? "user" : null}
          authenticated={vm.user.online}
          sessionExpired={vm.user.sessionState === "sitzung-abgelaufen"}
        />

        <View style={styles.kpiRow}>
          <DashboardKpiCard
            icon="sparkles"
            label="Agenten"
            value={vm.kpis.agents === null ? "—" : String(vm.kpis.agents)}
            loading={false}
            error={false}
            onPress={() => router.push("/agent" as never)}
          />
          <DashboardKpiCard
            icon="bolt.fill"
            label="Provider"
            value={vm.kpis.providers === null ? "—" : String(vm.kpis.providers)}
            status={vm.kpis.providers === 0 ? "Kein Provider aktiv" : undefined}
            accent={t.turquoise}
            loading={false}
            error={false}
            onPress={isAdmin ? () => router.push("/admin" as never) : undefined}
          />
          <DashboardKpiCard
            icon="checkmark.circle.fill"
            label="Uptime"
            value={formatUptime(vm.kpis.uptime)}
            accent={vm.system.status === "healthy" ? t.emerald : t.warning}
            loading={false}
            error={false}
          />
        </View>

        <View style={styles.systemRow}>
          <SystemStatusCard
            status={vm.system.status}
            detail={vm.system.detail || systemStatusCopy[vm.system.status]}
            uptimeText={serverUptimeText}
            offline={vm.system.status === "offline"}
            onRetry={retry}
          />
          <AiChatStatusCard
            status={vm.chat.status}
            provider={vm.chat.provider}
            model={vm.chat.model}
            isAdmin={isAdmin}
          />
          <WorkspaceStatusCard
            status={vm.workspace.status}
            count={vm.workspace.count}
            detail={workspaceStatusCopy[vm.workspace.status]}
          />
        </View>

        <ActivitySummaryCard
          count={vm.activity.count}
          changePercent={vm.activity.changePercent}
          points={vm.activity.points}
        />

        <SuperAgentCard
          status={vm.superAgent.status}
          name={vm.superAgent.name}
          detail={vm.superAgent.detail}
          onRetry={retry}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Geschäftsdaten-Dashboard öffnen"
          style={({ pressed }) => [styles.businessLink, pressed && styles.pressed]}
          onPress={() => router.push("/business" as never)}
        >
          <Text style={styles.businessLinkText}>Geschäftsdaten (Revenue, Trading, Ops) öffnen</Text>
        </Pressable>
        <Text style={styles.footnote}>
          Alle Werte stammen live aus dem Backend — ohne Platzhalterdaten.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}


const base = StyleSheet.create({
  root: { backgroundColor: t.background },
  content: { gap: 14, paddingBottom: 32, maxWidth: 1280, width: "100%", alignSelf: "center" as const },
  kpiRow: { flexDirection: "row", gap: 12 },
  systemRow: { flexDirection: "row", gap: 12 },
  footnote: { fontSize: 11, color: t.textMuted, textAlign: "center", paddingTop: 4 },
  businessLink: {
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(91, 219, 255, 0.2)",
    backgroundColor: "rgba(8, 27, 42, 0.6)", alignItems: "center", justifyContent: "center",
    minHeight: 44, paddingVertical: 10,
  },
  businessLinkText: { color: t.textSecondary, fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.72 },
});

function createStyles(threeColumns: boolean) {
  if (threeColumns) return base;
  return StyleSheet.create({
    ...base,
    kpiRow: { ...base.kpiRow, flexWrap: "wrap" as const },
    systemRow: { ...base.systemRow, flexDirection: "column" as const },
  });
}
