import { accentAlpha, glassOverlay, glassPalette, glassSurface } from "@/lib/design/future-glass";
/**
 * Sprint 156 — Aktivitaetskarte (NICHT „Neueste Aktivitaeten"): kompakte
 * System-/Nutzungsuebersicht der letzten 24 h. Nur echte Zaehlwerte;
 * ohne Daten: „Noch keine Daten" + leere Sparkline. Kein erfundener 247er-Wert.
 */
import { StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { createNeonStyles } from "./neon-dashboard-styles";
import { sparklineGeometry } from "@/lib/dashboard-view-model";

export function ActivitySummaryCard({
  count,
  changePercent,
  points,
}: {
  count: number | null;
  changePercent: number | null;
  points: number[];
}) {
  
  const geometry = sparklineGeometry(points);
  const hasData = typeof count === "number" && count > 0;
  return (
    <View style={[themeStyles.neonCard, themeStyles.neonCardBlue, styles.card]}>
      <View style={styles.header}>
        <View style={styles.iconWrap} accessibilityLabel="Aktivität">
          <IconSymbol size={16} name="chart.bar.fill" color={glassPalette.cyan} />
        </View>
        <View style={styles.titleWrap}>
          <Text style={themeStyles.sectionTitle}>Aktivität</Text>
          <Text style={themeStyles.mutedLabel}>LETZTE 24 STUNDEN</Text>
        </View>
        <View style={styles.valueWrap}>
          <Text style={styles.value} accessibilityLabel={hasData ? `${count} Aktivitäten` : "Noch keine Aktivitätsdaten"}>
            {count === null ? "—" : String(count)}
          </Text>
          {typeof changePercent === "number" ? (
            <Text style={[styles.change, { color: changePercent >= 0 ? glassPalette.green : glassPalette.red }]}>
              {changePercent >= 0 ? "+" : ""}{changePercent}% vs. Vortag
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.sparkArea} accessibilityLabel={hasData ? "Aktivitätsverlauf" : "Keine Aktivitätsdaten vorhanden"}>
        {geometry.length >= 2 ? (
          <View style={styles.sparkRow}>
            {geometry.map((point, index) => (
              <View key={index} style={[styles.sparkBar, { height: 4 + Math.round(point.y * 26) }]} />
            ))}
          </View>
        ) : (
          <View style={styles.sparkEmpty}>
            <Text style={styles.sparkEmptyText}>Noch keine Daten</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: glassSurface.textSecondary, alignItems: "center", justifyContent: "center", backgroundColor: glassOverlay.scrim },
  titleWrap: { flex: 1, gap: 2 },
  valueWrap: { alignItems: "flex-end" },
  value: { fontSize: 26, fontWeight: "900", color: glassSurface.textPrimary, fontVariant: ["tabular-nums"] },
  change: { fontSize: 11, fontWeight: "700" },
  sparkArea: { height: 40, justifyContent: "flex-end" },
  sparkRow: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 40 },
  sparkBar: { flex: 1, borderRadius: 2, backgroundColor: glassPalette.cyan, opacity: 0.85 },
  sparkEmpty: { height: 34, borderRadius: 8, borderWidth: 1, borderColor: accentAlpha("cyan", 0.14), borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  sparkEmptyText: { fontSize: 11, color: glassSurface.textSecondary },
});

const styles = createStyles();
const themeStyles = createNeonStyles();
