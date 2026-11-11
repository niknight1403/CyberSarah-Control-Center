/**
 * Sprint 10 — Freigabe-Workflow fuer Werkzeugaufrufe.
 *
 * Reine Logik. Drei Regeln, die hier erzwungen werden und nicht verhandelbar
 * sind:
 *
 *   1. NIEMAND gibt seine eigene Anfrage frei (Vier-Augen-Prinzip).
 *   2. Kritische und hohe Risiken brauchen ZWEI unabhaengige Freigaben.
 *   3. Ein einziges Veto beendet die Anfrage — kein Ueberstimmen.
 *
 * Zusaetzlich: Anfragen laufen ab. Eine Freigabe ohne Ablauf ist eine
 * Dauererlaubnis, und die ist genau das, was Governance verhindern soll.
 */
import type { RiskLevel } from "./mcp-governance-logic";

export type ApprovalDecision = "approve" | "reject";

export type ApprovalVote = {
  approver: string;
  decision: ApprovalDecision;
  note: string;
  atMs: number;
};

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "consumed";

export type ApprovalRequest = {
  runId: number;
  taskId: string;
  agentKey: string;
  serverKey: string;
  toolName: string;
  riskLevel: RiskLevel;
  reasons: string[];
  argsHash: string;
  requiredApprovals: number;
  requestedBy: string;
  requestedAtMs: number;
  expiresAtMs: number;
  status: ApprovalStatus;
  votes: ApprovalVote[];
  decidedAtMs: number | null;
  note: string;
};

export const DEFAULT_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
export const MIN_APPROVAL_TTL_MS = 5 * 60 * 1000;
export const MAX_APPROVAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Wie viele unabhaengige Freigaben ein Risiko braucht.
 * Kritisch und hoch: vier Augen. Mittel und niedrig: eine Freigabe.
 */
export function requiredApprovalsFor(riskLevel: RiskLevel): number {
  return riskLevel === "critical" || riskLevel === "high" ? 2 : 1;
}

export function boundedTtl(ttlMs = DEFAULT_APPROVAL_TTL_MS): number {
  return Math.min(Math.max(ttlMs, MIN_APPROVAL_TTL_MS), MAX_APPROVAL_TTL_MS);
}

export type CreateRequestInput = {
  runId: number;
  taskId: string;
  agentKey: string;
  serverKey: string;
  toolName: string;
  riskLevel: RiskLevel;
  reasons: string[];
  argsHash: string;
  requestedBy: string;
  nowMs: number;
  ttlMs?: number;
};

export function createApprovalRequest(input: CreateRequestInput): ApprovalRequest {
  const ttl = boundedTtl(input.ttlMs);
  return {
    runId: input.runId,
    taskId: input.taskId,
    agentKey: input.agentKey,
    serverKey: input.serverKey,
    toolName: input.toolName,
    riskLevel: input.riskLevel,
    reasons: [...new Set(input.reasons)].slice(0, 8),
    argsHash: input.argsHash,
    requiredApprovals: requiredApprovalsFor(input.riskLevel),
    requestedBy: input.requestedBy,
    requestedAtMs: input.nowMs,
    expiresAtMs: input.nowMs + ttl,
    status: "pending",
    votes: [],
    decidedAtMs: null,
    note: "",
  };
}

export function isExpired(request: ApprovalRequest, nowMs: number): boolean {
  return (request.status === "pending" || request.status === "approved") && nowMs >= request.expiresAtMs;
}

export type VoteResult =
  | { ok: true; request: ApprovalRequest; changed: boolean }
  | { ok: false; code: VoteErrorCode; reason: string };

export type VoteErrorCode =
  | "not_pending"
  | "expired"
  | "self_approval"
  | "duplicate_vote"
  | "empty_approver";

/**
 * Stimmt ueber eine Anfrage ab. Selbstfreigabe und Doppelstimmen werden
 * abgelehnt, nicht stillschweigend ignoriert.
 */
export function castVote(
  request: ApprovalRequest,
  vote: { approver: string; decision: ApprovalDecision; note?: string; nowMs: number },
): VoteResult {
  const approver = vote.approver.trim();
  if (!approver) return { ok: false, code: "empty_approver", reason: "Freigabe braucht einen erkennbaren Pruefer." };

  if (request.status !== "pending") {
    return { ok: false, code: "not_pending", reason: `Anfrage ist ${statusText(request.status)}; keine Stimme mehr moeglich.` };
  }
  if (isExpired(request, vote.nowMs)) {
    return { ok: false, code: "expired", reason: "Anfrage ist abgelaufen; bitte neu beantragen." };
  }
  if (approver === request.requestedBy) {
    return { ok: false, code: "self_approval", reason: "Vier-Augen-Prinzip: die eigene Anfrage darf nicht freigegeben werden." };
  }
  if (request.votes.some((entry) => entry.approver === approver)) {
    return { ok: false, code: "duplicate_vote", reason: `${approver} hat bereits abgestimmt.` };
  }

  const votes = [...request.votes, { approver, decision: vote.decision, note: (vote.note ?? "").slice(0, 300), atMs: vote.nowMs }];
  const rejected = votes.find((entry) => entry.decision === "reject");
  if (rejected) {
    return {
      ok: true,
      changed: true,
      request: {
        ...request,
        votes,
        status: "rejected",
        decidedAtMs: vote.nowMs,
        note: `Abgelehnt von ${rejected.approver}: ${rejected.note || "ohne Begruendung"}`.slice(0, 300),
      },
    };
  }

  const approvals = votes.filter((entry) => entry.decision === "approve").length;
  if (approvals >= request.requiredApprovals) {
    return {
      ok: true,
      changed: true,
      request: {
        ...request,
        votes,
        status: "approved",
        decidedAtMs: vote.nowMs,
        note: `Freigegeben mit ${approvals} von ${request.requiredApprovals} benoetigten Stimmen.`,
      },
    };
  }

  return { ok: true, changed: true, request: { ...request, votes } };
}

/** Abgelaufene Anfragen in einen Endzustand bringen. Idempotent. */
export function expireRequest(request: ApprovalRequest, nowMs: number): ApprovalRequest {
  if (!isExpired(request, nowMs)) return request;
  return {
    ...request,
    status: "expired",
    decidedAtMs: nowMs,
    note: request.status === "approved" ? "Freigabe lief ab, bevor sie genutzt wurde." : "Anfrage lief ohne Entscheidung ab.",
  };
}

/** Anfrage nach Nutzung entwerten — eine Freigabe gilt fuer genau einen Aufruf. */
export function consumeRequest(request: ApprovalRequest, nowMs: number): ApprovalRequest {
  if (request.status !== "approved") return request;
  return { ...request, status: "consumed", decidedAtMs: nowMs, note: `Verbraucht fuer genau einen Aufruf (${request.toolName}).` };
}

export type UsabilityInput = {
  request: ApprovalRequest;
  target: { runId: number; taskId: string; serverKey: string; toolName: string; argsHash: string };
  nowMs: number;
};

export type UsabilityResult = { usable: true } | { usable: false; code: string; reason: string };

/**
 * Prueft, ob eine Freigabe GENAU diesen Aufruf deckt: gleicher Lauf, gleiche
 * Aufgabe, gleiches Werkzeug und identische Argumente (Hash).
 */
export function isUsableForCall(input: UsabilityInput): UsabilityResult {
  const { request, target, nowMs } = input;
  if (request.status === "consumed") return { usable: false, code: "consumed", reason: "Freigabe wurde bereits verbraucht." };
  if (request.status === "rejected") return { usable: false, code: "rejected", reason: "Anfrage wurde abgelehnt." };
  if (request.status === "pending") return { usable: false, code: "pending", reason: "Anfrage ist noch nicht entschieden." };
  if (request.status === "expired" || nowMs >= request.expiresAtMs) {
    return { usable: false, code: "expired", reason: "Freigabe ist abgelaufen." };
  }
  if (request.status !== "approved") return { usable: false, code: "invalid_status", reason: `Status ${request.status} erlaubt keinen Aufruf.` };
  if (request.runId !== target.runId) return { usable: false, code: "wrong_run", reason: "Freigabe gehoert zu einem anderen Lauf." };
  if (request.taskId !== target.taskId) return { usable: false, code: "wrong_task", reason: "Freigabe gehoert zu einer anderen Aufgabe." };
  if (request.serverKey !== target.serverKey) return { usable: false, code: "wrong_server", reason: "Freigabe gilt fuer einen anderen Server." };
  if (request.toolName !== target.toolName) return { usable: false, code: "wrong_tool", reason: "Freigabe gilt fuer ein anderes Werkzeug." };
  if (request.argsHash !== target.argsHash) {
    return { usable: false, code: "args_changed", reason: "Argumente wurden seit der Freigabe geaendert." };
  }
  return { usable: true };
}

export type QueueSummary = {
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  consumed: number;
  oldestPendingMs: number | null;
  summary: string;
};

export function summarizeQueue(requests: ApprovalRequest[], nowMs: number): QueueSummary {
  const count = (status: ApprovalStatus) => requests.filter((request) => request.status === status).length;
  const pending = requests.filter((request) => request.status === "pending");
  const oldest = pending.length > 0 ? Math.max(0, nowMs - Math.min(...pending.map((request) => request.requestedAtMs))) : null;
  const parts = [
    `${count("pending")} offen`,
    `${count("approved")} freigegeben`,
    `${count("rejected")} abgelehnt`,
    `${count("expired")} abgelaufen`,
  ];
  return {
    pending: count("pending"),
    approved: count("approved"),
    rejected: count("rejected"),
    expired: count("expired"),
    consumed: count("consumed"),
    oldestPendingMs: oldest,
    summary: `Freigaben: ${parts.join(", ")}.`,
  };
}

export function statusText(status: ApprovalStatus): string {
  const map: Record<ApprovalStatus, string> = {
    pending: "offen",
    approved: "freigegeben",
    rejected: "abgelehnt",
    expired: "abgelaufen",
    consumed: "verbraucht",
  };
  return map[status];
}
