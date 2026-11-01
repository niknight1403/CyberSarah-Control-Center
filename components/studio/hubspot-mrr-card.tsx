/**
 * Admin-Karte „Umsatz aus HubSpot": MRR, offene Pipeline, Zuweisung nach
 * Owner und Verlauf aus echten Deals. Server-gated ueber den admin-geschuetzten
 * revenueIntegrations.hubspotMrr-Endpunkt; die Karte rechnet nichts selbst.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { accentAlpha, glassDepth, glassPalette, glassSurface } from "@/lib/design/future-glass";

type OwnerShare = { ownerId: string; ownerName: string; mrr: number; dealCount: number };
type StageShare = { stageId: string; label: string; won: boolean; value: number; dealCount: number };
type TrendBucket = { month: string; wonValue: number; dealCount: number };

type MrrSnapshot = {
  currency: string;
  mrr: number;
  mrrDeals: number;
  newMrrWindow: number;
  newMrrDeals: number;
  openPipelineValue: number;
  openDeals: number;
  weightedPipelineValue: number;
  byOwner: OwnerShare[];
  byStage: StageShare[];
  trend: TrendBucket[];
  coverage: {
    dealsRead: number;
    wonDeals: number;
    withoutAmount: number;
    withoutOwner: number;
    withoutCloseDate: number;
    unknownStage: number;
  };
  assumptions: string[];
  windowDays: number;
  fetchedAt: string;
};

type MrrResponse =
  | { ok: true; snapshot: MrrSnapshot; warnings: string[] }
  | { ok: false; reason: string; code: string };

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toFixed(0)} ${currency}`;
  }
}

function monthLabel(month: string): string {
  const [year, index] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(index) - 1, 1));
  return date.toLocaleDateString("de-DE", { month: "short" });
}

function MetricRow({ label, value, tone }: { label: string; value: string; tone?: "accent" | "muted" }) {
  const colors = useColors();
  const color = tone === "accent" ? glassPalette.cyan : tone === "muted" ? colors.muted : colors.text;
  return (
    <View style={styles.metricRow}>
      <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

export function HubspotMrrCard({ isAdmin }: { isAdmin: boolean }) {
  const colors = useColors();
  const query = trpc.revenueIntegrations.hubspotMrr.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
    refetchInterval: isAdmin ? 60_000 : false,
  });
  const data = query.data as MrrResponse | undefined;
  const snapshot = data?.ok ? data.snapshot : null;
  const peak = snapshot ? Math.max(...snapshot.trend.map((bucket) => bucket.wonValue), 1) : 1;

  return (
    <View style={[styles.card, { backgroundColor: glassDepth.glass, borderColor: glassSurface.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Umsatz aus HubSpot</Text>
        {snapshot ? (
          <View style={[styles.badge, { borderColor: accentAlpha("cyan", 0.4) }]}>
            <Text style={[styles.badgeText, { color: glassPalette.cyan }]}>live</Text>
          </View>
        ) : null}
      </View>

      {!isAdmin ? (
        <Text style={[styles.hint, { color: colors.muted }]}>Nur für Administratoren sichtbar.</Text>
      ) : query.isLoading ? (
        <Text style={[styles.hint, { color: colors.muted }]}>Kennzahlen werden geladen…</Text>
      ) : query.isError ? (
        <View style={styles.errorState}>
          <Text style={[styles.hint, { color: colors.muted }]}>HubSpot-Abfrage fehlgeschlagen.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="MRR erneut laden"
            onPress={() => void query.refetch()}
            style={[styles.retryButton, { borderColor: glassSurface.border }]}
          >
            <Text style={[styles.retryText, { color: colors.text }]}>Erneut laden</Text>
          </Pressable>
        </View>
      ) : !data?.ok ? (
        <View style={styles.errorState}>
          <Text style={[styles.hint, { color: colors.muted }]}>{data?.reason ?? "Keine Daten."}</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Prüfe `npm run hubspot:check` auf dem Server und den Service Key.
          </Text>
        </View>
      ) : snapshot ? (
        <View style={{ gap: 12 }}>
          <View>
            <Text style={[styles.heroValue, { color: colors.text }]}>
              {formatMoney(snapshot.mrr, snapshot.currency)}
            </Text>
            <Text style={[styles.hint, { color: colors.muted }]}>
              MRR aus {snapshot.mrrDeals} gewonnenen Deals · zuletzt {snapshot.windowDays} Tage:{" "}
              {formatMoney(snapshot.newMrrWindow, snapshot.currency)}
            </Text>
          </View>

          <View>
            <MetricRow
              label="Offene Pipeline"
              value={`${formatMoney(snapshot.openPipelineValue, snapshot.currency)} (${snapshot.openDeals} Deals)`}
            />
            <MetricRow
              label="Gewichtet nach Stage-Chance"
              value={formatMoney(snapshot.weightedPipelineValue, snapshot.currency)}
              tone="accent"
            />
            <MetricRow
              label="Deals gelesen"
              value={`${snapshot.coverage.dealsRead} · davon gewonnen ${snapshot.coverage.wonDeals}`}
              tone="muted"
            />
          </View>

          {snapshot.coverage.dealsRead === 0 ? (
            <Text style={[styles.hint, { color: colors.muted }]}>
              Im Portal sind noch keine Deals angelegt. Sobald welche existieren, füllen sich MRR und Verlauf.
            </Text>
          ) : null}

          {snapshot.trend.length > 0 ? (
            <View>
              <Text style={[styles.subTitle, { color: colors.muted }]}>Gewonnener Umsatz je Monat</Text>
              <View style={styles.trendRow}>
                {snapshot.trend.map((bucket) => (
                  <View key={bucket.month} style={styles.trendColumn}>
                    <View style={styles.trendTrack}>
                      <View
                        style={[
                          styles.trendBar,
                          {
                            backgroundColor: glassPalette.cyan,
                            height: Math.max(Math.round((bucket.wonValue / peak) * 56), bucket.wonValue > 0 ? 4 : 2),
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.trendLabel, { color: colors.muted }]}>{monthLabel(bucket.month)}</Text>
                    <Text style={[styles.trendValue, { color: colors.text }]}>
                      {bucket.wonValue > 0 ? formatMoney(bucket.wonValue, snapshot.currency) : "—"}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {snapshot.byOwner.length > 0 ? (
            <View>
              <Text style={[styles.subTitle, { color: colors.muted }]}>MRR nach Owner</Text>
              {snapshot.byOwner.slice(0, 5).map((owner) => (
                <View key={owner.ownerId || owner.ownerName} style={styles.shareRow}>
                  <Text style={[styles.shareLabel, { color: colors.text }]} numberOfLines={1}>
                    {owner.ownerName}
                  </Text>
                  <Text style={[styles.shareValue, { color: glassPalette.cyan }]}>
                    {formatMoney(owner.mrr, snapshot.currency)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {snapshot.byStage.length > 0 ? (
            <View>
              <Text style={[styles.subTitle, { color: colors.muted }]}>Deals nach Stage</Text>
              {snapshot.byStage.slice(0, 6).map((stage) => (
                <View key={stage.stageId} style={styles.shareRow}>
                  <Text style={[styles.shareLabel, { color: colors.text }]} numberOfLines={1}>
                    {stage.won ? "✓ " : ""}
                    {stage.label}
                  </Text>
                  <Text style={[styles.shareValue, { color: stage.won ? accentAlpha("green", 0.5) : colors.muted }]}>
                    {stage.dealCount} · {formatMoney(stage.value, snapshot.currency)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {[...snapshot.assumptions, ...(data.warnings ?? [])].map((note) => (
            <Text key={note} style={[styles.hint, { color: colors.muted }]}>
              · {note}
            </Text>
          ))}
          <Text style={[styles.hint, { color: colors.muted }]}>
            Quelle: HubSpot, Stand {new Date(snapshot.fetchedAt).toLocaleString("de-DE")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, gap: 10, padding: 14 },
  headerRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  cardTitle: { fontSize: 15, fontWeight: "800" },
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  heroValue: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  subTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginBottom: 6, textTransform: "uppercase" },
  hint: { fontSize: 12 },
  metricRow: { borderBottomWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  metricLabel: { flex: 1, fontSize: 12 },
  metricValue: { fontSize: 12, fontWeight: "700" },
  trendRow: { alignItems: "flex-end", flexDirection: "row", gap: 6 },
  trendColumn: { alignItems: "center", flex: 1, gap: 3 },
  trendTrack: { alignItems: "center", height: 60, justifyContent: "flex-end", width: "100%" },
  trendBar: { borderRadius: 3, width: "70%" },
  trendLabel: { fontSize: 10 },
  trendValue: { fontSize: 9, fontWeight: "600" },
  shareRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  shareLabel: { flex: 1, fontSize: 12 },
  shareValue: { fontSize: 12, fontWeight: "700" },
  errorState: { gap: 8 },
  retryButton: { alignItems: "center", borderRadius: 10, borderWidth: 1, paddingVertical: 8 },
  retryText: { fontSize: 12, fontWeight: "700" },
});
