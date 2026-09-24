import { describe, expect, it } from "vitest";

import { applyApprovalDecision, auditLine, levelForKind, markExecution, validateExternalActionDraft, type ExternalActionRecord } from "../lib/external-action-logic";

const now = () => new Date(2026, 8, 24, 12, 0).getTime();

function pending(): ExternalActionRecord {
  return { id: "act-1", kind: "email_send", payloadPreview: "Willkommensmail an Opt-in-Kunden", createdAt: now(), idempotencyKey: "welcome-1", status: "pending_approval", decidedAt: null, executedAt: null, outcome: null };
}

describe("external action level-3 flow (Sprint 268)", () => {
  it("externe Aktionen brauchen immer Level 3", () => {
    expect(levelForKind("email_send")).toBe(3);
    expect(levelForKind("payment_link")).toBe(3);
  });

  it("validiert Drafts mit Idempotenz-Zwang", () => {
    expect(validateExternalActionDraft({ id: "a1", kind: "email_send", payloadPreview: "Hallo Welt, willkommen!", idempotencyKey: "k1" }).valid).toBe(true);
    expect(validateExternalActionDraft({ id: "a1", kind: "frei_erfunden" as never, payloadPreview: "x", idempotencyKey: "k" }).valid).toBe(false);
    expect(validateExternalActionDraft({ id: "a1", kind: "email_send", payloadPreview: "zu kurz", idempotencyKey: "" }).valid).toBe(false);
  });

  it("nur erlaubte Uebergaenge — Ablehnung ist final", () => {
    const rejected = applyApprovalDecision(pending(), { decision: "reject", reason: "Tonfall zu fordernd" }, now);
    expect(rejected.status).toBe("rejected");
    const reApprove = applyApprovalDecision(rejected, { decision: "approve" }, now);
    expect(reApprove.status).toBe("rejected");
    expect(reApprove.outcome).toContain("unzulaessig");
  });

  it("Ausfuehrung nur nach Freigabe, Ergebnis wird dokumentiert", () => {
    const premature = markExecution(pending(), "ging raus", true, now);
    expect(premature.status).toBe("pending_approval");
    expect(premature.outcome).toContain("verweigert");
    const approved = applyApprovalDecision(pending(), { decision: "approve" }, now);
    const executed = markExecution(approved, "Resend-ID 77", true, now);
    expect(executed.status).toBe("executed");
    expect(executed.outcome).toContain("77");
    expect(markExecution(executed, "nocheinmal", true, now).status).toBe("executed");
  });

  it("Zurueckziehen geht nur vor der Ausfuehrung", () => {
    const approved = applyApprovalDecision(pending(), { decision: "approve" }, now);
    const revoked = applyApprovalDecision(approved, { decision: "revoke" }, now);
    expect(revoked.status).toBe("rejected");
    const executed = markExecution(approved, "ok", true, now);
    expect(applyApprovalDecision(executed, { decision: "revoke" }, now).status).toBe("executed");
  });

  it("Audit-Zeilen sind vollstaendig", () => {
    const line = auditLine(applyApprovalDecision(pending(), { decision: "approve" }, now));
    expect(line).toContain("act-1");
    expect(line).toContain("approved");
    expect(line).toContain("welcome-1");
  });
});
