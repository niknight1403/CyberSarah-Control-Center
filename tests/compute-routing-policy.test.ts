import { describe, expect, it } from "vitest";
import { ComputeTier } from "../server/compute-cascading-router";
import { canUseTier, estimateMaximumPaidCost } from "../server/compute-routing-policy";

const base = { id: "task-1", prompt: "Hello", maxTokens: 1000, allowPaid: true, maxCostUSD: 0.01 } as const;
const pricing = { inputUsdPerMillion: 1, outputUsdPerMillion: 2 };

describe("compute routing security policy", () => {
  it("allows only local inference for air-gapped tasks", () => {
    const task = { ...base, privacy: "air-gapped" as const };
    expect(canUseTier(task, ComputeTier.TIER_1_LOCAL, pricing)).toBe(true);
    expect(canUseTier(task, ComputeTier.TIER_2_FREE_CLOUD, pricing)).toBe(false);
    expect(canUseTier(task, ComputeTier.TIER_3_PAID_API, pricing)).toBe(false);
  });
  it("rejects paid inference unless explicitly approved and priced", () => {
    expect(canUseTier({ ...base, allowPaid: false }, ComputeTier.TIER_3_PAID_API, pricing)).toBe(false);
    expect(canUseTier(base, ComputeTier.TIER_3_PAID_API)).toBe(false);
    expect(canUseTier({ ...base, maxCostUSD: 0.0001 }, ComputeTier.TIER_3_PAID_API, pricing)).toBe(false);
    expect(canUseTier(base, ComputeTier.TIER_3_PAID_API, pricing)).toBe(true);
  });
  it("rejects invalid pricing and output bounds", () => {
    expect(estimateMaximumPaidCost(base, { inputUsdPerMillion: NaN, outputUsdPerMillion: 2 })).toBeNull();
    expect(estimateMaximumPaidCost({ ...base, maxTokens: 9000 }, pricing)).toBeNull();
    expect(estimateMaximumPaidCost(base, pricing)).toBeGreaterThan(0);
  });
});
