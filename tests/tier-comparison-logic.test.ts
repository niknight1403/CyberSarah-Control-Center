import { describe, it, expect } from "vitest";
import {
  buildComparisonRows,
  formatPriceCell,
  buildTierColumns,
  minimalTierForNeeds,
  isCurrentTierCell,
} from "@/lib/tier-comparison-logic";
import { TIER_ENTITLEMENTS } from "@/lib/subscription-tiers-logic";

describe("Sprint 318 — Tier-Vergleich", () => {
  it("Matrix deckt alle Katalog-Features ueber alle Tiere", () => {
    const rows = buildComparisonRows();
    const allFeatures = [...new Set(Object.values(TIER_ENTITLEMENTS).flat())];
    expect(rows.map((r) => r.feature).sort()).toEqual([...allFeatures].sort());
    for (const row of rows) {
      for (const [tier, has] of Object.entries(row.perTier)) {
        expect(has).toBe(TIER_ENTITLEMENTS[tier as "lite"].includes(row.feature));
      }
    }
  });

  it("Preiszelle bleibt ehrlich: unkonfiguriert = 'im Checkout'", () => {
    expect(formatPriceCell(null)).toContain("Checkout");
    expect(formatPriceCell({ cents: 999, currency: "eur" })).toContain("9,99");
    expect(formatPriceCell({ cents: 999, currency: "eur" })).toContain("Monat");
  });

  it("Spaltenkoepfe bauen Label + Preis je Tier", () => {
    const cols = buildTierColumns({ lite: null, pro: { cents: 1500, currency: "eur" }, expert: null });
    expect(cols.map((c) => c.tier)).toEqual(["lite", "pro", "expert"]);
    const pro = cols.find((c) => c.tier === "pro");
    expect(pro?.priceText).toContain("15,00 EUR");
  });

  it("minimalTierForNeeds findet den kleinsten passenden Tier", () => {
    const anyFeature = TIER_ENTITLEMENTS.lite[0];
    expect(minimalTierForNeeds([anyFeature])).toBe("lite");
    const proOnly = TIER_ENTITLEMENTS.pro.find((f) => !TIER_ENTITLEMENTS.lite.includes(f));
    if (proOnly) expect(minimalTierForNeeds([proOnly])).toBe("pro");
    expect(minimalTierForNeeds(["gibts-nirgends"])).toBeNull();
  });

  it("aktueller Tier laesst sich hervorheben", () => {
    expect(isCurrentTierCell("pro", "pro")).toBe(true);
    expect(isCurrentTierCell("lite", "pro")).toBe(false);
  });
});
