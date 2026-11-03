import { describe, expect, it } from "vitest";
import { planForBillingPrice } from "../lib/monetization-logic";

describe("billing price to monetization plan", () => {
  const configured = { lite: "price_lite", pro: "price_pro", expert: "price_expert" };
  it("maps each configured paid price to its exact tier", () => {
    expect(planForBillingPrice("price_lite", configured)).toBe("lite");
    expect(planForBillingPrice("price_pro", configured)).toBe("pro");
    expect(planForBillingPrice("price_expert", configured)).toBe("expert");
  });
  it("does not grant paid entitlements for missing or unknown prices", () => {
    expect(planForBillingPrice(null, configured)).toBe("free");
    expect(planForBillingPrice("price_unknown", configured)).toBe("free");
    expect(planForBillingPrice("price_lite", {})).toBe("free");
  });
});

import { consumeQuota, freshAccountState, PLAN_LIMITS, ensureAdminElitePlan } from "../lib/monetization-logic";

describe("cloud quota accounting", () => {
  it("charges monthly overflow to credits instead of exceeding the monthly cap", () => {
    const state = {
      ...freshAccountState(),
      plan: "lite" as const,
      dayCloudTokens: 1_000,
      monthCloudTokens: PLAN_LIMITS.lite.monthlyCloudTokens - 10,
      creditBalanceTokens: 100,
    };
    const updated = consumeQuota(state, 50);
    expect(updated.monthCloudTokens).toBe(PLAN_LIMITS.lite.monthlyCloudTokens);
    expect(updated.dayCloudTokens).toBe(1_010);
    expect(updated.creditBalanceTokens).toBe(60);
  });

  it("never burns admin credits even when usage exceeds published limits", () => {
    const admin = {
      ...ensureAdminElitePlan(freshAccountState()),
      creditBalanceTokens: 12_345,
    };
    const updated = consumeQuota(admin, PLAN_LIMITS.expert.monthlyCloudTokens * 2);
    expect(updated.creditBalanceTokens).toBe(12_345);
    expect(updated.monthCloudTokens).toBe(PLAN_LIMITS.expert.monthlyCloudTokens * 2);
  });
});
