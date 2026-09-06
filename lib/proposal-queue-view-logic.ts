import { hashContent } from "./change-snapshot-logic";
import {
  evaluateProposalQueue,
  transitionProposal,
  type AgentProposal as QueueProposal,
  type ProposalPriority,
  type ProposalStatus,
  type QueueEvaluation,
} from "./proposal-queue-logic";

/**
 * Quelle eines Warteschlangeneintrags: eine Chat-Nachricht mit Vorschlag aus
 * dem Agentenbereich. Enthält ausschließlich Pfade, Inhalte und Zustände —
 * niemals Secrets, Tokens oder Endpoints.
 */
export type ProposalSource = {
  messageId: string;
  summary: string;
  changes: Array<{ path: string; content: string }>;
  createdAtMs: number;
  state: "ready" | "applying" | "applied" | "error" | "reverting" | "reverted";
};

export type ProposalQueueViewConfig = {
  nowMs: number;
  maxQueued: number;
  ttlMs: number;
  defaultPriority: ProposalPriority;
};

export const DEFAULT_PROPOSAL_QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: "Offen",
  review: "In Prüfung",
  applied: "Angewendet",
  rejected: "Abgelehnt",
  expired: "Abgelaufen",
};

const STATUS_TONES: Record<ProposalStatus, "ready" | "warning" | "neutral" | "accent"> = {
  pending: "neutral",
  review: "accent",
  applied: "ready",
  rejected: "neutral",
  expired: "warning",
};

const PRIORITY_ORDER: Record<ProposalPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const PRIORITY_LABELS: Record<ProposalPriority, string> = {
  critical: "Kritisch",
  high: "Hoch",
  normal: "Normal",
  low: "Niedrig",
};

/**
 * Ordnet den Anwendungszustand einer Chat-Nachricht dem Status der geprüften
 * Zustandsmaschine aus Sprint 35 zu. Die Zuordnung folgt ausschließlich
 * Übergängen, die `transitionProposal` erlaubt: `pending` darf nach `review`,
 * `rejected` oder `expired` wechseln, `review` nach `applied`, `rejected`
 * oder `expired`.
 */
function mapChatState(state: ProposalSource["state"]): ProposalStatus {
  if (state === "applied") return "applied";
  if (state === "reverted") return "rejected";
  if (state === "applying" || state === "reverting") return "review";
  return "pending";
}

/**
 * Verkürzt die Zusammenfassung eines Vorschlags auf die erste Zeile und
 * begrenzt sie deterministisch. Dadurch enthält die Warteschlange niemals
 * vollständige Dateiinhalte oder andere potenziell sensible Passagen.
 */
export function sanitizeProposalTitle(summary: string): string {
  const firstLine = String(summary).split("\n")[0].trim();
  if (firstLine.length <= 60) return firstLine;
  return `${firstLine.slice(0, 57)}…`;
}

function buildQueueProposal(source: ProposalSource, config: ProposalQueueViewConfig): QueueProposal {
  const paths = [...new Set(source.changes.map((change) => change.path))].sort();
  const targetPath = paths.length ? paths.join(", ") : "—";
  const contents = [...source.changes]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((change) => `${change.path}\u0000${change.content}`)
    .join("\u0001");
  return {
    id: source.messageId,
    targetPath,
    contentHash: hashContent(`${targetPath}\u0001${contents}`),
    priority: config.defaultPriority,
    createdAtMs: source.createdAtMs,
    expiresAtMs: source.createdAtMs + config.ttlMs,
    status: mapChatState(source.state),
  };
}

export type ProposalQueueViewItem = {
  id: string;
  title: string;
  pathLabel: string;
  priorityLabel: string;
  status: ProposalStatus;
  badgeLabel: string;
  badgeTone: "ready" | "warning" | "neutral" | "accent";
  expiresAtMs: number;
  isExpired: boolean;
  expiryLabel: string;
  actionable: boolean;
};

export type ProposalQueueSummary = {
  queuedCount: number;
  appliedCount: number;
  rejectedCount: number;
  expiredCount: number;
  duplicatesRemoved: number;
  droppedForOverflow: number;
  summaryText: string;
};

export type ProposalQueueView = {
  items: ProposalQueueViewItem[];
  evaluation: QueueEvaluation;
  summary: ProposalQueueSummary;
};

function buildExpiryLabel(expiresAtMs: number, nowMs: number): string {
  if (expiresAtMs <= nowMs) return "abgelaufen";
  const remainingDays = Math.floor((expiresAtMs - nowMs) / (24 * 60 * 60 * 1000));
  if (remainingDays <= 0) return "läuft heute ab";
  return `läuft in ${remainingDays} Tag${remainingDays === 1 ? "" : "en"} ab`;
}

/**
 * Baut die tokenfreie Ansicht der Vorschlagswarteschlange aus den
 * Chat-Vorschlägen. Ordnung, Ablauf, Duplikat- und Überlaufbehandlung stammen
 * unverändert aus der geprüften Sprint-35-Logik (`evaluateProposalQueue`).
 */
export function buildProposalQueueView(sources: ProposalSource[], config: ProposalQueueViewConfig): ProposalQueueView {
  if (!Array.isArray(sources)) throw new Error("Vorschlagsquellen müssen ein Array sein.");
  if (!Number.isFinite(config.nowMs)) throw new Error("Der Referenzzeitpunkt muss eine endliche Zahl sein.");
  if (!Number.isFinite(config.ttlMs) || config.ttlMs <= 0) throw new Error("Die Ablaufdauer muss positiv sein.");
  if (config.maxQueued < 1) throw new Error("Die Warteschlangengröße muss mindestens 1 sein.");

  const proposalsBySource = new Map<string, { proposal: QueueProposal; source: ProposalSource }>();
  const proposals: QueueProposal[] = [];
  for (const source of sources) {
    const proposal = buildQueueProposal(source, config);
    proposalsBySource.set(proposal.id, { proposal, source });
    proposals.push(proposal);
  }

  const evaluation = evaluateProposalQueue(proposals, { nowMs: config.nowMs, maxQueued: Math.floor(config.maxQueued) });

  // Aktive Einträge folgen der geprüften Reihenfolge aus Sprint 35; abgeschlossene
  // und abgelaufene Einträge bleiben sichtbar und reihen sich dahinter ein.
  const finalized = proposals
    .filter((proposal) => proposal.status === "applied" || proposal.status === "rejected" || proposal.status === "expired")
    .sort((a, b) => {
      const priorityDelta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      return priorityDelta !== 0 ? priorityDelta : a.createdAtMs - b.createdAtMs;
    });
  const orderedProposals = [...evaluation.order, ...finalized];

  const items = orderedProposals.map((proposal) => {
    const status = proposal.status;
    const source = proposalsBySource.get(proposal.id)?.source;
    const pathLabel = proposal.targetPath === "—" ? "keine Dateiänderung" : proposal.targetPath;
    const title = sanitizeProposalTitle(source?.summary ?? proposal.id);
    return {
      id: proposal.id,
      title,
      pathLabel,
      priorityLabel: PRIORITY_LABELS[proposal.priority],
      status,
      badgeLabel: STATUS_LABELS[status],
      badgeTone: STATUS_TONES[status],
      expiresAtMs: proposal.expiresAtMs,
      isExpired: status === "expired",
      expiryLabel: buildExpiryLabel(proposal.expiresAtMs, config.nowMs),
      actionable: status === "pending" || status === "review",
    };
  });

  const appliedCount = items.filter((item) => item.status === "applied").length;
  const rejectedCount = items.filter((item) => item.status === "rejected").length;
  const expiredCount = evaluation.expiredIds.length;
  const duplicatesRemoved = evaluation.duplicatesRemoved;
  const droppedForOverflow = evaluation.droppedForOverflow.length;
  const queuedCount = items.filter((item) => item.actionable).length;

  const summaryParts = [
    `${queuedCount} zur Bearbeitung`,
    `${appliedCount} angewendet`,
    `${rejectedCount} abgelehnt`,
    `${expiredCount} abgelaufen`,
  ];
  if (duplicatesRemoved) summaryParts.push(`${duplicatesRemoved} Duplikat(e) verworfen`);
  if (droppedForOverflow) summaryParts.push(`${droppedForOverflow} wegen Überlauf verworfen`);

  return {
    items,
    evaluation,
    summary: {
      queuedCount,
      appliedCount,
      rejectedCount,
      expiredCount,
      duplicatesRemoved,
      droppedForOverflow,
      summaryText: summaryParts.join(" · "),
    },
  };
}

/**
 * Validiert einen Zustandswechsel eines Warteschlangeneintrags ausschließlich
 * über die geprüfte Zustandsmaschine aus Sprint 35.
 */
export function requestProposalTransition(current: ProposalStatus, target: ProposalStatus) {
  return transitionProposal(current, target);
}
