/**
 * Sprint 354 — AgentLoopStreamPanel: Live-Visualisierung der Agentic-Loop-
 * Telemetrie (Sprint 353 Backend) im Future-Glass-Design.
 * Zeigt Verbindungsstatus, Iterationszaehler, Konfidenz-Balken und den
 * Echtzeit-Feedback-Trail (Reflexionsfehler, Validierungen, Terminal).
 * Alles Durchgehende kommt aus dem deduplizierten View-Model des Hooks —
 * die Komponente rendert nur, sie entscheidet nichts.
 */
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AiCore } from "@/components/glass/ai-core";
import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { useAgentLoopStream, type AgentLoopConnectionState } from "@/hooks/use-agent-loop-stream";
import type { AgentLoopPhase } from "@/lib/agent-loop-stream-logic";
import { glassPalette, glassSpacing, glassSurface, glassType } from "@/lib/design/future-glass";

const CONNECTION_LABEL: Record<AgentLoopConnectionState, string> = {
  idle: "STREAM BEREIT",
  connecting: "VERBINDET…",
  connected: "LIVE",
  reconnecting: "RECONNECT…",
  disconnected: "GETRENNT",
};

const CONNECTION_ACCENT: Record<AgentLoopConnectionState, "cyan" | "blue" | "red" | "magenta"> = {
  idle: "blue",
  connecting: "blue",
  connected: "cyan",
  reconnecting: "magenta",
  disconnected: "red",
};

const PHASE_ACCENT: Record<AgentLoopPhase, "cyan" | "blue" | "magenta" | "green" | "red"> = {
  idle: "blue",
  thinking: "blue",
  reflecting: "magenta",
  validating: "cyan",
  success: "green",
  failed: "red",
};

const PHASE_CORE: Record<AgentLoopPhase, "idle" | "thinking" | "processing" | "executing"> = {
  idle: "idle",
  thinking: "thinking",
  reflecting: "processing",
  validating: "executing",
  success: "idle",
  failed: "idle",
};

const TRAIL_COLOR: Record<string, string> = {
  info: glassPalette.blue,
  error: glassPalette.red,
  success: glassPalette.green,
  terminal: glassPalette.magenta,
};

type Props = {
  sessionId: string;
  enabled?: boolean;
};

export function AgentLoopStreamPanel({ sessionId, enabled = true }: Props) {
  const { connectionState, viewModel, attempts, reconnect } = useAgentLoopStream({ sessionId, enabled });
  const styles = useMemo(() => createStyles(), []);
  const [trailOpen, setTrailOpen] = useState(true);

  const dropped = connectionState === "disconnected" || connectionState === "reconnecting";

  return (
    <GlassCard accent={PHASE_ACCENT[viewModel.phase]} glow={viewModel.terminal ? 1 : 2} style={styles.card}>
      <View style={styles.headerRow}>
        <AiCore state={PHASE_CORE[viewModel.phase]} size={34} />
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CYBERSARAH · AGENTIC LOOP TELEMETRIE</Text>
          <Text style={styles.title}>{viewModel.statusLabel}</Text>
          <Text style={styles.iteration}>{viewModel.iterationLabel}</Text>
        </View>
        <View style={styles.chips}>
          <StatusChip label={CONNECTION_LABEL[connectionState]} accent={CONNECTION_ACCENT[connectionState]} live={connectionState === "connected"} />
        </View>
      </View>

      {/* Konfidenz-Balken: nur waehrend des Laufs sichtbar, Terminal friert ein. */}
      <View style={styles.confidenceWrap}>
        <View style={styles.confidenceTrack}>
          <View
            style={[
              styles.confidenceFill,
              {
                width: `${Math.max(0, Math.min(100, viewModel.confidencePct))}%`,
                backgroundColor: viewModel.phase === "failed" ? glassPalette.red : glassPalette.cyan,
              },
            ]}
          />
        </View>
        <Text style={styles.confidenceLabel}>{viewModel.confidencePct} % KONFIDENZ</Text>
      </View>

      {dropped && (
        <View style={styles.dropBanner}>
          {connectionState === "reconnecting" ? (
            <ActivityIndicator size="small" color={glassPalette.cyan} />
          ) : null}
          <Text style={styles.dropText}>
            Verbindung unterbrochen{attempts > 1 ? ` · Versuch ${attempts}` : ""} — automatischer Wiederaufbau mit Lueckenauffuellung.
          </Text>
          <Pressable onPress={reconnect} style={styles.retryButton}>
            <Text style={styles.retryLabel}>NEU VERBINDEN</Text>
          </Pressable>
        </View>
      )}

      <Pressable onPress={() => setTrailOpen((open) => !open)} style={styles.trailToggle}>
        <Text style={styles.trailToggleLabel}>{trailOpen ? "TRAIL EINKLAPPEN" : "TRAIL AUSKLAPPEN"} ({viewModel.trail.length})</Text>
      </Pressable>
      {trailOpen && (
        <ScrollView style={styles.trail}>
          {viewModel.trail.length === 0 ? (
            <Text style={styles.trailEmpty}>Noch keine Loop-Events — starte einen Agenten-Loop, um die Live-Telemetrie zu sehen.</Text>
          ) : (
            viewModel.trail.map((entry) => (
              <View key={entry.id} style={styles.trailEntry}>
                <View style={[styles.trailDot, { backgroundColor: TRAIL_COLOR[entry.kind] ?? glassPalette.blue }]} />
                <View style={styles.trailCopy}>
                  <Text style={styles.trailKind}>{entry.label}</Text>
                  <Text style={styles.trailDetail}>{entry.detail}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </GlassCard>
  );
}

function createStyles() {
  return StyleSheet.create({
    card: {
      padding: glassSpacing.lg,
      gap: glassSpacing.md,
    } as const,
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: glassSpacing.md,
    } as const,
    headerCopy: {
      flex: 1,
      gap: 2,
    } as const,
    eyebrow: {
      ...glassType.label,
      color: glassPalette.cyan,
    } as const,
    title: {
      ...glassType.title,
      color: glassSurface.textPrimary,
    } as const,
    iteration: {
      ...glassType.caption,
      color: glassSurface.textMuted,
    } as const,
    chips: {
      alignItems: "flex-end",
    } as const,
    confidenceWrap: {
      gap: glassSpacing.xs,
    } as const,
    confidenceTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: glassSurface.borderStrong,
      overflow: "hidden",
    } as const,
    confidenceFill: {
      height: 6,
      borderRadius: 3,
    } as const,
    confidenceLabel: {
      ...glassType.label,
      color: glassSurface.textMuted,
    } as const,
    dropBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: glassSpacing.sm,
      paddingVertical: glassSpacing.sm,
      paddingHorizontal: glassSpacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: glassPalette.red,
      backgroundColor: "rgba(255, 0, 127, 0.08)",
    } as const,
    dropText: {
      ...glassType.caption,
      flex: 1,
      color: glassSurface.textPrimary,
    } as const,
    retryButton: {
      paddingVertical: 6,
      paddingHorizontal: glassSpacing.md,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: glassPalette.cyan,
    } as const,
    retryLabel: {
      ...glassType.label,
      color: glassPalette.cyan,
    } as const,
    trailToggle: {
      paddingVertical: glassSpacing.xs,
    } as const,
    trailToggleLabel: {
      ...glassType.label,
      color: glassPalette.blue,
    } as const,
    trail: {
      maxHeight: 220,
    } as const,
    trailEmpty: {
      ...glassType.caption,
      color: glassSurface.textMuted,
    } as const,
    trailEntry: {
      flexDirection: "row",
      gap: glassSpacing.sm,
      paddingVertical: glassSpacing.xs,
    } as const,
    trailDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 4,
    } as const,
    trailCopy: {
      flex: 1,
      gap: 1,
    } as const,
    trailKind: {
      ...glassType.label,
      color: glassSurface.textPrimary,
    } as const,
    trailDetail: {
      ...glassType.caption,
      color: glassSurface.textMuted,
    } as const,
  });
}
