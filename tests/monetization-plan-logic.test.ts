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
