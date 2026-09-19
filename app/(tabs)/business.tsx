/**
 * Sprint 175 — Business-Dashboard auf "CyberSarah Future Glass" umgebaut
 * (Fortsetzung der Sprints 168/173/174).
 *
 * Logik (Daten-Hub, Offline-Puffer, Ops-Wacht, Memory, Metering, MCP,
 * Backup-Selbstbedienung, Web-Download des Exports) bleibt unveraendert;
 * nur die visuelle Schicht wechselt auf das verbindliche Glass-System:
 * GlassBackdrop statt ParticleField, GlassCard statt Ad-hoc-Tiles,
 * GlowButton statt handgebauten Buttons, AiCore statt AiOrb,
 * Typography/Token aus lib/design/future-glass statt Hartkodierungen.
 */
import { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, GlowButton } from "@/components/glass/glass-primitives";
import { AiCore } from "@/components/glass/ai-core";
import { trpc } from "@/lib/trpc";
import { useOfflineDashboard } from "@/hooks/use-offline-dashboard";
import { summarizeBackupExport, type BackupExport } from "@/lib/backup-self-service-logic";
import { summarizeMcpDiscovery, type McpConnectReport } from "@/lib/mcp-client-logic";
import { accentAlpha, glassPalette, glassSpacing, glassSurface, glassType } from "@/lib/design/future-glass";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";

/** Sprint 156 — exportiert, damit der DTO-Typ dokumentiert bleibt. */
export type DashboardData = {
  revenue: { status: string; totalBalanceEur?: number; revenueLast24hEur?: number; activeSubscriptions?: number };
  trading: { status: string; tickers: { symbol: string; priceUsd: number; changePercent: number }[]; error?: string };
  analytics:
    | { status: "ok"; activeUsers: number; sessions: number; conversions: number }
    | { status: "not-configured"; modules: string[] };
  crm?: { status: string; totalContacts?: number; contactsCreatedLast24h?: number; salesforce?: string };
  content?: { channels: { name: string; status: string; detail?: string }[] };
  aiServices?: { services: { name: string; configured: boolean }[] };
  /** Sprint 114: read-only-Snapshot aus der Revenue-OS-Datenbank (Schwestersystem). */
  revenueOs?: RevenueOsData;
};

/** Sprint 114 — Revenue-OS-Snapshot (read-only, Schwestersystem-Datenbank). */
type RevenueOsData =
  | {
      status: "ok";
      revenueLast24hEur: number;
      transactionsLast24h: number;
      totalRevenueEur: number;
      topQuelle: string;
      contentByStatus: Record<string, number>;
      affiliateClicks: number;
      affiliateConversions: number;
      provisionSummeEur: number;
      activePartners: number;
      activeSubscriptions: number;
      fetchedAt: string;
    }
  | { status: "not-configured" }
  | { status: "error"; error: string };

type OpsOverview = {
  overall: "unknown" | "ok" | "degraded" | "down";
  focus: string | null;
  checks: {
    label: string;
    state: "unknown" | "ok" | "degraded" | "down";
    stale: boolean;
    /** Sprint 110: Warnstufe je Komponente. */
    level: "ok" | "warnung" | "kritisch" | "unbekannt";
    /** Sprint 110: Messzeitpunkt (Epoch-Millisekunden, Serveruhr). */
    checkedAt: number | null;
    /** Sprint 110: letztes bekanntes Fehlerbild (ueber Messungen hinweg). */
    lastFailure: string | null;
  }[];
};

/** Sprint 110: relative Zeitangabe fuer den Messzeitpunkt je Komponente. */
function relativeCheckedAt(checkedAt: number | null): string {
  if (!checkedAt) return "ungeprüft";
  const minutes = Math.max(0, Math.round((Date.now() - checkedAt) / 60_000));
  if (minutes < 1) return "gerade";
  if (minutes < 60) return `vor ${minutes} min`;
  return `vor ${Math.round(minutes / 60)} h`;
}

function Tile({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: "ok" | "warn" }) {
  const accent = tone === "ok" ? "green" : "amber";
  return (
    <GlassCard accent={accent} style={styles.tile}>
      <View style={styles.tileHeader}>
        <AiCore state={tone === "ok" ? "idle" : "warning"} size={18} />
        <Text style={[styles.tileTitle, { color: glassPalette[accent] }]}>{title}</Text>
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileDetail}>{detail}</Text>
    </GlassCard>
  );
}

function OpsWatchTile({ overview }: { overview: OpsOverview }) {
  // Sprint 110: Stufen je Komponente — ok / Warnung / kritisch / unbekannt.
  const levelLabel = { ok: "ok", warnung: "Warnung", kritisch: "kritisch", unbekannt: "unbekannt" } as const;
  const stateLabel = { ok: "GRÜN", degraded: "EINGESCHRÄNKT", down: "KRITISCH", unknown: "UNBEKANNT" }[overview.overall];
  const ok = overview.overall === "ok";
  return (
    <GlassCard accent={ok ? "green" : "amber"} glow={1} style={styles.tile}>
      <View style={styles.tileHeader}>
        <AiCore state={ok ? "idle" : "error"} size={18} />
        <Text style={[styles.tileTitle, { color: ok ? glassPalette.green : glassPalette.amber }]}>Betriebswacht (Admin)</Text>
        <Text style={[styles.opsState, { color: ok ? glassPalette.green : glassPalette.amber }]}>{stateLabel}</Text>
      </View>
      <Text style={styles.opsFocus}>{overview.focus ?? "Keine Messwerte vorhanden."}</Text>
      <View style={styles.checkList}>
        {overview.checks.map((check) => (
          <View key={check.label}>
            <View style={styles.checkRow}>
              <View
                style={[
                  styles.checkDot,
                  {
                    backgroundColor:
                      check.level === "ok" ? glassPalette.green : check.level === "kritisch" ? glassPalette.red : glassPalette.amber,
                  },
                ]}
              />
              <Text style={styles.checkLabel}>{check.label}</Text>
              <Text style={styles.checkValue}>
                {check.stale ? "veraltet" : `${levelLabel[check.level]} · ${relativeCheckedAt(check.checkedAt)}`}
              </Text>
            </View>
            {check.lastFailure && check.level === "ok" ? (
              <Text style={styles.checkFailure}>
                Letztes Fehlerbild: {check.lastFailure}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

/** Sprint 113 — Daten der Memory-Kachel (tRPC memory.overview, Admin). */
type MemoryOverview = {
  dbAvailable: boolean;
  totalLearnings: number;
  lastConsolidation: {
    trigger: string;
    summary: string;
    inputCount: number;
    survivorCount: number;
    mergedAway: number;
    invalidated: number;
    contradictionCount: number;
    createdAt: string;
  } | null;
  retrieval: { samples: number; hitRatePct: number; avgInjections: number };
};

function RevenueOsTile({ data }: { data: RevenueOsData }) {
  if (data.status === "not-configured") {
    return (
      <Tile
        title="Revenue-OS (read-only)"
        tone="warn"
        value="Nicht angebunden"
        detail="REVENUE_OS_DATABASE_URL auf dem Server hinterlegen (getrenntes Secret des Schwestersystems) — dann erscheinen hier Umsatz, Content-Status und Affiliate-Klicks live."
      />
    );
  }
  if (data.status === "error") {
    return <Tile title="Revenue-OS (read-only)" tone="warn" value="Nicht abrufbar" detail={data.error} />;
  }
  const contentSummary =
    Object.entries(data.contentByStatus).length > 0
      ? Object.entries(data.contentByStatus)
          .map(([status, count]) => `${count} ${status}`)
          .join(" · ")
      : "Keine Inhalte";
  return (
    <Tile
      title="Revenue-OS (read-only)"
      tone="ok"
      value={`${data.revenueLast24hEur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / 24 h`}
      detail={`Affiliate: ${data.affiliateClicks} Klicks · ${data.activePartners} aktive Partner · Content: ${contentSummary}`}
    />
  );
}

/** Sprint 115 — Provider-Metering (Admin, tRPC metering.overview). */
type MeteringOverview = {
  providers: {
    source: string;
    label: string;
    status: "active" | "cooling" | "exhausted";
    callsWindow: number;
    http429Window: number;
    rate429Window: number;
    httpAuthWindow: number;
    failoversWindow: number;
    avgLatencyMs: number;
    activePath: string[];
    cooldownRemainingSec: number | null;
    remainingCredits: number | null;
  }[];
  firedWarnings: string[];
  windowHours: number;
  generatedAt: string;
};

function MeteringTile({ overview }: { overview: MeteringOverview }) {
  if (overview.providers.length === 0) {
    return (
      <Tile
        title="Provider-Metering (Admin)"
        tone="warn"
        value="Keine verwalteten Keys"
        detail="Sobald LLM-Keys (Forge/Gemini/OpenAI) als Umgebungsvariablen liegen, erscheinen hier Verbrauch, 429-Rate und Fallback-Pfad."
      />
    );
  }
  const active = overview.providers.filter((provider) => provider.status === "active").length;
  return (
    <Tile
      title="Provider-Metering (Admin)"
      tone={active > 0 ? "ok" : "warn"}
      value={`${active}/${overview.providers.length} Keys aktiv`}
      detail={overview.providers
        .slice(0, 3)
        .map(
          (provider) =>
            `${provider.source}: ${provider.callsWindow} Calls · ${Math.round(provider.rate429Window * 100)} % 429${provider.cooldownRemainingSec !== null ? ` · Cooldown ${provider.cooldownRemainingSec}s` : ""}`,
        )
        .join(" · ")}
    />
  );
}

function MemoryTile({ overview }: { overview: MemoryOverview }) {
  const last = overview.lastConsolidation;
  const lines = last
    ? [
        `Letzter Lauf (${last.trigger}): ${last.survivorCount} behalten · ${last.mergedAway} zusammengeführt · ${last.invalidated} entfernt · ${last.contradictionCount} Widersprüche`,
      ]
    : ["Noch kein Konsolidierungslauf — der tägliche Workflow startet um 05:30 MESZ."];
  if (overview.retrieval.samples > 0) {
    lines.push(
      `Retrieval: ${overview.retrieval.samples} Stichproben · ${overview.retrieval.hitRatePct} % Trefferquote · Ø ${overview.retrieval.avgInjections} Injektionen je Turn`,
    );
  } else {
    lines.push("Retrieval-Metriken sammeln sich im Chat-Betrieb.");
  }
  return (
    <GlassCard accent={overview.dbAvailable ? "purple" : "amber"} style={styles.tile}>
      <View style={styles.tileHeader}>
        <AiCore state={overview.dbAvailable ? "processing" : "error"} size={18} />
        <Text style={[styles.tileTitle, { color: glassPalette.purple }]}>Agenten-Gedächtnis (Admin)</Text>
      </View>
      <Text style={styles.opsFocus}>{overview.totalLearnings} Learnings im Bestand</Text>
      {lines.map((line) => (
        <Text key={line} style={styles.tileDetail}>
          {line}
        </Text>
      ))}
    </GlassCard>
  );
}

/**
 * Sprint 156 — Business-Dashboard (Umzug von /dashboard nach /business):
 * Revenue, Trading, Ops-Wacht. Vollstaendig erhaltene Produktionsfunktion.
 */
export default function BusinessDashboardScreen() {
  // Sprint 119: Offline-Puffer — Live-Daten schlagen immer, bei Fehler transparenter Cache.
  const { data, isLoading, error, source, cacheAgeLabel, refresh } = useOfflineDashboard();
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const isAdmin = accountQuery.data?.role === "admin";
  const opsQuery = trpc.ops.overview.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const memoryQuery = trpc.memory.overview.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  // Sprint 115: Provider-Metering (Admin) — Verbrauch, 429-Rate, Fallback-Pfad.
  const meteringQuery = trpc.metering.overview.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Sprint 122: MCP-Transporte — verfuegbare Transportschicht (Streamable HTTP + SSE-Fallback).
  const mcpQuery = trpc.mcp.transports.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
    staleTime: 60_000,
  });

  // Sprint 135: Echter Discovery-Lauf gegen den konfigurierten MCP-Server —
  // connect liefert Tools + Server-Info oder den ehrlichen Grund (kein Werfen).
  const mcpConnect = trpc.mcp.connect.useMutation();
  const [mcpSummary, setMcpSummary] = useState<ReturnType<typeof summarizeMcpDiscovery> | null>(null);

  const triggerMcpConnect = useCallback(() => {
    mcpConnect.mutate(undefined, {
      onSuccess: (report: McpConnectReport) => {
        setMcpSummary(summarizeMcpDiscovery(report));
        if (report.connected) {
          mcpQuery.refetch().catch(() => {
            // Nur die Anzeige — der Discovery-Lauf selbst war erfolgreich.
          });
        }
      },
    });
  }, [mcpConnect, mcpQuery]);

  // Sprint 120: Backup-Selbstbedienung — Admin zieht den vollstaendigen Export selbst.
  const backupExport = trpc.ops.backupExport.useMutation();
  const [backupSummary, setBackupSummary] = useState<ReturnType<typeof summarizeBackupExport> | null>(null);

  const triggerBackup = useCallback(() => {
    backupExport.mutate(undefined, {
      onSuccess: (backup: BackupExport) => {
        setBackupSummary(summarizeBackupExport(backup, Date.now()));
        if (Platform.OS === "web" && typeof document !== "undefined") {
          const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = backup.manifest.filename;
          anchor.click();
          URL.revokeObjectURL(url);
        }
      },
    });
  }, [backupExport]);

  const revenue = data?.revenue;
  const trading = data?.trading;
  const cryptoLine = (trading?.tickers ?? [])
    .map((ticker) => `${ticker.symbol.replace("USDT", "")} ${ticker.priceUsd.toLocaleString("de-DE", { maximumFractionDigits: 0 })}$`)
    .join(" · ");

  const channels = data?.content?.channels ?? [];
  const aiServices = data?.aiServices?.services ?? [];
  const activeChannels = channels.filter((channel) => channel.status === "ok").length;
  const activeAiServices = aiServices.filter((service) => service.configured).length;
  const integrationsDetail =
    [
      ...channels.map((channel) => `${channel.name}: ${channel.status === "ok" ? channel.detail ?? "verbunden" : "Key fehlt"}`),
      ...aiServices.map((service) => `${service.name}: ${service.configured ? "verfuegbar" : "Key fehlt"}`),
    ]
      .slice(0, 2)
      .join(" · ");

  const navDrawer = useNavDrawer();
  return (
    <GlassBackdrop accent="green">
      <ScreenContainer style={styles.transparent}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <NavDrawer {...navDrawer.drawerProps} />
            <NavDrawerButton {...navDrawer.hamburgerProps} />
            <AiCore state={isLoading ? "thinking" : error ? "error" : "idle"} size={34} />
            <Pressable
              style={styles.headerCopy}
              disabled={source !== "cache"}
              onPress={refresh}
              accessibilityHint={source === "cache" ? "Offline-Daten aktualisieren" : undefined}
            >
              <Text style={styles.title}>Dashboard</Text>
              <Text style={styles.subtitle}>
                {source === "cache"
                  ? `Offline · Daten von ${cacheAgeLabel} · tippen zum Aktualisieren`
                  : isLoading
                    ? "CyberSarah synchronisiert Live-Daten …"
                    : "Master-Agent · Live-Geschaeftsdaten"}
              </Text>
            </Pressable>
          </View>

          <Tile
            title="Umsatz (Stripe)"
            tone={revenue?.status === "ok" ? "ok" : "warn"}
            value={
              revenue?.status === "ok"
                ? `${(revenue.totalBalanceEur ?? 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`
                : revenue?.status === "not-configured"
                  ? "Nicht konfiguriert"
                  : "Nicht verfügbar"
            }
            detail={
              revenue?.status === "ok"
                ? `24 h: ${(revenue.revenueLast24hEur ?? 0).toLocaleString("de-DE")} € · ${revenue.activeSubscriptions ?? 0} aktive Abos`
                : "STRIPE_SECRET_KEY im Server hinterlegen für Live-Einnahmen."
            }
          />

          <Tile
            title="Trading (Binance)"
            tone={trading?.status === "ok" ? "ok" : "warn"}
            value={trading?.status === "ok" ? cryptoLine || "—" : "Nicht verfügbar"}
            detail={trading?.status === "ok" ? "BTC · ETH · SOL — Echtzeit, 24h-Vergleich" : trading?.error ?? "Kurse konnten nicht geladen werden."}
          />

          <Tile
            title="Analytics (GA4, 7 Tage)"
            tone={data?.analytics?.status === "ok" ? "ok" : "warn"}
            value={
              data?.analytics?.status === "ok"
                ? `${data.analytics.activeUsers.toLocaleString("de-DE")} aktive Nutzer`
                : "Nicht konfiguriert"
            }
            detail={
              data?.analytics?.status === "ok"
                ? `${data.analytics.sessions.toLocaleString("de-DE")} Sitzungen · ${data.analytics.conversions.toLocaleString("de-DE")} Conversions`
                : "GA4_PROPERTY_ID + GA4_ACCESS_TOKEN im Server hinterlegen für Kampagnen-Daten."
            }
          />

          <Tile
            title="CRM (HubSpot)"
            tone={data?.crm?.status === "ok" ? "ok" : "warn"}
            value={data?.crm?.status === "ok" ? `${(data.crm.totalContacts ?? 0).toLocaleString("de-DE")} Kontakte` : "Nicht konfiguriert"}
            detail={
              data?.crm?.status === "ok"
                ? `${data.crm.contactsCreatedLast24h ?? 0} Neukontakte (24 h) · Salesforce: ${data.crm.salesforce === "ok" ? "verbunden" : "nicht konfiguriert"}`
                : "HUBSPOT_ACCESS_TOKEN im Server hinterlegen für Kunden-Daten."
            }
          />

          <Tile
            title="Content & KI-Dienste"
            tone={activeChannels > 0 || activeAiServices > 0 ? "ok" : "warn"}
            value={`${activeChannels}/${channels.length} Kanäle · ${activeAiServices}/${aiServices.length} KI-Dienste`}
            detail={integrationsDetail || "TikTok/Instagram-Keys und Perplexity/ElevenLabs hinterlegen."}
          />

          <Tile
            title="System"
            tone={(data?.system?.recentErrors?.length ?? 0) === 0 ? "ok" : "warn"}
            value={`${data?.system?.recentErrors?.length ?? 0} offene Fehler`}
            detail={
              (data?.system?.recentErrors?.length ?? 0) === 0
                ? "Alle Services grün."
                : (data?.system?.recentErrors ?? []).slice(0, 2).join(" · ")
            }
          />

          {isAdmin && (opsQuery.data || opsQuery.isLoading) ? (
            opsQuery.data ? <OpsWatchTile overview={opsQuery.data} /> : <Tile title="Betriebswacht (Admin)" tone="warn" value="Prüfung läuft …" detail="API, Datenbank, Workspace und KI-Chat werden geprüft." />
          ) : null}

          {data?.revenueOs ? <RevenueOsTile data={data.revenueOs} /> : null}

          {isAdmin && meteringQuery.data ? <MeteringTile overview={meteringQuery.data} /> : null}

          {isAdmin ? (
            <GlassCard accent="cyan" style={styles.tile}>
              <Text style={styles.blockTitle}>BACKUP-SELBSTBEDIENUNG</Text>
              <Text style={styles.blockValue}>
                {backupSummary
                  ? `${backupSummary.totalRows} Zeilen · ${backupSummary.tableCount} Tabellen · ${backupSummary.sizeLabel}`
                  : "Vollständiger Datenbank-Export auf Abruf"}
              </Text>
              <Text style={styles.tileDetail}>
                {backupExport.isPending
                  ? "Export läuft — Daten werden gelesen und geprüft …"
                  : backupSummary
                    ? `${backupSummary.filename} (${backupSummary.ageLabel})`
                    : "Manifest mit Prüfsumme + alle Tabellendaten, ohne Shell-Zugang."}
              </Text>
              {backupExport.isError ? (
                <Text style={styles.errorText}>
                  {backupExport.error instanceof Error ? backupExport.error.message : "Backup fehlgeschlagen."}
                </Text>
              ) : null}
              <GlowButton
                label={backupExport.isPending ? "Export läuft …" : "Backup jetzt erstellen"}
                onPress={triggerBackup}
                disabled={backupExport.isPending}
                accent="cyan"
                variant="secondary"
                testID="business-backup-export"
              />
            </GlassCard>
          ) : null}

          {isAdmin && mcpQuery.data ? (
            <GlassCard accent="purple" style={styles.tile}>
              <Text style={styles.blockTitle}>MCP-TRANSPORTE</Text>
              <Text style={styles.blockValue}>
                {mcpQuery.data.baseUrl ? `${mcpQuery.data.transports.length} Transporte verfügbar` : "Kein MCP-Server konfiguriert"}
              </Text>
              {mcpQuery.data.transports.map((transport) => (
                <Text key={transport.kind} style={styles.tileDetail}>
                  {transport.label}: {transport.configured ? "angeschlossen" : transport.invalidReason ?? "nicht angeschlossen"}
                  {transport.preferred ? " (Standard)" : ""}
                </Text>
              ))}
              {mcpSummary ? (
                <>
                  <Text style={styles.blockValue}>{mcpSummary.statusLabel}</Text>
                  {mcpSummary.serverLabel ? (
                    <Text style={styles.tileDetail}>Server: {mcpSummary.serverLabel}</Text>
                  ) : null}
                  {mcpSummary.toolNames.length > 0 ? (
                    <Text style={styles.tileDetail}>
                      {mcpSummary.toolNames.join(" · ")}
                      {mcpSummary.moreCount > 0 ? ` · +${mcpSummary.moreCount} weitere` : ""}
                    </Text>
                  ) : null}
                </>
              ) : null}
              {mcpConnect.isError ? (
                <Text style={styles.errorText}>
                  {mcpConnect.error instanceof Error ? mcpConnect.error.message : "Discovery fehlgeschlagen."}
                </Text>
              ) : null}
              <GlowButton
                label={mcpConnect.isPending ? "Verbinde mit MCP-Server …" : "Verbinden & Tools entdecken"}
                onPress={triggerMcpConnect}
                disabled={mcpConnect.isPending}
                accent="purple"
                variant="secondary"
                testID="business-mcp-connect"
              />
            </GlassCard>
          ) : null}

          {isAdmin && memoryQuery.data ? <MemoryTile overview={memoryQuery.data} /> : null}
        </ScrollView>
      </ScreenContainer>
    </GlassBackdrop>
  );
}

const styles = StyleSheet.create({
  transparent: { backgroundColor: "transparent" },
  content: { gap: glassSpacing.md, padding: glassSpacing.lg, paddingBottom: 32 },
  header: { alignItems: "center", flexDirection: "row", gap: glassSpacing.md, marginBottom: glassSpacing.sm },
  headerCopy: { flex: 1 },
  title: { ...glassType.headline, fontSize: 22, color: glassSurface.textPrimary },
  subtitle: { ...glassType.caption, color: glassSurface.textSecondary },
  tile: { gap: glassSpacing.xs, padding: glassSpacing.lg },
  tileHeader: { alignItems: "center", flexDirection: "row", gap: glassSpacing.sm },
  tileTitle: { ...glassType.caption, fontSize: 11 },
  tileValue: { ...glassType.headline, color: glassSurface.textPrimary },
  tileDetail: { ...glassType.caption, color: glassSurface.textSecondary, lineHeight: 17 },
  blockTitle: { ...glassType.label, color: glassSurface.textMuted },
  blockValue: { ...glassType.title, color: glassSurface.textPrimary },
  errorText: { ...glassType.caption, color: glassPalette.red, lineHeight: 17 },
  opsState: { ...glassType.label, marginLeft: "auto" },
  opsFocus: { ...glassType.body, fontWeight: "700", lineHeight: 19, color: glassSurface.textPrimary },
  checkList: { gap: 6 },
  checkRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  checkDot: { borderRadius: 4, height: 7, width: 7 },
  checkLabel: { ...glassType.caption, flex: 1, fontSize: 11, color: glassSurface.textSecondary },
  checkValue: { ...glassType.caption, fontSize: 11, fontWeight: "700", color: glassSurface.textPrimary },
  checkFailure: { ...glassType.label, fontSize: 10, paddingLeft: 14, paddingRight: 4, color: accentAlpha("blue", 0.75) },
});
