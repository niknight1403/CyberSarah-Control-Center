/**
 * Sprint 350 — Umsatzmöglichkeiten im Loop Engineering.
 *
 * Der Revenue-Autopilot priorisiert reale Signale (Funnel, Checkout, Abos,
 * Cross-Sell, Expansion) und liefert je Chance Metrik, Baseline, Ziel und
 * einen Experimentplan. Bisher waren diese Chancen nur im Autopilot sichtbar;
 * hier werden sie dort angeboten, wo aus ihnen eine messbare Schleife wird.
 *
 * Ehrlichkeits-Grenzen: Baselines und Ziele sind interne Optimierungsziele,
 * keine Prognose. Die Übernahme legt einen Entwurf an — nichts startet, nichts
 * wird veröffentlicht.
 */
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";
import { revenueHubLabel } from "@/lib/draft-engine-logic";
import { trpc } from "@/lib/trpc";
import type { RevenueOpportunity } from "@/lib/revenue-autopilot-logic";

type LoopOpportunitiesCardProps = {
  /** Übernimmt die Chance als Schleifen-Entwurf; die Freigabe bleibt beim Menschen. */
  onAdopt: (opportunity: RevenueOpportunity) => Promise<{ ok: boolean; reason: string }>;
  /** Optional auf einen Bereich begrenzen. */
  hub?: RevenueOpportunity["hub"];
};

const EVIDENCE_LABEL: Record<RevenueOpportunity["evidence"], string> = {
  high: "Belege: hoch",
  medium: "Belege: mittel",
  low: "Belege: niedrig",
};

export function LoopOpportunitiesCard({ onAdopt, hub }: LoopOpportunitiesCardProps) {
  const styles = useMemo(() => createStyles(), []);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ key: string; text: string } | null>(null);

  const meQuery = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 });
  const isAdmin = meQuery.data?.role === "admin";
  const overview = trpc.controlCenterAutopilot.overview.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
    staleTime: 60_000,
  });

  const opportunities = useMemo(() => {
    const all = overview.data?.opportunities ?? [];
    const filtered = hub ? all.filter((item) => item.hub === hub) : all;
    return [...filtered].sort((a, b) => b.score - a.score);
  }, [hub, overview.data?.opportunities]);

  const adopt = async (opportunity: RevenueOpportunity) => {
    setBusyKey(opportunity.key);
    setNotice(null);
    const result = await onAdopt(opportunity);
    setBusyKey(null);
    if (!result.ok) setNotice({ key: opportunity.key, text: result.reason });
  };

  return (
    <GlassCard accent="blue" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Umsatzmöglichkeiten</Text>
          <Text style={styles.subtitle}>
            Priorisiert aus echten Signalen des Revenue-Autopilots. Erst deine Übernahme macht daraus eine Schleife — Baseline und Ziel sind interne
            Optimierungsziele, keine Prognose.
          </Text>
        </View>
        {isAdmin && !overview.isLoading && !overview.isError ? (
          <StatusChip label={`${opportunities.length} offen`} accent="blue" />
        ) : null}
      </View>

      {meQuery.isLoading ? (
        <Text style={styles.emptyNote}>Rechte werden geprüft …</Text>
      ) : !isAdmin ? (
        <Text style={styles.emptyNote}>
          Umsatzmöglichkeiten kommen aus dem Revenue-Autopilot und sind nur für Administratoren sichtbar.
        </Text>
      ) : overview.isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={glassPalette.blue} />
          <Text style={styles.emptyNote}>Signale werden ausgewertet …</Text>
        </View>
      ) : overview.isError ? (
        <Text style={styles.errorNote}>Umsatzmöglichkeiten nicht erreichbar: {overview.error.message}</Text>
      ) : opportunities.length === 0 ? (
        <Text style={styles.emptyNote}>
          Aktuell keine Chance über der Schwelle. Fehlen Messpunkte, bleibt das hier leer statt mit geschätzten Zahlen gefüllt zu werden.
        </Text>
      ) : (
        opportunities.slice(0, 6).map((opportunity) => (
          <View key={opportunity.key} style={styles.row}>
            <View style={styles.rowHeader}>
              <StatusChip label={revenueHubLabel(opportunity.hub)} accent="blue" />
              <Text style={styles.score}>{opportunity.score}/100</Text>
            </View>
            <Text style={styles.rowTitle}>{opportunity.title}</Text>
            <Text style={styles.meta}>
              {EVIDENCE_LABEL[opportunity.evidence]} · {opportunity.metric}
            </Text>
            <Text style={styles.meta}>
              {opportunity.baseline} → {opportunity.target}
            </Text>
            <Text style={styles.body} numberOfLines={3}>{opportunity.rationale}</Text>
            {notice?.key === opportunity.key ? <Text style={styles.errorNote}>{notice.text}</Text> : null}
            <Pressable
              accessibilityLabel={`Umsatzmöglichkeit ${opportunity.title} in Loop Engineering übernehmen`}
              disabled={busyKey === opportunity.key}
              onPress={() => void adopt(opportunity)}
              style={[styles.adoptButton, busyKey === opportunity.key && { opacity: 0.5 }]}
            >
              <Text style={styles.adoptText}>
                {busyKey === opportunity.key ? "…" : "Als Schleife übernehmen"}
              </Text>
            </Pressable>
          </View>
        ))
      )}
    </GlassCard>
  );
}

function createStyles() {
  return StyleSheet.create({
    card: { gap: 12 },
    header: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
    headerCopy: { flex: 1 },
    title: { color: glassSurface.textPrimary, fontSize: 17, fontWeight: "900" },
    subtitle: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 4 },
    loadingRow: { alignItems: "center", flexDirection: "row", gap: 10 },
    emptyNote: { color: glassSurface.textMuted, fontSize: 11, lineHeight: 16 },
    errorNote: { color: glassPalette.amber, fontSize: 11, lineHeight: 16 },
    row: { backgroundColor: `${glassSurface.border}44`, borderColor: glassSurface.border, borderRadius: 14, borderWidth: 1, gap: 8, padding: 12 },
    rowHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
    score: { color: glassSurface.textSecondary, fontSize: 11, fontWeight: "800" },
    rowTitle: { color: glassSurface.textPrimary, fontSize: 14, fontWeight: "900" },
    meta: { color: glassSurface.textMuted, fontSize: 10, lineHeight: 15 },
    body: { color: glassSurface.textSecondary, fontSize: 12, lineHeight: 17 },
    adoptButton: { alignItems: "center", borderColor: glassPalette.blue, borderRadius: 12, borderWidth: 1, paddingVertical: 9 },
    adoptText: { color: glassPalette.blue, fontSize: 12, fontWeight: "800" },
  });
}
