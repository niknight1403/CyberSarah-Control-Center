/**
 * Sprint 346 — Autonome Draft-Engine: reine, deterministische Logik fuer
 * die Erstellung von Entwuerfen (Content, Revenue-Loop, Idee), die NUR auf
 * Freigabe (HITL) warten — nichts wird ohne Bestaetigung veroeffentlicht
 * oder ausgefuehrt.
 *
 * Ehrlichkeits-Grenzen:
 *   - Jede Art hat ein eigenes Pending-Limit: die Queue laeuft nie ueber.
 *   - Unvollstaendige KI-Antworten werden verworfen statt als "Entwurf"
 *     abgelegt — kein halbfertiger Muell in der Freigabe-Liste.
 *   - Die Engine erzeugt NUR Zeilen mit Status "pending"; alles Weitere
 *     (approved/rejected) entscheidet ausschliesslich ein Mensch.
 */

/** Arten autonom erzeugbarer Entwuerfe. */
export type DraftKind = "content" | "revenue-loop" | "idea";

/** Status im Freigabe-Fluss: pending wartet auf den Menschen. */
export type DraftStatus = "pending" | "approved" | "rejected";

export const DRAFT_KINDS: readonly DraftKind[] = ["content", "revenue-loop", "idea"] as const;

/** Maximale offene (pending) Entwuerfe pro Art — danach pausiert die Engine. */
export const DRAFT_MAX_PENDING_PER_KIND = 3;

/** Wie viele Tage ein unbeantworteter Entwurf maximal in der Queue bleibt. */
export const DRAFT_PENDING_STALE_DAYS = 14;

export type ContentDraftPayload = {
  personaId: string;
  platform: string;
  topic: string;
  content: string;
};

export type RevenueLoopDraftPayload = {
  name: string;
  hypothesis: string;
  stages: string[];
  metric: string;
};

export type IdeaDraftPayload = {
  note: string;
  rationale: string;
};

export type DraftPayloadByKind = {
  content: ContentDraftPayload;
  "revenue-loop": RevenueLoopDraftPayload;
  idea: IdeaDraftPayload;
};

/** Eine Zeile der Freigabe-Queue (transport-agnostisch, Datum als ms). */
export type DraftRow = {
  id: number;
  kind: DraftKind;
  title: string;
  payload: DraftPayloadByKind[DraftKind];
  status: DraftStatus;
  createdAtMs: number;
  decidedAtMs: number | null;
};

export type DraftRunPlan = {
  kind: DraftKind;
  slots: number;
  reason: "quota" | "limit";
};

/** Plant, wie viele neue Entwuerfe pro Art erzeugt werden duerfen. */
export function planDraftRun(
  pendingByKind: Record<DraftKind, number>,
  maxPendingPerKind: number = DRAFT_MAX_PENDING_PER_KIND,
): DraftRunPlan[] {
  return DRAFT_KINDS.map((kind) => {
    const open = pendingByKind[kind] ?? 0;
    const slots = Math.max(0, maxPendingPerKind - open);
    return { kind, slots, reason: slots > 0 ? "quota" : "limit" } as DraftRunPlan;
  });
}

function nonEmpty(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/** Validiert einen erzeugten Entwurf ehrlich — kaputt heisst verworfen. */
export function validateDraftPayload(
  kind: DraftKind,
  payload: unknown,
): { valid: true; payload: DraftPayloadByKind[DraftKind]; title: string } | { valid: false; reason: string } {
  if (typeof payload !== "object" || payload === null) return { valid: false, reason: "Payload fehlt." };
  const raw = payload as Record<string, unknown>;
  if (kind === "content") {
    const personaId = nonEmpty(raw.personaId, 40);
    const platform = nonEmpty(raw.platform, 40);
    const topic = nonEmpty(raw.topic, 300);
    const content = nonEmpty(raw.content, 4000);
    if (!personaId || !platform || !topic || !content) {
      return { valid: false, reason: "Content-Entwurf unvollstaendig (Persona/Plattform/Thema/Text)." };
    }
    return { valid: true, payload: { personaId, platform, topic, content }, title: topic.slice(0, 120) };
  }
  if (kind === "revenue-loop") {
    const name = nonEmpty(raw.name, 120);
    const hypothesis = nonEmpty(raw.hypothesis, 600);
    const metric = nonEmpty(raw.metric, 160);
    const stages = Array.isArray(raw.stages)
      ? raw.stages.map((stage) => nonEmpty(stage, 80)).filter((stage): stage is string => stage !== null)
      : [];
    if (!name || !hypothesis || !metric || stages.length === 0) {
      return { valid: false, reason: "Revenue-Loop-Entwurf unvollstaendig (Name/Hypothese/Metrik/Stufen)." };
    }
    return { valid: true, payload: { name, hypothesis, stages, metric }, title: name };
  }
  const note = nonEmpty(raw.note, 300);
  const rationale = nonEmpty(raw.rationale, 600);
  if (!note || !rationale) return { valid: false, reason: "Ideen-Entwurf unvollstaendig (Notiz/Begruendung)." };
  return { valid: true, payload: { note, rationale }, title: note.slice(0, 120) };
}

/** Erwarteter naechster Status bei Freigabe/Ablehnung — nur Menschen entscheiden. */
export function nextDraftStatus(action: "approve" | "reject"): DraftStatus {
  return action === "approve" ? "approved" : "rejected";
}

export type DraftQueueView = {
  pending: { kind: DraftKind; items: DraftRow[] }[];
  decided: DraftRow[];
  counts: Record<DraftStatus, number>;
  oldestPendingDays: number | null;
};

/** Baut die Freigabe-Ansicht: pending gruppiert nach Art, decided chronologisch. */
export function buildDraftQueueView(rows: DraftRow[], nowMs: number): DraftQueueView {
  const pending = DRAFT_KINDS.map((kind) => ({
    kind,
    items: rows.filter((row) => row.kind === kind && row.status === "pending"),
  }));
  const decided = rows.filter((row) => row.status !== "pending");
  const oldestPending = rows
    .filter((row) => row.status === "pending")
    .reduce<number | null>((oldest, row) => (oldest === null ? row.createdAtMs : Math.min(oldest, row.createdAtMs)), null);
  return {
    pending,
    decided,
    counts: {
      pending: rows.filter((row) => row.status === "pending").length,
      approved: rows.filter((row) => row.status === "approved").length,
      rejected: rows.filter((row) => row.status === "rejected").length,
    },
    oldestPendingDays: oldestPending === null ? null : Math.floor((nowMs - oldestPending) / 86_400_000),
  };
}

/** Deutsch lesbares Status-Label fuer die UI. */
export function draftStatusLabel(status: DraftStatus): string {
  if (status === "pending") return "wartet auf Freigabe";
  if (status === "approved") return "freigegeben";
  return "abgelehnt";
}

/** Deutsch lesbares Art-Label. */
export function draftKindLabel(kind: DraftKind): string {
  if (kind === "content") return "Content-Entwurf";
  if (kind === "revenue-loop") return "Revenue-Loop";
  return "Ideen-Vorschlag";
}

/**
 * Ehrlicher Hinweistext pro Art, was die Bestaetigung bewirkt — die UI
 * schwaerzt nicht, dass Freigabe ≠ Veroeffentlichung ist.
 */
export function draftApprovalHint(kind: DraftKind): string {
  if (kind === "content") return "Freigabe markiert den Entwurf als geprüft. Veroeffentlichen bleibt ein separater Schritt.";
  if (kind === "revenue-loop") return "Freigabe nimmt den Loop in die Planung auf. Aktiv testen bleibt ein separater Schritt.";
  return "Freigabe legt die Idee in der Ideen-Inbox ab.";
}
