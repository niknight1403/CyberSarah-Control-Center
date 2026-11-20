import { describe, expect, it } from "vitest";
import { evaluateGxpGate } from "@/lib/gxp-governance";

describe("GxP governance gate", () => {
  it("blocks a document change without controlled evidence and change control", () => {
    const result = evaluateGxpGate({ framework: "GMP", activity: "document_change", actorId: "author-1" });
    expect(result.status).toBe("blocked");
    expect(result.allowedToExecute).toBe(false);
    expect(result.missingControls).toContain("controlled_sop_reference");
    expect(result.missingControls).toContain("traceable_evidence");
    expect(result.missingControls).toContain("approved_change_control_reference");
  });

  it("never executes or marks a release ready without a trusted approval workflow", () => {
    const result = evaluateGxpGate({
      framework: "GMP", activity: "release", actorId: "author-1",
      sopReference: "SOP-12", changeControlReference: "CC-42",
      evidenceReferences: ["evidence-1"], riskLevel: "critical",
    });
    expect(result.status).toBe("blocked");
    expect(result.missingControls).toContain("two_distinct_quality_approvers");
    expect(result.allowedToExecute).toBe(false);
    expect(result.humanApprovalRequired).toBe(true);
    expect(result.automationMode).toBe("assessment_only");
    expect(result.distinctApproverCount).toBe(0);
  });

  it("does not accept client-declared approvers as quality approvals", () => {
    const result = evaluateGxpGate({
      framework: "GxP_GENERIC", activity: "capa", actorId: "author-1",
      sopReference: "SOP-1", evidenceReferences: ["ev-1"],
    });
    expect(result.status).toBe("blocked");
    expect(result.missingControls).toContain("two_distinct_quality_approvers");
  });

  it("rejects free-form evidence references that could contain personal data", () => {
    expect(() => evaluateGxpGate({
      framework: "GDP", activity: "quality_event", actorId: "user-1",
      evidenceReferences: ["customer@example.com"],
    })).toThrow(/opaque identifiers/);
  });

  it("requires human review for ordinary support escalations", () => {
    const result = evaluateGxpGate({
      framework: "GxP_GENERIC", activity: "support_escalation", actorId: "agent-1",
      sopReference: "SOP-4", evidenceReferences: ["ticket-12"],
    });
    expect(result.status).toBe("human_review_required");
    expect(result.allowedToExecute).toBe(false);
  });
});
