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
});
