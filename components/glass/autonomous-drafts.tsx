/**
 * Sprint 346 — Autonome Drafts: die Freigabe-Karte fuer die Entwuerfe der
 * autonomen Draft-Engine. Zeigt pending-Entwuerfe einer Art (oder mehrerer)
 * und die zwei ehrlichen Entscheidungen: freigeben oder ablehnen.
 *
 * Freigabe heisst hier NUR "vom Menschen geprueft" — nichts wird von dieser
 * Karte veroeffentlicht, aktiviert oder versendet. Ideen-Freigabe nimmt
 * die Idee ueber den onAdoptIdea-Rueckruf in die lokale Inbox auf.
 */
import { useMemo, useState } from "react";
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
  type RevenueLoopDraftPayload,
} from "@/lib/draft-engine-logic";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";

type DraftsCardProps = {
  kinds: readonly DraftKind[];
  accent?: "cyan" | "green" | "purple" | "blue";
  /** Nur fuer kind "idea": legt die freigegebene Idee in die Inbox. */
  onAdoptIdea?: (payload: IdeaDraftPayload) => Promise<{ ok: boolean; reason: string }>;
};

function describePayload(row: DraftRow): string {
  if (row.kind === "content") {
    const payload = row.payload as ContentDraftPayload;
    return `${payload.personaId} · ${payload.platform}\n\n${payload.content}`;
  }
  if (row.kind === "revenue-loop") {
    const payload = row.payload as RevenueLoopDraftPayload;
    return `${payload.hypothesis}\n\nStufen: ${payload.stages.join(" → ")}\nMetrik: ${payload.metric}`;
  }
  const payload = row.payload as IdeaDraftPayload;
  return `${payload.note}\n\nWarum: ${payload.rationale}`;
}

export function AutonomousDraftsCard({ kinds, accent = "purple", onAdoptIdea }: DraftsCardProps) {
  const styles = useMemo(() => createStyles(), []);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const queueQuery = trpc.draftEngine.queue.useQuery(undefined, { retry: false });
  const decideMutation = trpc.draftEngine.decide.useMutation();
  const utils = trpc.useUtils();

  const rows = (queueQuery.data?.pending ?? [])
    .filter((group) => kinds.includes(group.kind))
    .flatMap((group) => group.items);

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
      {queueQuery.isLoading ? (
        <ActivityIndicator color={glassPalette[accent]} />
      ) : queueQuery.isError ? (
        <Text style={styles.errorNote}>Freigabe-Queue nicht erreichbar: {queueQuery.error.message}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.emptyNote}>Keine offenen Entwürfe. Die Engine ergänzt automatisch, sobald Platz in der Queue ist.</Text>
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
