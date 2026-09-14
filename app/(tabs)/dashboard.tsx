import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { AiOrb, ParticleField } from "@/components/living/living-ui";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";

/**
 * Sprint 90 — Dashboard: Live-Geschaeftsdaten des Master-Agenten.
 * Revenue (Stripe), Trading (Binance BTC/ETH/SOL), Analytics-Status —
 * im Living-AI-Interface-Look (#030617, Glassmorphism, AI-Orbs).
 * Daten kommen aus dem serverseitigen Daten-Hub (tRPC dataHub.dashboard),
 * der selbstheilende Retries und klare "nicht konfiguriert"-Zustaende liefert.
 */

type DashboardData = {
  revenue: { status: string; totalBalanceEur?: number; revenueLast24hEur?: number; activeSubscriptions?: number };
  trading: { status: string; tickers: { symbol: string; priceUsd: number; changePercent: number }[]; error?: string };
  analytics:
    | { status: "ok"; activeUsers: number; sessions: number; conversions: number }
    | { status: "not-configured"; modules: string[] };
  crm?: { status: string; totalContacts?: number; contactsCreatedLast24h?: number; salesforce?: string };
  content?: { channels: { name: string; status: string; detail?: string }[] };
  aiServices?: { services: { name: string; configured: boolean }[] };
};

type OpsOverview = {
  overall: "unknown" | "ok" | "degraded" | "down";
  focus: string | null;
  checks: { label: string; state: "unknown" | "ok" | "degraded" | "down"; stale: boolean }[];
};

function Tile({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: "ok" | "warn" }) {
  const colors = useColors();
  return (
    <View style={styles.tile}>
      <View style={styles.tileHeader}>
        <AiOrb state={tone === "ok" ? "idle" : "error"} size={18} />
        <Text style={[styles.tileTitle, { color: colors.muted }]}>{title}</Text>
      </View>
      <Text style={[styles.tileValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.tileDetail, { color: colors.muted }]}>{detail}</Text>
    </View>
  );
}

function OpsWatchTile({ overview }: { overview: OpsOverview }) {
  const colors = useColors();
  const stateLabel = { ok: "GRÜN", degraded: "EINGESCHRÄNKT", down: "KRITISCH", unknown: "UNBEKANNT" }[overview.overall];
  const tone = overview.overall === "ok" ? "ok" : "warn";
  return (
    <View style={styles.opsTile}>
      <View style={styles.tileHeader}>
        <AiOrb state={tone === "ok" ? "idle" : "error"} size={18} />
        <Text style={[styles.tileTitle, { color: colors.muted }]}>Betriebswacht (Admin)</Text>
        <Text style={[styles.opsState, { color: tone === "ok" ? colors.tint : colors.warning }]}>{stateLabel}</Text>
      </View>
      <Text style={[styles.opsFocus, { color: colors.text }]}>{overview.focus ?? "Keine Messwerte vorhanden."}</Text>
      <View style={styles.checkList}>
        {overview.checks.map((check) => (
          <View key={check.label} style={styles.checkRow}>
            <View style={[styles.checkDot, { backgroundColor: check.state === "ok" ? colors.tint : colors.warning }]} />
            <Text style={[styles.checkLabel, { color: colors.muted }]}>{check.label}</Text>
            <Text style={[styles.checkValue, { color: colors.text }]}>
              {check.stale ? "veraltet" : check.state === "ok" ? "ok" : check.state === "unknown" ? "unbekannt" : "prüfen"}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const { data, isLoading, error } = trpc.dataHub.dashboard.useQuery();
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const isAdmin = accountQuery.data?.role === "admin";
  const opsQuery = trpc.ops.overview.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

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

  return (
    <ScreenContainer>
      <ParticleField seed={11} count={16} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AiOrb state={isLoading ? "thinking" : error ? "error" : "idle"} size={34} />
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: colors.text }]}>Dashboard</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {isLoading ? "CyberSarah synchronisiert Live-Daten …" : "Master-Agent · Live-Geschaeftsdaten"}
            </Text>
          </View>
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
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, padding: 16, paddingBottom: 32 },
  header: { alignItems: "center", flexDirection: "row", gap: 12, marginBottom: 8 },
  headerCopy: { flex: 1 },
  title: { fontSize: 22, fontWeight: "800" },
  subtitle: { fontSize: 12 },
  tile: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)", borderRadius: 14, borderWidth: 1, gap: 6, padding: 16 },
  tileHeader: { alignItems: "center", flexDirection: "row", gap: 8 },
  tileTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  tileValue: { fontSize: 20, fontWeight: "800" },
  tileDetail: { fontSize: 12 },
  opsTile: { backgroundColor: "rgba(0, 190, 160, 0.08)", borderColor: "rgba(0, 190, 160, 0.28)", borderRadius: 14, borderWidth: 1, gap: 10, padding: 16 },
  opsState: { fontSize: 10, fontWeight: "800", marginLeft: "auto" },
  opsFocus: { fontSize: 13, fontWeight: "700", lineHeight: 19 },
  checkList: { gap: 6 },
  checkRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  checkDot: { borderRadius: 4, height: 7, width: 7 },
  checkLabel: { flex: 1, fontSize: 11 },
  checkValue: { fontSize: 11, fontWeight: "700" },
});
