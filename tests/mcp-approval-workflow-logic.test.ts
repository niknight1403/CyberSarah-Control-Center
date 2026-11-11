/**
 * Sprint 10 — Tests des Freigabe-Workflows.
 *
 * Zusagen: Selbstfreigabe ist unmoeglich, kritische Aktionen brauchen zwei
 * unabhaengige Stimmen, ein Veto beendet die Anfrage, Freigaben laufen ab und
 * gelten nur fuer exakt den beantragten Aufruf.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPROVAL_TTL_MS,
  MAX_APPROVAL_TTL_MS,
  MIN_APPROVAL_TTL_MS,
  boundedTtl,
  castVote,
  consumeRequest,
  createApprovalRequest,
  expireRequest,
  isExpired,
  isUsableForCall,
  requiredApprovalsFor,
  statusText,
  summarizeQueue,
  type ApprovalRequest,
} from "../lib/mcp-approval-workflow-logic";

const NOW = 1_700_000_000_000;

function request(overrides: Partial<Parameters<typeof createApprovalRequest>[0]> = {}): ApprovalRequest {
  return createApprovalRequest({
    runId: 7,
    taskId: "research",
    agentKey: "research-scout",
    serverKey: "websearch",
    toolName: "search_web",
    riskLevel: "medium",
    reasons: ["mittleres Risiko"],
    argsHash: "abc123",
    requestedBy: "agent:orchestrator",
    nowMs: NOW,
    ...overrides,
  });
}

describe("Anfrage anlegen", () => {
  it("verlangt vier Augen bei kritischen und hohen Risiken", () => {
    expect(requiredApprovalsFor("critical")).toBe(2);
    expect(requiredApprovalsFor("high")).toBe(2);
    expect(requiredApprovalsFor("medium")).toBe(1);
    expect(requiredApprovalsFor("low")).toBe(1);
  });

  it("setzt Ablauf, Antragsteller und Risiko korrekt", () => {
    const created = request({ riskLevel: "critical" });
    expect(created.status).toBe("pending");
    expect(created.requiredApprovals).toBe(2);
    expect(created.expiresAtMs).toBe(NOW + DEFAULT_APPROVAL_TTL_MS);
    expect(created.votes).toEqual([]);
    expect(created.decidedAtMs).toBeNull();
  });

  it("begrenzt die Gueltigkeit nach oben und unten", () => {
    expect(boundedTtl(1000)).toBe(MIN_APPROVAL_TTL_MS);
    expect(boundedTtl(365 * 24 * 60 * 60 * 1000)).toBe(MAX_APPROVAL_TTL_MS);
    expect(boundedTtl(DEFAULT_APPROVAL_TTL_MS)).toBe(DEFAULT_APPROVAL_TTL_MS);
  });

  it("entdoppelt Gruende", () => {
    const created = request({ reasons: ["a", "a", "b"] });
    expect(created.reasons).toEqual(["a", "b"]);
  });
});

describe("Abstimmung", () => {
  it("verhindert Selbstfreigabe", () => {
    const result = castVote(request(), { approver: "agent:orchestrator", decision: "approve", nowMs: NOW + 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("self_approval");
  });

  it("verhindert Doppelstimmen", () => {
    const first = castVote(request({ riskLevel: "critical" }), { approver: "alice", decision: "approve", nowMs: NOW + 1 });
    if (!first.ok) throw new Error("Stimme fehlgeschlagen");
    const second = castVote(first.request, { approver: "alice", decision: "approve", nowMs: NOW + 2 });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("duplicate_vote");
  });

  it("gibt mittleres Risiko mit einer Stimme frei", () => {
    const result = castVote(request(), { approver: "alice", decision: "approve", note: "ok", nowMs: NOW + 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.status).toBe("approved");
    expect(result.request.decidedAtMs).toBe(NOW + 5);
    expect(result.request.note).toContain("1 von 1");
  });

  it("verlangt bei kritischem Risiko zwei unabhaengige Stimmen", () => {
    const first = castVote(request({ riskLevel: "critical" }), { approver: "alice", decision: "approve", nowMs: NOW + 1 });
    if (!first.ok) throw new Error("Stimme fehlgeschlagen");
    expect(first.request.status).toBe("pending");
    expect(first.request.votes).toHaveLength(1);

    const second = castVote(first.request, { approver: "bob", decision: "approve", nowMs: NOW + 2 });
    if (!second.ok) throw new Error("Stimme fehlgeschlagen");
    expect(second.request.status).toBe("approved");
    expect(second.request.votes).toHaveLength(2);
  });

  it("beendet die Anfrage bei einem Veto sofort", () => {
    const approvedOnce = castVote(request({ riskLevel: "critical" }), { approver: "alice", decision: "approve", nowMs: NOW + 1 });
    if (!approvedOnce.ok) throw new Error("Stimme fehlgeschlagen");
    const veto = castVote(approvedOnce.request, { approver: "bob", decision: "reject", note: "zu teuer", nowMs: NOW + 2 });
    if (!veto.ok) throw new Error("Veto fehlgeschlagen");
    expect(veto.request.status).toBe("rejected");
    expect(veto.request.note).toContain("bob");
  });

  it("lehnt Stimmen nach Entscheidung, Ablauf und ohne Pruefer ab", () => {
    const decided = castVote(request(), { approver: "alice", decision: "approve", nowMs: NOW + 1 });
    if (!decided.ok) throw new Error("Stimme fehlgeschlagen");
    const again = castVote(decided.request, { approver: "bob", decision: "approve", nowMs: NOW + 2 });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("not_pending");

    const late = castVote(request(), { approver: "bob", decision: "approve", nowMs: NOW + DEFAULT_APPROVAL_TTL_MS + 1 });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.code).toBe("expired");

    const anonymous = castVote(request(), { approver: "   ", decision: "approve", nowMs: NOW + 1 });
    expect(anonymous.ok).toBe(false);
    if (!anonymous.ok) expect(anonymous.code).toBe("empty_approver");
  });
});

describe("Ablauf und Verbrauch", () => {
  it("erkennt abgelaufene Anfragen", () => {
    const created = request();
    expect(isExpired(created, NOW + 1)).toBe(false);
    expect(isExpired(created, NOW + DEFAULT_APPROVAL_TTL_MS)).toBe(true);
  });

  it("setzt abgelaufene Anfragen in den Endzustand", () => {
    const expired = expireRequest(request(), NOW + DEFAULT_APPROVAL_TTL_MS + 1);
    expect(expired.status).toBe("expired");
    expect(expired.note).toContain("ohne Entscheidung");
    const stillPending = expireRequest(request(), NOW + 10);
    expect(stillPending.status).toBe("pending");
  });

  it("entwertet eine Freigabe nach einem Aufruf", () => {
    const approved = castVote(request(), { approver: "alice", decision: "approve", nowMs: NOW + 1 });
    if (!approved.ok) throw new Error("Stimme fehlgeschlagen");
    const consumed = consumeRequest(approved.request, NOW + 3);
    expect(consumed.status).toBe("consumed");
    expect(consumeRequest(consumed, NOW + 4).status).toBe("consumed");
  });
});

describe("Deckung eines konkreten Aufrufs", () => {
  const target = { runId: 7, taskId: "research", serverKey: "websearch", toolName: "search_web", argsHash: "abc123" };

  function approved(): ApprovalRequest {
    const result = castVote(request(), { approver: "alice", decision: "approve", nowMs: NOW + 1 });
    if (!result.ok) throw new Error("Stimme fehlgeschlagen");
    return result.request;
  }

  it("akzeptiert exakt den beantragten Aufruf", () => {
    expect(isUsableForCall({ request: approved(), target, nowMs: NOW + 2 }).usable).toBe(true);
  });

  it("lehnt abweichende Argumente, Werkzeuge, Aufgaben und Laeufe ab", () => {
    const codes = [
      isUsableForCall({ request: approved(), target: { ...target, argsHash: "anders" }, nowMs: NOW + 2 }),
      isUsableForCall({ request: approved(), target: { ...target, toolName: "fetch_page" }, nowMs: NOW + 2 }),
      isUsableForCall({ request: approved(), target: { ...target, taskId: "produce" }, nowMs: NOW + 2 }),
      isUsableForCall({ request: approved(), target: { ...target, runId: 8 }, nowMs: NOW + 2 }),
      isUsableForCall({ request: approved(), target: { ...target, serverKey: "docs" }, nowMs: NOW + 2 }),
    ].map((result) => (result.usable ? "usable" : result.code));
    expect(codes).toEqual(["args_changed", "wrong_tool", "wrong_task", "wrong_run", "wrong_server"]);
  });

  it("lehnt offene, abgelaufene, abgelehnte und verbrauchte Freigaben ab", () => {
    const pending = isUsableForCall({ request: request(), target, nowMs: NOW + 1 });
    expect(pending.usable).toBe(false);
    if (!pending.usable) expect(pending.code).toBe("pending");

    const late = isUsableForCall({ request: approved(), target, nowMs: NOW + DEFAULT_APPROVAL_TTL_MS + 1 });
    expect(late.usable).toBe(false);
    if (!late.usable) expect(late.code).toBe("expired");

    const veto = castVote(request(), { approver: "bob", decision: "reject", nowMs: NOW + 1 });
    if (!veto.ok) throw new Error("Veto fehlgeschlagen");
    const rejected = isUsableForCall({ request: veto.request, target, nowMs: NOW + 2 });
    expect(rejected.usable).toBe(false);
    if (!rejected.usable) expect(rejected.code).toBe("rejected");

    const consumed = isUsableForCall({ request: consumeRequest(approved(), NOW + 2), target, nowMs: NOW + 3 });
    expect(consumed.usable).toBe(false);
    if (!consumed.usable) expect(consumed.code).toBe("consumed");
  });
});

describe("Warteschlange", () => {
  it("zaehlt nach Status und nennt den aeltesten offenen Antrag", () => {
    const approved = castVote(request(), { approver: "alice", decision: "approve", nowMs: NOW + 1 });
    if (!approved.ok) throw new Error("Stimme fehlgeschlagen");
    const veto = castVote(request({ taskId: "b" }), { approver: "bob", decision: "reject", nowMs: NOW + 1 });
    if (!veto.ok) throw new Error("Veto fehlgeschlagen");
    const queue = summarizeQueue(
      [request({ taskId: "alt", nowMs: NOW - 5000 }), approved.request, veto.request, expireRequest(request({ taskId: "c" }), NOW + DEFAULT_APPROVAL_TTL_MS + 1)],
      NOW,
    );
    expect(queue.pending).toBe(1);
    expect(queue.approved).toBe(1);
    expect(queue.rejected).toBe(1);
    expect(queue.expired).toBe(1);
    expect(queue.oldestPendingMs).toBe(5000);
    expect(queue.summary).toContain("1 offen");
  });

  it("meldet leere Warteschlangen ohne Alter", () => {
    expect(summarizeQueue([], NOW).oldestPendingMs).toBeNull();
  });

  it("beschreibt Status auf Deutsch", () => {
    expect(statusText("pending")).toBe("offen");
    expect(statusText("consumed")).toBe("verbraucht");
  });
});
