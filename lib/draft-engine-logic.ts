import { contentEvidenceReview } from "./content-evidence-review";
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

export type RevenueHub = "hara" | "saas" | "loop" | "trading";

export const REVENUE_HUBS: readonly RevenueHub[] = ["hara", "saas", "loop", "trading"] as const;

/** Maximale offene (pending) Entwuerfe pro Art — danach pausiert die Engine. */
export const DRAFT_MAX_PENDING_PER_KIND = 6;
export const DRAFT_MAX_PENDING_BY_KIND: Readonly<Record<DraftKind, number>> = {
  // 6 Personas × 4 offene Varianten: genug Material fuer A/B-Tests, ohne die Queue zu fluten.
  content: 24,
  "revenue-loop": REVENUE_HUBS.length,
  idea: 12,
};

/** Wie viele Tage ein unbeantworteter Entwurf maximal in der Queue bleibt. */
export const DRAFT_PENDING_STALE_DAYS = 14;

export type ContentDraftAsset = { format: string; variant: number; title?: string; content: string; cta?: string; qualityReason?: string };
export type ContentDraftPayload = {
  personaId: string;
  platform: string;
  topic: string;
  content: string;
  assets?: ContentDraftAsset[];
  assetCount?: number;
  disclosure?: string;
  reviewFlags?: string[];
};

export type RevenueLoopDraftPayload = {
  /** Ziel-Hub, in dem dieser autonome Entwurf angezeigt wird. */
  hub: RevenueHub;
  name: string;
  hypothesis: string;
  stages: string[];
  metric: string;
  /** Ausfuehrbarer Loop-Plan; bei Legacy-Zeilen optional. */
  experiment?: string;
  unit?: string;
  targetValue?: number;
  currentValue?: number;
  /** Optionale, deterministische Autopilot-Metadaten fuer Deduplizierung und UI. */
  autopilotKey?: string;
  baseline?: string;
  target?: string;
  score?: number;
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
  maxPendingPerKind: number | Partial<Record<DraftKind, number>> = DRAFT_MAX_PENDING_BY_KIND,
): DraftRunPlan[] {
  return DRAFT_KINDS.map((kind) => {
    const open = pendingByKind[kind] ?? 0;
    const limit = typeof maxPendingPerKind === "number"
      ? maxPendingPerKind
      : maxPendingPerKind[kind] ?? DRAFT_MAX_PENDING_PER_KIND;
    const slots = Math.max(0, limit - open);
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
    const assets = Array.isArray(raw.assets) ? raw.assets.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const asset = item as Record<string, unknown>;
      const assetContent = nonEmpty(asset.content, 12000);
      const format = nonEmpty(asset.format, 40);
      const variant = typeof asset.variant === "number" && Number.isFinite(asset.variant) ? Math.max(1, Math.floor(asset.variant)) : 1;
      if (!assetContent || !format) return [];
      const title = nonEmpty(asset.title, 200) ?? undefined;
      const cta = nonEmpty(asset.cta, 500) ?? undefined;
      const qualityReason = nonEmpty(asset.qualityReason, 500) ?? undefined;
      return [{ format, variant, content: assetContent, ...(title ? { title } : {}), ...(cta ? { cta } : {}), ...(qualityReason ? { qualityReason } : {}) }];
    }).slice(0, 30) : undefined;
    const disclosure = nonEmpty(raw.disclosure, 600) ?? undefined;
    const reviewFlags = contentEvidenceReview([topic, content, ...(assets?.map(asset => asset.content) ?? [])].join("\n"), disclosure);
    return { valid: true, payload: { personaId, platform, topic, content, ...(assets?.length ? { assets, assetCount: assets.length } : {}), ...(disclosure ? { disclosure } : {}), ...(reviewFlags.length ? { reviewFlags } : {}) }, title: topic.slice(0, 120) };
  }
  if (kind === "revenue-loop") {
    const rawHub = nonEmpty(raw.hub, 40);
    const hub: RevenueHub | null = rawHub === null
      ? "loop" // Legacy-Entwuerfe vor der Hub-Zuordnung bleiben sichtbar.
      : (REVENUE_HUBS as readonly string[]).includes(rawHub)
        ? rawHub as RevenueHub
        : null;
    const name = nonEmpty(raw.name, 120);
    const hypothesis = nonEmpty(raw.hypothesis, 600);
    const metric = nonEmpty(raw.metric, 160);
    const stages = Array.isArray(raw.stages)
      ? raw.stages.map((stage) => nonEmpty(stage, 80)).filter((stage): stage is string => stage !== null)
      : [];
    if (!hub || !name || !hypothesis || !metric || stages.length === 0) {
      return { valid: false, reason: "Revenue-Entwurf unvollstaendig (Hub/Name/Hypothese/Metrik/Stufen)." };
    }
    const autopilotKey = nonEmpty(raw.autopilotKey, 120);
    const baseline = nonEmpty(raw.baseline, 160);
    const target = nonEmpty(raw.target, 160);
    const experiment = nonEmpty(raw.experiment, 300);
    const unit = nonEmpty(raw.unit, 20);
    const targetValue = typeof raw.targetValue === "number" && Number.isFinite(raw.targetValue) && raw.targetValue > 0 ? raw.targetValue : undefined;
    const currentValue = typeof raw.currentValue === "number" && Number.isFinite(raw.currentValue) && raw.currentValue >= 0 ? raw.currentValue : undefined;
    const rawScore = typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : null;
    const score = rawScore === null ? undefined : Math.max(0, Math.min(100, Math.round(rawScore)));
    return {
      valid: true,
      payload: {
        hub,
        name,
        hypothesis,
        stages,
        metric,
        ...(experiment ? { experiment } : {}),
        ...(unit ? { unit } : {}),
        ...(targetValue !== undefined ? { targetValue } : {}),
        ...(currentValue !== undefined ? { currentValue } : {}),
        ...(autopilotKey ? { autopilotKey } : {}),
        ...(baseline ? { baseline } : {}),
        ...(target ? { target } : {}),
        ...(score !== undefined ? { score } : {}),
      },
      title: name,
    };
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
export function revenueDraftHub(payload: unknown): RevenueHub {
  if (typeof payload === "object" && payload !== null) {
    const hub = (payload as { hub?: unknown }).hub;
    if (typeof hub === "string" && (REVENUE_HUBS as readonly string[]).includes(hub)) return hub as RevenueHub;
  }
  return "loop";
}

export function revenueHubLabel(hub: RevenueHub): string {
  if (hub === "hara") return "HARA";
  if (hub === "saas") return "SaaS";
  if (hub === "trading") return "Micro Trading";
  return "Loop Engineering";
}

export function draftApprovalHint(kind: DraftKind): string {
  if (kind === "content") return "Freigabe markiert den Entwurf als geprüft. Veroeffentlichen bleibt ein separater Schritt.";
  if (kind === "revenue-loop") return "Freigabe nimmt den Loop in die Planung auf. Aktiv testen bleibt ein separater Schritt.";
  return "Freigabe legt die Idee in der Ideen-Inbox ab.";
}
