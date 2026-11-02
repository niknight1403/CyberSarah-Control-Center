import { describe, expect, it } from "vitest";
import { assessAiInfluenzaLaunchReadiness } from "../lib/ai-influenza-launch-readiness-logic";

describe("AI Influenza revenue launch gate", () => {
  it("does not mistake four image briefs for four rendered images", () => {
    const result = assessAiInfluenzaLaunchReadiness("starter");
    expect(result.readyForUnattendedFulfilment).toBe(false);
    expect(result.gaps.find((gap) => gap.taskKind === "ai-image")).toMatchObject({ quantity: 4 });
  });

  it("does not mistake video pipeline wiring for delivered videos", () => {
    const result = assessAiInfluenzaLaunchReadiness("growth");
    expect(result.readyForUnattendedFulfilment).toBe(false);
    expect(result.gaps.find((gap) => gap.taskKind === "short-video")).toMatchObject({ quantity: 12 });
  });

  it("keeps custom services gated until fulfilment is evidenced", () => {
    const result = assessAiInfluenzaLaunchReadiness("business");
    expect(result.readyForUnattendedFulfilment).toBe(false);
    expect(result.gaps.length).toBeGreaterThan(0);
  });
  it("requires verified customer-approved evidence for every contracted deliverable", () => {
    const partial = assessAiInfluenzaLaunchReadiness("starter", [
      { taskKind: "content-post", deliveredQuantity: 12, verified: true, customerApproved: true },
      { taskKind: "ai-image", deliveredQuantity: 4, verified: false, customerApproved: true },
      { taskKind: "content-plan", deliveredQuantity: 1, verified: true, customerApproved: true },
    ]);
    expect(partial.readyForUnattendedFulfilment).toBe(false);
    expect(partial.gaps.map((gap) => gap.taskKind)).toContain("ai-image");

    const complete = assessAiInfluenzaLaunchReadiness("starter", [
      { taskKind: "content-post", deliveredQuantity: 12, verified: true, customerApproved: true },
      { taskKind: "ai-image", deliveredQuantity: 4, verified: true, customerApproved: true },
      { taskKind: "content-plan", deliveredQuantity: 1, verified: true, customerApproved: true },
    ]);
    expect(complete.readyForUnattendedFulfilment).toBe(true);
  });

  it("rejects unapproved or insufficient delivery evidence", () => {
    const result = assessAiInfluenzaLaunchReadiness("growth", [
      { taskKind: "short-video", deliveredQuantity: 11, verified: true, customerApproved: true },
      { taskKind: "content-post", deliveredQuantity: 20, verified: true, customerApproved: false },
      { taskKind: "monthly-report", deliveredQuantity: 1, verified: true, customerApproved: true },
    ]);
    expect(result.gaps.map((gap) => gap.taskKind)).toEqual(["short-video", "content-post"]);
  });
});
