export type ProposalPriority = "low" | "normal" | "high" | "critical";

export type ProposalStatus = "pending" | "review" | "applied" | "rejected" | "expired";

export type AgentProposal = {
  id: string;
  targetPath: string;
  contentHash: string;
  priority: ProposalPriority;
  createdAtMs: number;
  expiresAtMs: number;
  status: ProposalStatus;
};

export type QueueConfig = {
  nowMs: number;
  maxQueued: number;
};

const PRIORITY_ORDER: Record<ProposalPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export type QueueEvaluation = {
  order: AgentProposal[];
  expiredIds: string[];
  duplicatesRemoved: number;
  droppedForOverflow: string[];
};

/**
 * Ordet eine Menge von Agenten-Vorschlägen für die Bearbeitung:
 * 1. Abgelaufene Vorschläge werden deterministisch auf `expired` gesetzt.
 * 2. Duplikate (gleiches Ziel und gleicher Inhalts-Hash) werden verworfen;
 *    der älteste Eintrag bleibt erhalten.
 * 3. Die übrigen Vorschläge werden nach Priorität und dann nach Erstellung
 *    sortiert; bei Überlauf werden die niedrig priorisierten verworfen.
 */
export function evaluateProposalQueue(proposals: AgentProposal[], config: QueueConfig): QueueEvaluation {
  if (!Array.isArray(proposals)) {
    throw new Error("Vorschläge müssen ein Array sein.");
  }
  const nowMs = config.nowMs;
  const maxQueued = Number.isFinite(config.maxQueued) ? Math.floor(config.maxQueued) : 0;
  if (maxQueued < 1) {
    throw new Error("Die Warteschlangengröße muss mindestens 1 sein.");
  }

  const expiredIds: string[] = [];
  for (const proposal of proposals) {
    if (Number.isFinite(proposal.expiresAtMs) && proposal.expiresAtMs <= nowMs && proposal.status !== "applied" && proposal.status !== "rejected") {
      expiredIds.push(proposal.id);
      proposal.status = "expired";
    }
  }

  const activeProposals = proposals.filter((proposal) => proposal.status === "pending" || proposal.status === "review");

  const seen = new Map<string, AgentProposal>();
  let duplicatesRemoved = 0;
  for (const proposal of activeProposals) {
    const key = `${proposal.targetPath}\u0000${proposal.contentHash}`;
    const existing = seen.get(key);
    if (existing) {
      duplicatesRemoved += 1;
      if (proposal.createdAtMs < existing.createdAtMs) {
        seen.set(key, proposal);
      }
    } else {
      seen.set(key, proposal);
    }
  }

  const ordered = [...seen.values()].sort((a, b) => {
    const priorityDelta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return a.createdAtMs - b.createdAtMs;
  });

  const droppedForOverflow =
    ordered.length > maxQueued ? ordered.splice(maxQueued).map((proposal) => proposal.id) : [];

  return { order: ordered, expiredIds, duplicatesRemoved, droppedForOverflow };
}

export type ProposalTransition = {
  allowed: boolean;
  nextStatus: ProposalStatus | null;
  reason: string;
};

const ALLOWED_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  pending: ["review", "rejected", "expired"],
  review: ["applied", "rejected", "expired"],
  applied: [],
  rejected: [],
  expired: [],
};

/**
 * Prüft einen Statuswechsel eines Vorschlags. Angewendete, abgelehnte und
 * abgelaufene Vorschläge sind endgültig und können nicht erneut geöffnet
 * werden.
 */
export function transitionProposal(current: ProposalStatus, target: ProposalStatus): ProposalTransition {
  if (current === target) {
    return { allowed: false, nextStatus: null, reason: "Der Vorschlag befindet sich bereits in diesem Zustand." };
  }
  if (ALLOWED_TRANSITIONS[current].includes(target)) {
    return { allowed: true, nextStatus: target, reason: `Übergang von ${current} zu ${target} ist erlaubt.` };
  }
  return { allowed: false, nextStatus: null, reason: `Übergang von ${current} zu ${target} ist nicht erlaubt.` };
}
