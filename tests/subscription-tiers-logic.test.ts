import { describe, expect, it } from "vitest";

import {
  SUBSCRIPTION_TIERS,
  entitlementsForRole,
  entitlementsForTier,
  evaluateTierChange,
  isSubscriptionTier,
  isTierDowngrade,
  isTierUpgrade,
  tierFromPriceId,
  tierHasEntitlement,
  tierPriceId,
} from "../lib/subscription-tiers-logic";

const ENV = {
  STRIPE_PRICE_ID_LITE: "price_lite_111",
  STRIPE_PRICE_ID_PRO: "price_pro_222",
  STRIPE_PRICE_ID_EXPERT: "price_expert_333",
};

describe("subscription-tiers-logic", () => {
  it("definiert die drei Tarifstufen in aufsteigender Ordnung", () => {
    expect(SUBSCRIPTION_TIERS).toEqual(["lite", "pro", "expert"]);
  });

  it("liest konfigurierte Preis-IDs je Stufe", () => {
    expect(tierPriceId("lite", ENV)).toBe("price_lite_111");
    expect(tierPriceId("expert", ENV)).toBe("price_expert_333");
    expect(tierPriceId("pro", {})).toBeNull();
  });

  it("leitet die Stufe aus einer Preis-ID ab und faellt auf lite zurueck", () => {
    expect(tierFromPriceId("price_pro_222", ENV)).toBe("pro");
    expect(tierFromPriceId("price_expert_333", ENV)).toBe("expert");
    expect(tierFromPriceId("price_unbekannt", ENV)).toBe("lite");
    expect(tierFromPriceId(null, ENV)).toBe("lite");
  });

  it("schaltet Entitlements je Stufe treppig frei", () => {
    expect(tierHasEntitlement("lite", "chat")).toBe(true);
    expect(tierHasEntitlement("lite", "agent")).toBe(false);
    expect(tierHasEntitlement("pro", "agent")).toBe(true);
    expect(tierHasEntitlement("pro", "ki_provider")).toBe(false);
    expect(tierHasEntitlement("expert", "ki_provider")).toBe(true);
  });

  it("gibt Administratoren immer die vollen Rechte (Superadmin)", () => {
    expect(entitlementsForRole("admin", "lite")).toEqual(entitlementsForTier("expert"));
    expect(entitlementsForRole("user", "lite")).toEqual(entitlementsForTier("lite"));
  });

  it("bewertet Upgrade, Downgrade und Cross-Grade", () => {
    expect(isTierUpgrade("lite", "pro")).toBe(true);
    expect(isTierUpgrade("pro", "lite")).toBe(false);
    expect(isTierDowngrade("expert", "lite")).toBe(true);
    const upgrade = evaluateTierChange("lite", "expert");
    expect(upgrade.allowed && upgrade.immediate).toBe(true);
    const downgrade = evaluateTierChange("expert", "lite");
    expect(downgrade.allowed).toBe(true);
    expect(downgrade.allowed && downgrade.immediate).toBe(false);
    const same = evaluateTierChange("pro", "pro");
    expect(same.allowed).toBe(true);
  });

  it("validiert Stufen-Eingaben", () => {
    expect(isSubscriptionTier("pro")).toBe(true);
    expect(isSubscriptionTier("business")).toBe(false);
    expect(isSubscriptionTier(42)).toBe(false);
  });
});
