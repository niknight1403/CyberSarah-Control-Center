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
  analytics: { modules: string[]; note: string };
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

export default function DashboardScreen() {
  const colors = useColors();
  const { data, isLoading, error } = trpc.dataHub.dashboard.useQuery();

  const revenue = data?.revenue;
  const trading = data?.trading;
  const cryptoLine = (trading?.tickers ?? [])
    .map((ticker) => `${ticker.symbol.replace("USDT", "")} ${ticker.priceUsd.toLocaleString("de-DE", { maximumFractionDigits: 0 })}$`)
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
          title="Analytics"
          tone="ok"
          value={`${data?.analytics?.modules?.length ?? 0} Module`}
          detail={data?.analytics?.note ?? "System-Status der Analyse-Integrationen."}
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
});
