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
  onAdoptIdea?: (payload: IdeaDraftPayload & { title: string }) => Promise<{ ok: boolean; reason: string }>;
  /** Fuer Revenue-Loops: Freigabe integriert den Plan in Loop Engineering. */
  onAdoptRevenueLoop?: (payload: RevenueLoopDraftPayload) => Promise<{ ok: boolean; reason: string }>;
  /** Optional: Revenue-Loop-Entwuerfe auf konkrete Revenue-Hubs begrenzen. */
  revenueHubs?: readonly RevenueHub[];
  /** Leere Hub-Queue bei Admin automatisch durch die Draft-Engine auffuellen. */
  autoGenerate?: boolean;
};

function describePayload(row: DraftRow): string {
  if (row.kind === "content") {
    const payload = row.payload as ContentDraftPayload;
    const checks = payload.reviewFlags?.length ? `\n\nVor Freigabe prüfen:\n• ${payload.reviewFlags.join("\n• ")}` : "";
    const source = payload.commerceSource ? `\n\nStripe-Quelle: ${payload.commerceSource.productId} / ${payload.commerceSource.priceId}` : "";
    return `${payload.personaId} · ${payload.platform}\n\n${payload.content}${source}${checks}`;
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

export function AutonomousDraftsCard({ kinds, accent = "purple", onAdoptIdea, onAdoptRevenueLoop, revenueHubs, autoGenerate = true }: DraftsCardProps) {
  const styles = useMemo(() => createStyles(), []);
  const [busyId, setBusyId] = useState<number | null>(null);
  /** Fehlermeldung gehoert zur Zeile, die sie ausgeloest hat — sonst bleibt sie unsichtbar. */
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  /** Bericht des Engine-Laufs: was entstanden ist und was (noch) fehlt. */
  const [runReport, setRunReport] = useState<string>("");

  const meQuery = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 });
  const isAdmin = meQuery.data?.role === "admin";
  const queueQuery = trpc.draftEngine.queue.useQuery(undefined, { enabled: isAdmin, retry: false, staleTime: 15_000 });
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
      onSuccess: async (data) => {
        setRunReport(describeRun(data?.result));
        await utils.draftEngine.queue.invalidate();
      },
      onError: () => {
        // Nicht endlos automatisch wiederholen; manueller Button bleibt verfuegbar.
      },
    });
  }, [autoGenerate, meQuery.data?.role, queueQuery.isError, queueQuery.isLoading, rows.length, runMutation, utils.draftEngine.queue]);

  const decide = async (row: DraftRow, action: "approve" | "reject") => {
    setNotice(null);
    setBusyId(row.id);
    try {
      // Keep the complete approval flow inside this try/finally. Adoption can
      // fail before the server mutation (for example when local persistence
      // rejects); that must never leave the row's button permanently busy.
      if (action === "approve" && row.kind === "idea" && onAdoptIdea) {
        const payload = row.payload as IdeaDraftPayload;
        const adoption = await onAdoptIdea({ title: row.title, note: payload.note, rationale: payload.rationale });
        if (!adoption.ok) {
          setNotice({ id: row.id, text: adoption.reason || "Idee konnte nicht in die Inbox übernommen werden." });
          return;
        }
      }
      if (action === "approve" && row.kind === "revenue-loop" && onAdoptRevenueLoop) {
        const adoption = await onAdoptRevenueLoop(row.payload as RevenueLoopDraftPayload);
        if (!adoption.ok) {
          setNotice({ id: row.id, text: adoption.reason || "Revenue-Loop konnte nicht übernommen werden." });
          return;
        }
      }

      const result = await decideMutation.mutateAsync({ id: row.id, action });
      // Another admin may have decided this row already. Refresh even when
      // the server rejects the stale decision so the queue cannot stay stale.
      await utils.draftEngine.queue.invalidate();
      if (!result.ok) {
        setNotice({ id: row.id, text: result.reason });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Freigabe fehlgeschlagen. Bitte erneut versuchen.";
      setNotice({ id: row.id, text: message });
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
      {meQuery.isLoading ? (
        <Text style={styles.emptyNote}>Administratorrechte werden geprüft …</Text>
      ) : !isAdmin ? (
        <Text style={styles.emptyNote}>Zentrale Freigabe-Entwürfe sind nur für Administratoren zugänglich.</Text>
      ) : queueQuery.isLoading || runMutation.isPending ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={glassPalette[accent]} />
          <Text style={styles.emptyNote}>{runMutation.isPending ? "Autonome Engine erzeugt fehlende Entwürfe … (Zeitbudget 25 s, danach ehrlicher Teilbericht)" : "Entwürfe werden geladen …"}</Text>
        </View>
      ) : queueQuery.isError ? (
        <Text style={styles.errorNote}>Freigabe-Queue nicht erreichbar: {queueQuery.error.message}</Text>
      ) : rows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyNote}>Keine offenen Entwürfe für diesen Bereich.</Text>
          {runReport ? <Text style={styles.errorNote}>{runReport}</Text> : null}
          {runMutation.error ? <Text style={styles.errorNote}>Automatischer Lauf fehlgeschlagen: {runMutation.error.message}</Text> : null}
          {meQuery.data?.role === "admin" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fehlende Entwürfe jetzt erzeugen"
              disabled={runMutation.isPending}
              onPress={() => runMutation.mutate(undefined, { onSuccess: async (data) => { setRunReport(describeRun(data?.result)); await utils.draftEngine.queue.invalidate(); } })}
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
            {notice?.id === row.id ? <Text style={styles.errorNote}>{notice.text}</Text> : null}
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

/**
 * Ehrlicher Laufbericht: die Engine erzeugt nur echte Entwürfe. Fehlt eine
 * LLM-Route oder greift das Zeitbudget, steht das hier im Klartext — statt
 * eines endlosen Ladezeichens.
 */
function describeRun(result?: {
  generated?: Record<string, number>;
  skipped?: { kind: string; reason: string }[];
  truncated?: boolean;
  elapsedMs?: number;
}): string {
  if (!result) return "";
  const generated = Object.entries(result.generated ?? {}).filter(([, count]) => count > 0);
  const parts: string[] = [];
  parts.push(generated.length
    ? `Neu erzeugt: ${generated.map(([kind, count]) => `${count}× ${kind}`).join(", ")}.`
    : "Kein neuer Entwurf erzeugt.");
  const firstReason = result.skipped?.find((entry) => entry.reason)?.reason;
  if (firstReason) parts.push(`Grund: ${firstReason}`);
  if (result.truncated) parts.push("Zeitbudget erreicht — der Rest folgt im nächsten Lauf.");
  if (typeof result.elapsedMs === "number") parts.push(`Dauer ${Math.round(result.elapsedMs / 1000)} s.`);
  return parts.join(" ");
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
