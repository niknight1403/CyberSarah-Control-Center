/**
 * Sprint 168 — Dashboard komplett auf "CyberSarah Future Glass" umgebaut.
 * Sprint 188 (Design): letzten Ad-hoc-Link (Geschäftsdaten) auf die
 * Glass-Primitives umgestellt — GlowButton (secondary, accent blue) statt
 * eigener Pressable-Karten-Styles. Keine Ad-hoc-Flaechen mehr in diesem Screen.
 *
 * KEINE reine Farbaenderung: neuer Hintergrund (atmosphaerischer Deep-Void
 * mit Lichtwolken), neuer vereinheitlichter Header (Logo+Avatar+Status in
 * EINEM Modul statt zwei getrennten Karten), MetricTiles statt KPI-Karten,
 * ControlModuleCards statt einzelner System-/Chat-/Workspace-Komponenten,
 * Holo-Line-Chart statt Balken-Sparkline, AI-Core-Hero-Card fuer den
 * Superagenten. Alle Daten bleiben echt (useDashboardData) — kein Mock.
 */
import { useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlowButton } from "@/components/glass/glass-primitives";
import { GlassHeader } from "@/components/glass/glass-header";
import { MetricTile } from "@/components/glass/metric-tile";
import { ControlModuleCard } from "@/components/glass/control-module-card";
import { HoloActivityCard } from "@/components/glass/holo-activity-card";
import { SuperagentHeroCard } from "@/components/glass/superagent-hero-card";
import { DashboardErrorState, DashboardSkeleton } from "@/components/cyber/dashboard/dashboard-states";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { chatStatusCopy, formatUptime, systemStatusCopy, workspaceStatusCopy } from "@/lib/dashboard-view-model";
import { isWideViewport } from "@/lib/viewport-logic";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";

export default function DashboardScreen() {
  const glass = useGlassTheme();
  const { vm, state, hasAlerts, isAdmin, retry, serverUptimeText } = useDashboardData();
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && isWideViewport(width);
  const styles = useMemo(() => createStyles(glass, wide), [glass, wide]);

  if (state === "loading" || vm === null) {
    return (
      <GlassBackdrop>
        <ScreenContainer style={styles.transparent} containerClassName="bg-transparent">
          <ScrollView contentContainerStyle={styles.content}>
            <GlassHeader name={null} roleBadge={null} online={false} hasAlerts={false} />
            <DashboardSkeleton />
          </ScrollView>
        </ScreenContainer>
      </GlassBackdrop>
    );
  }

  if (state === "error") {
    return (
      <GlassBackdrop>
        <ScreenContainer style={styles.transparent} containerClassName="bg-transparent">
          <ScrollView contentContainerStyle={styles.content}>
            <GlassHeader name={null} roleBadge={null} online={false} hasAlerts />
            <DashboardErrorState
              message="Die Dashboard-Daten konnten nicht geladen werden. Prüfe die Verbindung und versuche es erneut."
              onRetry={retry}
            />
          </ScrollView>
        </ScreenContainer>
      </GlassBackdrop>
    );
  }

  const roleBadge = vm.user.role === "admin" ? "Administrator" : vm.user.role === "user" ? "Nutzer" : null;

  return (
    <GlassBackdrop>
      <ScreenContainer style={styles.transparent} containerClassName="bg-transparent">
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <GlassHeader name={vm.user.name} roleBadge={roleBadge} online={vm.user.online} hasAlerts={hasAlerts} />

          <View style={styles.metricRow}>
            <MetricTile
              icon="sparkles"
              label="AGENTEN"
              value={vm.kpis.agents === null ? "—" : String(vm.kpis.agents)}
              accent="magenta"
              onPress={() => router.push("/agent" as never)}
            />
            <MetricTile
              icon="bolt.fill"
              label="PROVIDER"
              value={vm.kpis.providers === null ? "—" : String(vm.kpis.providers)}
              accent="cyan"
              statusNote={vm.kpis.providers === 0 ? "Keiner aktiv" : undefined}
              onPress={isAdmin ? () => router.push("/admin" as never) : undefined}
            />
            <MetricTile
              icon="checkmark.circle.fill"
              label="UPTIME"
              value={formatUptime(vm.kpis.uptime)}
              accent={vm.system.status === "healthy" ? "green" : "amber"}
            />
          </View>

          <View style={styles.moduleRow}>
            <ControlModuleCard
              icon="server.rack"
              title="Systemstatus"
              description={vm.system.detail || systemStatusCopy[vm.system.status]}
              metricValue={serverUptimeText || undefined}
              metricLabel="Server-Uptime"
              statusLabel={vm.system.status === "healthy" ? "Alle Systeme aktiv" : systemStatusCopy[vm.system.status]}
              accent={vm.system.status === "healthy" ? "green" : vm.system.status === "offline" ? "red" : "amber"}
              live={vm.system.status === "healthy"}
              onPress={retry}
            />
            <ControlModuleCard
              icon="message.fill"
              title="KI-Chat"
              description={vm.chat.provider ? `${vm.chat.provider}${vm.chat.model ? ` · ${vm.chat.model}` : ""}` : chatStatusCopy[vm.chat.status]}
              statusLabel={chatStatusCopy[vm.chat.status]}
              accent={vm.chat.status === "ready" ? "cyan" : vm.chat.status === "unavailable" ? "red" : "amber"}
              live={vm.chat.status === "ready"}
              onPress={() => router.push("/chat" as never)}
            />
            <ControlModuleCard
              icon="folder.fill"
              title="Workspace"
              description={workspaceStatusCopy[vm.workspace.status]}
              metricValue={vm.workspace.count === null ? undefined : String(vm.workspace.count)}
              metricLabel="Projekte"
              statusLabel={workspaceStatusCopy[vm.workspace.status]}
              accent={vm.workspace.status === "ready" ? "blue" : "amber"}
              live={vm.workspace.status === "ready"}
              onPress={() => router.push("/" as never)}
            />
          </View>

          <HoloActivityCard count={vm.activity.count} changePercent={vm.activity.changePercent} points={vm.activity.points} />

          <SuperagentHeroCard status={vm.superAgent.status} name={vm.superAgent.name} detail={vm.superAgent.detail} onRetry={retry} />

          <GlowButton
            label="Geschäftsdaten (Revenue, Trading, Ops) öffnen"
            accent="blue"
            variant="secondary"
            testID="dashboard-open-business"
            onPress={() => router.push("/business" as never)}
          />
          <Text style={styles.footnote}>Alle Werte stammen live aus dem Backend — ohne Platzhalterdaten.</Text>
        </ScrollView>
      </ScreenContainer>
    </GlassBackdrop>
  );
}

function createStyles(glass: RuntimeGlassTheme, wide: boolean) {
  return StyleSheet.create({
    transparent: { backgroundColor: "transparent" },
    content: {
      gap: glass.glassSpacing.lg,
      paddingHorizontal: glass.glassSpacing.lg,
      paddingBottom: 120,
      maxWidth: 1280,
      width: "100%",
      alignSelf: "center" as const,
    },
    metricRow: { flexDirection: "row", gap: glass.glassSpacing.md },
    moduleRow: wide ? { flexDirection: "row", gap: glass.glassSpacing.md } : { flexDirection: "column", gap: glass.glassSpacing.md },
    footnote: { fontSize: 11, color: glass.glassSurface.textMuted, textAlign: "center", paddingTop: 4 },
  });
}
