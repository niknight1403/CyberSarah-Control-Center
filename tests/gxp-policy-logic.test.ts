import { describe, expect, it } from "vitest";
import { detectGxpQualitySignal, evaluateGxpControlledAction, GXP_CONTROLLED_ACTIONS } from "@/lib/gxp-policy-logic";

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

describe("GxP quality signal detection", () => {
  it("flags potential deviations and requires human quality review", () => {
    const result = detectGxpQualitySignal({ message: "Wir melden eine Abweichung im Prozess." });
    expect(result.potentialQualityEvent).toBe(true);
    expect(result.requiresHumanQualityReview).toBe(true);
    expect(result.automaticDispositionAllowed).toBe(false);
  });

  it("does not flag an ordinary support question", () => {
    const result = detectGxpQualitySignal({ message: "Wie ändere ich mein Profilbild?" });
    expect(result.potentialQualityEvent).toBe(false);
    expect(result.requiresHumanQualityReview).toBe(false);
    expect(result.matchedTerms).toEqual([]);
  });
});
