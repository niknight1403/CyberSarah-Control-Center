/**
 * Sprint 168 — Dashboard komplett auf "CyberSarah Future Glass" umgebaut.
 * Sprint 188 (Design): letzten Ad-hoc-Link (Geschäftsdaten) auf die
 * Glass-Primitives umgestellt — GlowButton (secondary, accent blue) statt
 * eigener Pressable-Karten-Styles. Keine Ad-hoc-Flaechen mehr in diesem Screen.
 *
 * Sprint 196 (Rundum-Update): VILLA-HUB-KARTE — Live-Status des VillaForge-
 * Hubs (hub.cybersarah-ki.com) via oeffentlichem /api/health (CORS, 30-s-
 * Polling): Version, LLM-Routen, Hub online. Antippen oeffnet den Hub.
 *
 * KEINE reine Farbaenderung: neuer Hintergrund (atmosphaerischer Deep-Void
 * mit Lichtwolken), neuer vereinheitlichter Header (Logo+Avatar+Status in
 * EINEM Modul statt zwei getrennten Karten), MetricTiles statt KPI-Karten,
 * ControlModuleCards statt einzelner System-/Chat-/Workspace-Komponenten,
 * Holo-Line-Chart statt Balken-Sparkline, AI-Core-Hero-Card fuer den
 * Superagenten. Alle Daten bleiben echt (useDashboardData) — kein Mock.
 */
import { useEffect, useMemo, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { TopNavigation } from "@/components/responsive/top-navigation";
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

type HubStatus = { ok: boolean; version: string; routes: number } | null;

/** Sprint 196: Live-Status des VillaForge-Hubs (v1.41.1+, CORS offen). */
function useHubStatus(): HubStatus {
  const [hub, setHub] = useState<HubStatus>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("https://hub.cybersarah-ki.com/api/health", {
          headers: { Accept: "application/json" },
        });
        const data: { ok?: boolean; version?: string; routes?: number } = await res.json();
        if (!cancelled) {
          setHub({ ok: !!data.ok, version: String(data.version ?? "—"), routes: Number(data.routes ?? 0) });
        }
      } catch {
        if (!cancelled) setHub(null);
      }
    };
    load();
    const timer = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  return hub;
}

export default function DashboardScreen() {
  const glass = useGlassTheme();
  const { vm, state, hasAlerts, isAdmin, retry, serverUptimeText } = useDashboardData();
  const hub = useHubStatus();
  const [showDetails, setShowDetails] = useState(false);
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && isWideViewport(width);
  const styles = useMemo(() => createStyles(glass, wide), [glass, wide]);

  if (state === "loading" || vm === null) {
    return (
      <GlassBackdrop>
        <ScreenContainer style={styles.transparent} containerClassName="bg-transparent">
          <TopNavigation />
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
          <TopNavigation />
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
        <TopNavigation />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <GlassHeader name={vm.user.name} roleBadge={roleBadge} online={vm.user.online} hasAlerts={hasAlerts} />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>ÜBERSICHT</Text>
            <Text style={styles.sectionTitle}>Dein Control Center</Text>
          </View>

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

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>SCHNELLZUGRIFF</Text>
            <Text style={styles.sectionTitle}>Steuerung & Verbindungen</Text>
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
              accent={vm.chat.status === "ready" || vm.chat.status === "configured" ? "cyan" : vm.chat.status === "unavailable" ? "red" : "amber"}
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
            <ControlModuleCard
              icon="sparkles"
              title="Villa-Hub"
              description={
                hub
                  ? `Version ${hub.version} · Villen, Qualitäts-Tor & GitHub-Produkte`
                  : "Verbinde mit hub.cybersarah-ki.com …"
              }
              metricValue={hub ? String(hub.routes) : undefined}
              metricLabel="LLM-Routen"
              statusLabel={hub ? (hub.ok ? "Hub online" : "Nicht erreichbar") : "Verbinde …"}
              accent={hub ? (hub.ok ? "cyan" : "red") : "amber"}
              live={!!hub?.ok}
              onPress={() => {
                void Linking.openURL("https://hub.cybersarah-ki.com").catch(() => undefined);
              }}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showDetails ? "Erweiterte Dashboard-Details ausblenden" : "Erweiterte Dashboard-Details anzeigen"}
            onPress={() => setShowDetails((previous) => !previous)}
            style={styles.detailsToggle}
          >
            <Text style={styles.detailsToggleText}>{showDetails ? "Weniger anzeigen −" : "Weitere Details anzeigen +"}</Text>
          </Pressable>
          {showDetails && <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>AKTIVITÄT</Text>
            <Text style={styles.sectionTitle}>Aktivität & Entwicklung</Text>
          </View>
          <HoloActivityCard count={vm.activity.count} changePercent={vm.activity.changePercent} points={vm.activity.points} />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>KI-ZENTRALE</Text>
            <Text style={styles.sectionTitle}>Autonome Intelligenz</Text>
          </View>
          <SuperagentHeroCard status={vm.superAgent.status} name={vm.superAgent.name} detail={vm.superAgent.detail} onRetry={retry} />

          <GlowButton
            label="Geschäftsdaten (Revenue, Trading, Ops) öffnen"
            accent="blue"
            variant="secondary"
            testID="dashboard-open-business"
            onPress={() => router.push("/business" as never)}
          />
          <Text style={styles.footnote}>Statuswerte werden vom Backend geladen; nicht erreichbare Dienste werden entsprechend gekennzeichnet.</Text>
          </>}
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
      paddingHorizontal: wide ? glass.glassSpacing.lg : 12,
      paddingBottom: 96,
      maxWidth: 1280,
      width: "100%",
      alignSelf: "center" as const,
    },
    sectionHeader: { gap: 2, marginTop: glass.glassSpacing.xs, paddingHorizontal: 2 },
    sectionEyebrow: { ...glass.glassType.label, color: glass.glassPalette.cyan },
    sectionTitle: { ...glass.glassType.title, color: glass.glassSurface.textPrimary, fontSize: wide ? 17 : 15 },
    metricRow: { flexDirection: "row", flexWrap: "wrap", gap: glass.glassSpacing.sm },
    moduleRow: wide ? { flexDirection: "row", gap: glass.glassSpacing.md } : { flexDirection: "column", gap: glass.glassSpacing.md },
    detailsToggle: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: glass.glassSurface.border, backgroundColor: glass.glassSurface.card },
    detailsToggleText: { color: glass.glassPalette.cyan, fontSize: 13, fontWeight: "700" },
    footnote: { fontSize: 11, color: glass.glassSurface.textMuted, textAlign: "center", paddingTop: 4 },
  });
}
