import { useNow } from "@/hooks/use-now";
import { useColors } from "@/hooks/use-colors";
import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { trpc } from "@/lib/trpc";
import { DrawerBodyText, DrawerCard, DrawerCardTitle, DrawerScreen } from "@/components/responsive/drawer-screen";

/**
 * Sprint 132 — "Daten"-Tab (Drawer): Live-Geschaeftsdaten des Daten-Hubs.
 * Revenue (Stripe), Trading (Binance) und Systemstatus — derselbe
 * protected-Snapshot, den auch das Dashboard nutzt, hier als flache,
 * gut lesbare Uebersicht.
 */
export default function DataScreen() {
  const colors = useColors();
  // Sprint 172: Fallback-Zeit ueber die Tick-Uhr statt Date.now() im Render.
  const nowMs = useNow();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dashboardQuery = trpc.dataHub.dashboard.useQuery(undefined, { retry: false, refetchInterval: 60_000 });

  const revenue = dashboardQuery.data?.revenue;
  const trading = dashboardQuery.data?.trading;

  return (
    <DrawerScreen kicker="DATEN-HUB" title="Daten">
      {dashboardQuery.isLoading ? (
        <View style={styles.centerRow}><ActivityIndicator color={colors.tint} /><Text style={styles.muted}>Live-Daten werden synchronisiert …</Text></View>
      ) : dashboardQuery.isError ? (
        <DrawerCard accent={`${colors.tint}66`}>
          <DrawerCardTitle>Daten-Hub nicht verfügbar</DrawerCardTitle>
          <DrawerBodyText>Melde dich an, um die Live-Geschäftsdaten zu sehen — derselbe Schutz wie im Dashboard.</DrawerBodyText>
        </DrawerCard>
      ) : (
        <>
          <DrawerCard accent={`${colors.tint}55`}>
            <DrawerCardTitle>Revenue (Stripe)</DrawerCardTitle>
            {revenue && revenue.status === "ok" ? (
              <>
                <Text style={styles.value}>{revenue.totalBalanceEur.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</Text>
                <Text style={styles.meta}>Zahlungen (24 h): {revenue.revenueLast24hEur.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</Text>
                <Text style={styles.meta}>Aktive Abonnements: {revenue.activeSubscriptions}</Text>
              </>
            ) : (
              <DrawerBodyText>{revenue?.status === "not-configured" ? "Stripe ist nicht konfiguriert (STRIPE_SECRET_KEY fehlt) — der Superagent kann das beim Deploy nachziehen." : "Revenue-Daten derzeit nicht abrufbar."}</DrawerBodyText>
            )}
          </DrawerCard>

          <DrawerCard accent={`${colors.success}55`}>
            <DrawerCardTitle>Trading (Binance, öffentlich)</DrawerCardTitle>
            {trading && trading.status === "ok" && trading.tickers && trading.tickers.length > 0 ? (
              trading.tickers.slice(0, 3).map((ticker) => (
                <View key={ticker.symbol} style={styles.tickerRow}>
                  <Text style={styles.tickerSymbol}>{ticker.symbol}</Text>
                  <Text style={[styles.tickerPrice, ticker.changePercent < 0 && { color: colors.tint }]}>
                    ${ticker.priceUsd.toLocaleString("de-DE")} ({ticker.changePercent >= 0 ? "+" : ""}{ticker.changePercent.toFixed(2)} %)
                  </Text>
                </View>
              ))
            ) : (
              <DrawerBodyText>Keine Kursdaten abrufbar — der Retry-Backoff des Daten-Hubs reagiert automatisch.</DrawerBodyText>
            )}
          </DrawerCard>

          <DrawerCard accent={`${colors.tint}55`}>
            <DrawerCardTitle>System</DrawerCardTitle>
            <Text style={styles.meta}>Snapshot von {new Date(dashboardQuery.data?.system.generatedAt ?? nowMs).toLocaleTimeString("de-DE")}</Text>
            {(dashboardQuery.data?.system.recentErrors ?? []).length === 0 ? (
              <Text style={[styles.meta, { color: colors.success }]}>Keine Fehler in den letzten Logs.</Text>
            ) : (
              (dashboardQuery.data?.system.recentErrors ?? []).map((message, index) => (
                <Text key={index} style={[styles.meta, { color: colors.tint }]} numberOfLines={2}>• {message}</Text>
              ))
            )}
          </DrawerCard>
        </>
      )}
    </DrawerScreen>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    centerRow: { alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 12 },
    muted: { color: colors.icon, fontSize: 12 },
    value: { color: colors.text, fontSize: 22, fontWeight: "900", marginBottom: 4 },
    meta: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3 },
    tickerRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
    tickerSymbol: { color: colors.text, fontSize: 13, fontWeight: "800" },
    tickerPrice: { color: colors.success, fontSize: 13, fontWeight: "700" },
  });
}
