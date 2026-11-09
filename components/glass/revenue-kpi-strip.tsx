/**
 * RevenueKpiStrip — Umsatzkennzahlen im Command Dashboard (Sprint 387).
 *
 * Zeigt ausschliesslich belegte Werte: wiederkehrender Umsatz (MRR/ARR) aus
 * Stripe, belegte Verkaeufe der letzten 30 Tage und den Kundenstand aus der
 * eigenen Datenbank. Fehlt eine Quelle, steht dort "—" plus eine Fusszeile
 * mit dem Grund — kein Schaetzwert, keine Hochrechnung.
 */
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MetricTile } from "@/components/glass/metric-tile";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
import {
  formatCount,
  formatEuroCents,
  sourceLabel,
  type RevenueKpiSnapshot,
} from "@/lib/revenue-kpi-logic";

type Props = {
  snapshot: RevenueKpiSnapshot | null;
  loading: boolean;
  failed: boolean;
  onRetry?: () => void;
};

export function RevenueKpiStrip({ snapshot, loading, failed, onRetry }: Props) {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);

  const note = loading
    ? "Kennzahlen werden geladen …"
    : failed
      ? "Kennzahlen konnten nicht geladen werden."
      : snapshot
        ? [sourceLabel(snapshot), ...snapshot.gaps].join(" · ")
        : "Keine Umsatzdaten verfügbar.";

  return (
    <View style={styles.wrap} accessibilityLabel="Umsatzkennzahlen">
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>UMSATZ</Text>
          <Text style={styles.title}>Belegte Zahlen</Text>
        </View>
        {failed && onRetry ? (
          <Pressable onPress={onRetry} accessibilityRole="button" style={styles.retry}>
            <Text style={styles.retryText}>Erneut laden</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.row}>
        <MetricTile
          icon="eurosign.circle.fill"
          label="UMSATZ 30 TAGE"
          value={formatEuroCents(snapshot?.revenue30dCents ?? null)}
          accent="green"
          statusNote={snapshot?.paidOrders30d === null || snapshot === null ? "keine Buchungen" : `${formatCount(snapshot.paidOrders30d)} Bestellungen`}
        />
        <MetricTile
          icon="arrow.triangle.2.circlepath"
          label="MRR"
          value={formatEuroCents(snapshot?.mrrCents ?? null)}
          accent="cyan"
          statusNote={snapshot === null ? "keine Quelle" : `${formatCount(snapshot.activeSubscriptions)} aktive Abos`}
        />
        <MetricTile
          icon="calendar"
          label="ARR"
          value={formatEuroCents(snapshot?.arrCents ?? null)}
          accent="blue"
          statusNote={snapshot && snapshot.pastDueSubscriptions ? `${formatCount(snapshot.pastDueSubscriptions)} in Verzug` : undefined}
        />
        <MetricTile
          icon="person.2.fill"
          label="KUNDEN"
          value={formatCount(snapshot?.activeCustomers ?? null)}
          accent="magenta"
          statusNote={snapshot?.averageOrderCents ? `Ø ${formatEuroCents(snapshot.averageOrderCents)}` : "Abo-Kunden"}
        />
      </View>

      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const createStyles = (glass: RuntimeGlassTheme) =>
  StyleSheet.create({
    wrap: { gap: glass.glassSpacing.sm },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 2 },
    headerText: { gap: 2 },
    eyebrow: { ...glass.glassType.label, color: glass.glassPalette.green },
    title: { ...glass.glassType.title, color: glass.glassSurface.textPrimary, fontSize: 15 },
    row: { flexDirection: "row", flexWrap: "wrap", gap: glass.glassSpacing.sm },
    note: { fontSize: 11, color: glass.glassSurface.textMuted, paddingHorizontal: 2 },
    retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: glass.glassSurface.border },
    retryText: { color: glass.glassPalette.cyan, fontSize: 12, fontWeight: "700" },
  });
