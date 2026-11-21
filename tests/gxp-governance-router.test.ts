import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendGxpAuditEvent: vi.fn(),
  verifyGxpAuditChain: vi.fn(),
  getCxCaseById: vi.fn(),
}));

vi.mock("../server/gxp-audit-store", () => ({
  appendGxpAuditEvent: mocks.appendGxpAuditEvent,
  verifyGxpAuditChain: mocks.verifyGxpAuditChain,
}));
vi.mock("../server/cx-workforce-store", () => ({
  CxCaseRecordValidationError: class CxCaseRecordValidationError extends Error {},
  getCxCaseById: mocks.getCxCaseById,
}));

import { CxCaseRecordValidationError } from "../server/cx-workforce-store";
import { gxpGovernanceRouter } from "../server/gxp-governance-router";

const adminContext = {
  req: {} as never,
  res: {} as never,
  user: { id: 7, role: "admin" } as never,
};

describe("GxP governance router audit behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appendGxpAuditEvent.mockResolvedValue({ id: 42, eventHash: "a".repeat(64) });
    mocks.getCxCaseById.mockResolvedValue({
      id: "b".repeat(32),
      triage: { category: "security", priority: "critical" },
    });
  });

  it("records a successful assessment and returns its audit reference", async () => {
    const caller = gxpGovernanceRouter.createCaller(adminContext);
    const result = await caller.evaluateGate({
      framework: "GxP_GENERIC",
      activity: "support_escalation",
      sopReference: "SOP-1",
      evidenceReferences: ["EV-1"],
    });

    expect(result.status).toBe("human_review_required");
    expect(result.auditEventId).toBe(42);
    expect(mocks.appendGxpAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 7,
      assessmentStatus: "human_review_required",
      eventPayload: expect.objectContaining({ automationMode: "assessment_only", allowedToExecute: false }),
    }));
  });

  it("audits rejected opaque references without persisting the rejected value", async () => {
    const caller = gxpGovernanceRouter.createCaller(adminContext);
    await expect(caller.evaluateGate({
      framework: "GDP",
      activity: "quality_event",
      evidenceReferences: ["person@example.com"],
    })).rejects.toThrow(/opaque identifiers/);

    expect(mocks.appendGxpAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 7,
      framework: "GDP",
      activity: "quality_event",
      assessmentStatus: "input_rejected",
      missingControls: ["input_validation_failed"],
      eventPayload: expect.objectContaining({
        rejectionReason: "opaque_reference_validation_failed",
        automationMode: "assessment_only",
      }),
    }));
    expect(JSON.stringify(mocks.appendGxpAuditEvent.mock.calls)).not.toContain("person@example.com");
  });

  it("fails closed when the rejected-input audit event cannot be persisted", async () => {
    mocks.appendGxpAuditEvent.mockRejectedValueOnce(new Error("audit database unavailable"));
    const caller = gxpGovernanceRouter.createCaller(adminContext);

    await expect(caller.evaluateGate({
      framework: "GDP",
      activity: "quality_event",
      sopReference: "free form value",
    })).rejects.toThrow("audit database unavailable");
  });

  it("audits rejected CX-linked assessments without copying customer data", async () => {
    const caller = gxpGovernanceRouter.createCaller(adminContext);
    await expect(caller.assessCxCase({
      caseId: "b".repeat(32),
      framework: "GMP",
      activity: "deviation",
      sopReference: "customer@example.com",
    })).rejects.toThrow(/opaque identifier/);

    expect(mocks.appendGxpAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      assessmentStatus: "input_rejected",
      eventPayload: expect.not.objectContaining({ relatedRecordId: "b".repeat(32) }),
    }));
    expect(JSON.stringify(mocks.appendGxpAuditEvent.mock.calls)).not.toContain("customer@example.com");
  });
  it("audits malformed persisted CX records without exposing stored values", async () => {
    mocks.getCxCaseById.mockRejectedValueOnce(
      new CxCaseRecordValidationError("invalid stored CX case"),
    );
    const caller = gxpGovernanceRouter.createCaller(adminContext);

    await expect(caller.assessCxCase({
      caseId: "b".repeat(32),
      framework: "GMP",
      activity: "deviation",
    })).rejects.toThrow("invalid stored CX case");

    expect(mocks.appendGxpAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 7,
      framework: "GMP",
      activity: "deviation",
      assessmentStatus: "input_rejected",
      missingControls: ["input_validation_failed"],
      eventPayload: expect.objectContaining({
        rejectionReason: "opaque_reference_validation_failed",
        allowedToExecute: false,
        automationMode: "assessment_only",
      }),
    }));
    expect(JSON.stringify(mocks.appendGxpAuditEvent.mock.calls)).not.toContain("invalid stored CX case");
  });

  it("does not misclassify CX database failures as rejected input", async () => {
    mocks.getCxCaseById.mockRejectedValueOnce(new Error("CX database unavailable"));
    const caller = gxpGovernanceRouter.createCaller(adminContext);

    await expect(caller.assessCxCase({
      caseId: "b".repeat(32),
      framework: "GMP",
      activity: "deviation",
    })).rejects.toThrow("CX database unavailable");
    expect(mocks.appendGxpAuditEvent).not.toHaveBeenCalled();
  });

});
