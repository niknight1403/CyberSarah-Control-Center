import { describe, expect, it } from "vitest";
import { evaluateGxpControlledAction, GXP_CONTROLLED_ACTIONS } from "@/lib/gxp-policy-logic";

describe("GxP controlled-action policy", () => {
  it("fails closed for every controlled action while approval is unverified", () => {
    for (const action of GXP_CONTROLLED_ACTIONS) {
      const result = evaluateGxpControlledAction({
        action,
        approvalWorkflowVerified: false,
        auditStoreAvailable: true,
      });
      expect(result.decision).toBe("block");
      expect(result.executable).toBe(false);
    }
  });

  it("fails closed when the audit store is unavailable", () => {
    const result = evaluateGxpControlledAction({
      action: "batch_release",
      approvalWorkflowVerified: true,
      auditStoreAvailable: false,
    });
    expect(result.decision).toBe("block");
    expect(result.executable).toBe(false);
    expect(result.reason).toContain("Audit-Speicher");
  });

  it("does not enable execution solely because an approval workflow is reported", () => {
    const result = evaluateGxpControlledAction({
      action: "capa_approval",
      approvalWorkflowVerified: true,
      auditStoreAvailable: true,
    });
    expect(result.decision).toBe("block");
    expect(result.executable).toBe(false);
  });
});
