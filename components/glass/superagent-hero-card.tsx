/**
 * SuperagentHeroCard (Sprint 168) — die visuell staerkste Karte des
 * Dashboards (Referenz §13): AI-Core mit Ringen/Partikeln, LIVE-Chip nur
 * bei ECHTEM aktiven Status, "Öffnen"-CTA. Keine erfundenen Zustaende.
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { AiCore } from "@/components/glass/ai-core";
import { GlassCard, GlowButton, StatusChip } from "@/components/glass/glass-primitives";
import { superAgentStatusCopy, type SuperAgentStatus } from "@/lib/dashboard-view-model";
import { useGlassTheme, type RuntimeGlassTheme } from "@/lib/design/future-glass-runtime";
import { type AiCoreState, type GlassAccent } from "@/lib/design/future-glass";

const STATUS_TO_ACCENT: Record<SuperAgentStatus, GlassAccent> = {
  active: "green",
  ready: "cyan",
  paused: "amber",
  unconfigured: "purple",
  offline: "red",
  error: "red",
};

const STATUS_TO_CORE: Record<SuperAgentStatus, AiCoreState> = {
  active: "executing",
  ready: "idle",
  paused: "idle",
  unconfigured: "idle",
  offline: "warning",
  error: "error",
};

export function SuperagentHeroCard({
  status,
  name,
  detail,
  onRetry,
}: {
  status: SuperAgentStatus;
  name: string;
  detail: string;
  onRetry?: () => void;
}) {
  const glass = useGlassTheme();
  const styles = useMemo(() => createStyles(glass), [glass]);
  const accent = STATUS_TO_ACCENT[status];
  const isLive = status === "active";
  const canOpen = status !== "offline";

  return (
    <GlassCard accent={accent} glow={isLive ? 2 : 1} elevated style={styles.card}>
      <View style={styles.row}>
        <AiCore size={56} state={STATUS_TO_CORE[status]} />
        <View style={styles.textWrap}>
          <Text style={styles.title}>{name.toUpperCase()}</Text>
          <Text style={styles.detail} numberOfLines={2}>{detail}</Text>
          <StatusChip label={isLive ? "LIVE · AKTIV" : superAgentStatusCopy[status].toUpperCase()} accent={accent} live={isLive} />
        </View>
      </View>
      <GlowButton
        label={status === "offline" ? "Erneut versuchen" : "Öffnen"}
        accent={accent}
        variant="primary"
        onPress={() => (status === "offline" && onRetry ? onRetry() : router.push("/superagent" as never))}
        disabled={!canOpen && !onRetry}
      />
    </GlassCard>
  );
}

const createStyles = (glass: RuntimeGlassTheme) => StyleSheet.create({
  card: { gap: glass.glassSpacing.lg },
  row: { flexDirection: "row", gap: glass.glassSpacing.lg, alignItems: "center" },
  textWrap: { flex: 1, gap: 6 },
  title: { ...glass.glassType.headline, color: glass.glassSurface.textPrimary, fontSize: 17, letterSpacing: 1 },
  detail: { fontSize: 12, color: glass.glassSurface.textSecondary, lineHeight: 16 },
});
