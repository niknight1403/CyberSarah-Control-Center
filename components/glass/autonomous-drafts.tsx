/**
 * Sprint 346 — Autonome Drafts: die Freigabe-Karte fuer die Entwuerfe der
 * autonomen Draft-Engine. Zeigt pending-Entwuerfe einer Art (oder mehrerer)
 * und die zwei ehrlichen Entscheidungen: freigeben oder ablehnen.
 *
 * Freigabe heisst hier NUR "vom Menschen geprueft" — nichts wird von dieser
 * Karte veroeffentlicht, aktiviert oder versendet. Ideen-Freigabe nimmt
 * die Idee ueber den onAdoptIdea-Rueckruf in die lokale Inbox auf.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { GlassCard, StatusChip } from "@/components/glass/glass-primitives";
import { trpc } from "@/lib/trpc";
import {
  draftApprovalHint,
  draftKindLabel,
  type ContentDraftPayload,
  type DraftKind,
  type DraftRow,
  type IdeaDraftPayload,
  revenueDraftHub,
  revenueHubLabel,
  type RevenueHub,
  type RevenueLoopDraftPayload,
} from "@/lib/draft-engine-logic";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";

type DraftsCardProps = {
  kinds: readonly DraftKind[];
  accent?: "cyan" | "green" | "purple" | "blue";
  /** Nur fuer kind "idea": legt die freigegebene Idee in die Inbox. */
  onAdoptIdea?: (payload: IdeaDraftPayload) => Promise<{ ok: boolean; reason: string }>;
  /** Optional: Revenue-Loop-Entwuerfe auf konkrete Revenue-Hubs begrenzen. */
  revenueHubs?: readonly RevenueHub[];
  /** Leere Hub-Queue bei Admin automatisch durch die Draft-Engine auffuellen. */
  autoGenerate?: boolean;
};

function describePayload(row: DraftRow): string {
  if (row.kind === "content") {
    const payload = row.payload as ContentDraftPayload;
    return `${payload.personaId} · ${payload.platform}\n\n${payload.content}`;
  }
  if (row.kind === "revenue-loop") {
    const payload = row.payload as RevenueLoopDraftPayload;
    const autopilot = payload.autopilotKey ? `Autopilot · Score ${payload.score ?? "—"}/100\n` : "";
    const baseline = payload.baseline || payload.target ? `\nBaseline/Ziel: ${payload.baseline ?? "—"} → ${payload.target ?? "—"}` : "";
    return `${autopilot}${revenueHubLabel(revenueDraftHub(payload))} · ${payload.hypothesis}\n\nStufen: ${payload.stages.join(" → ")}\nMetrik: ${payload.metric}${baseline}`;
  }
  const payload = row.payload as IdeaDraftPayload;
  return `${payload.note}\n\nWarum: ${payload.rationale}`;
}

export function AutonomousDraftsCard({ kinds, accent = "purple", onAdoptIdea, revenueHubs, autoGenerate = true }: DraftsCardProps) {
  const styles = useMemo(() => createStyles(), []);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const queueQuery = trpc.draftEngine.queue.useQuery(undefined, { retry: false, staleTime: 15_000 });
  const meQuery = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 });
  const decideMutation = trpc.draftEngine.decide.useMutation();
  const runMutation = trpc.draftEngine.runNow.useMutation();
  const autoStarted = useRef(false);
  const utils = trpc.useUtils();

  const rows = (queueQuery.data?.pending ?? [])
    .filter((group) => kinds.includes(group.kind))
    .flatMap((group) => group.items)
    .filter((row) => row.kind !== "revenue-loop" || !revenueHubs?.length || revenueHubs.includes(revenueDraftHub(row.payload)));

  useEffect(() => {
    if (!autoGenerate || autoStarted.current || queueQuery.isLoading || queueQuery.isError) return;
    if (meQuery.data?.role !== "admin" || rows.length > 0) return;
    autoStarted.current = true;
    runMutation.mutate(undefined, {
      onSuccess: async () => {
        await utils.draftEngine.queue.invalidate();
      },
      onError: () => {
        // Nicht endlos automatisch wiederholen; manueller Button bleibt verfuegbar.
      },
    });
  }, [autoGenerate, meQuery.data?.role, queueQuery.isError, queueQuery.isLoading, rows.length, runMutation, utils.draftEngine.queue]);

  const decide = async (row: DraftRow, action: "approve" | "reject") => {
    setNotice(null);
    if (row.kind === "idea" && action === "approve" && onAdoptIdea) {
      const payload = row.payload as IdeaDraftPayload;
      setBusyId(row.id);
      const adoption = await onAdoptIdea({ note: payload.note, rationale: payload.rationale });
      if (!adoption.ok) {
        setBusyId(null);
        setNotice(adoption.reason);
        return;
      }
    }
    setBusyId(row.id);
    try {
      const result = await decideMutation.mutateAsync({ id: row.id, action });
      if (!result.ok) setNotice(result.reason);
      await utils.draftEngine.queue.invalidate();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Entscheidung fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <GlassCard accent={accent} style={styles.card}>
      <Text style={styles.title}>Autonome Entwürfe</Text>
      <Text style={styles.subtitle}>
        {kinds.map((kind) => draftKindLabel(kind)).join(" · ")} — erzeugt von der täglichen Draft-Engine, warten auf deine Freigabe.
      </Text>
      {queueQuery.isLoading || runMutation.isPending ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={glassPalette[accent]} />
          <Text style={styles.emptyNote}>{runMutation.isPending ? "Autonome Engine erzeugt fehlende Entwürfe …" : "Entwürfe werden geladen …"}</Text>
        </View>
      ) : queueQuery.isError ? (
        <Text style={styles.errorNote}>Freigabe-Queue nicht erreichbar: {queueQuery.error.message}</Text>
      ) : rows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyNote}>Keine offenen Entwürfe für diesen Bereich.</Text>
          {runMutation.error ? <Text style={styles.errorNote}>Automatischer Lauf fehlgeschlagen: {runMutation.error.message}</Text> : null}
          {meQuery.data?.role === "admin" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fehlende Entwürfe jetzt erzeugen"
              disabled={runMutation.isPending}
              onPress={() => runMutation.mutate(undefined, { onSuccess: async () => { await utils.draftEngine.queue.invalidate(); } })}
              style={styles.generateButton}
            >
              <Text style={styles.generateText}>Entwürfe jetzt erzeugen</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        rows.map((row) => (
          <View key={row.id} style={styles.row}>
            <View style={styles.rowHeader}>
              <StatusChip label={draftKindLabel(row.kind)} accent={accent} />
              <Text style={styles.hint}>{draftApprovalHint(row.kind)}</Text>
            </View>
            <Text style={styles.payload}>{describePayload(row)}</Text>
            {notice && busyId === row.id ? <Text style={styles.errorNote}>{notice}</Text> : null}
            <View style={styles.buttonRow}>
              <Pressable
                accessibilityLabel={`Entwurf ${row.id} freigeben`}
                disabled={busyId === row.id}
                onPress={() => void decide(row, "approve")}
                style={[styles.approveButton, busyId === row.id && { opacity: 0.5 }]}
              >
                <Text style={styles.approveText}>{busyId === row.id ? "…" : "Freigeben"}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Entwurf ${row.id} ablehnen`}
                disabled={busyId === row.id}
                onPress={() => void decide(row, "reject")}
                style={[styles.rejectButton, busyId === row.id && { opacity: 0.5 }]}
              >
                <Text style={styles.rejectText}>Ablehnen</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </GlassCard>
  );
}

function createStyles() {
  return StyleSheet.create({
    card: { gap: 12 },
    loadingRow: { alignItems: "center", flexDirection: "row", gap: 10 },
    emptyWrap: { gap: 10 },
    generateButton: { alignItems: "center", borderColor: glassPalette.purple, borderRadius: 12, borderWidth: 1, paddingVertical: 10 },
    generateText: { color: glassPalette.purple, fontSize: 12, fontWeight: "800" },
    title: { color: glassSurface.textPrimary, fontSize: 17, fontWeight: "900" },
    subtitle: { color: glassSurface.textSecondary, fontSize: 11, lineHeight: 16 },
    errorNote: { color: glassPalette.amber, fontSize: 11, lineHeight: 16 },
    emptyNote: { color: glassSurface.textMuted, fontSize: 11, lineHeight: 16 },
    row: { backgroundColor: `${glassSurface.border}44`, borderColor: glassSurface.border, borderRadius: 14, borderWidth: 1, gap: 10, padding: 12 },
    rowHeader: { alignItems: "flex-start", gap: 6 },
    hint: { color: glassSurface.textMuted, fontSize: 10, lineHeight: 14 },
    payload: { color: glassSurface.textSecondary, fontSize: 12, lineHeight: 18 },
    buttonRow: { flexDirection: "row", gap: 10 },
    approveButton: { alignItems: "center", backgroundColor: `${glassPalette.green}22`, borderColor: `${glassPalette.green}88`, borderRadius: 12, borderWidth: 1, flex: 1, paddingVertical: 10 },
    approveText: { color: glassPalette.green, fontSize: 12, fontWeight: "800" },
    rejectButton: { alignItems: "center", borderColor: glassSurface.border, borderRadius: 12, borderWidth: 1, flex: 1, paddingVertical: 10 },
    rejectText: { color: glassSurface.textSecondary, fontSize: 12, fontWeight: "800" },
  });
}
