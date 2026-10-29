import { describe, expect, it } from "vitest";
import {
  buildContentAssets, commerceKey, evaluateOffers, simulatePricePlan, taggedOfferId, evaluatePriceTest,
  type CommerceOffer,
} from "../lib/commerce-studio-autopilot-logic";

const offer: CommerceOffer = {
  id: 7, name: "CyberSarah Starter", kind: "digital", status: "active",
  priceCents: 7900, marginPct: 65, targetUrl: "https://example.org/start",
};

describe("Commerce Studio Autopilot: Sicherheit und Umsatzintelligenz", () => {
  it("ordnet nur explizit getaggte Umsatz-Events dem richtigen Angebot zu", () => {
    expect(taggedOfferId("offer:7:reel-02")).toBe(7);
    expect(taggedOfferId("offer:70:reel-02")).toBe(70);
    expect(taggedOfferId("fake:7")).toBeNull();
    expect(taggedOfferId("offer:abc")).toBeNull();
  });
  it("deckt fehlende Kosten nicht durch erfundene Nullwerte ab", () => {
    const result = evaluateOffers([offer], [
      { contentId: "offer:7:reel", eventType: "click", valueCents: 0 },
      { contentId: "offer:7:landing", eventType: "purchase", valueCents: 7900 },
      { contentId: "offer:70:landing", eventType: "purchase", valueCents: 7900 },
    ], []);
    expect(result[0]?.revenueCents).toBe(7900);
    expect(result[0]?.costCents).toBeNull();
    expect(result[0]?.contributionCents).toBeNull();
  });
  it("berechnet Refunds und nachgewiesene Kosten als Deckungsbeitrag", () => {
    const result = evaluateOffers([offer], [
      { contentId: "offer:7:reel", eventType: "purchase", valueCents: 7900 },
      { contentId: "offer:7:reel", eventType: "refund", valueCents: 1800 },
    ], [{ amountCents: 1200, metadata: { offerId: 7 } }]);
    expect(result[0]?.contributionCents).toBe(4900);
    expect(result[0]?.refunds).toBe(1);
  });
  it("empfiehlt bei guter Reichweite ohne Klicks einen Hook-Test statt Preiserhoehung", () => {
    const events = Array.from({ length: 120 }, () => ({
      contentId: "offer:7:reel", eventType: "impression", valueCents: 0,
    }));
    expect(evaluateOffers([offer], events, [])[0]?.nextAction).toBe("TEST_HOOK");
  });
  it("blockiert Preistests ohne echten Preis oder Kosten-/Margenwissen", () => {
    expect(simulatePricePlan({ ...offer, priceCents: null }).mode).toBe("not-eligible");
    expect(simulatePricePlan({ ...offer, marginPct: null }).mode).toBe("not-eligible");
    expect(simulatePricePlan({ ...offer, status: "paused" }).mode).toBe("not-eligible");
  });
  it("macht vor 20 beobachteten Kaeufen keine Preistest-Freigabe moeglich", () => {
    const plan = simulatePricePlan(offer, { measuredPurchases: 2 });
    expect(plan.mode).toBe("measure-first");
    expect(plan.applied).toBe(false);
    expect(plan.recommendedAction).toBe("NO_CHANGE");
  });
  it("erstellt begrenzte Preisvarianten und erfordert weiterhin Freigabe", () => {
    const plan = simulatePricePlan(offer, { measuredPurchases: 25 });
    expect(plan.mode).toBe("experiment-proposal");
    expect(plan.recommendedAction).toBe("RUN_CONTROLLED_EXPERIMENT");
    expect(plan.approvalRequired).toBe(true);
    expect(plan.applied).toBe(false);
    expect(plan.scenarios.map(s => s.priceCents)).toEqual([7110, 7900, 8690]);
    expect(plan.scenarios[1]?.breakEvenRelativeConversion).toBe(1);
  });
  it("limitiert auch vom Admin uebergebenen maximalen Preisunterschied", () => {
    const plan = simulatePricePlan(offer, {
      measuredPurchases: 30, maxRelativeChangePct: 1000,
    });
    expect(plan.scenarios[0]?.priceCents).toBe(6715);
    expect(plan.scenarios[2]?.priceCents).toBe(9085);
  });
  it("baut alle drei Assets mit Attributionskennung und Freigabezwang", () => {
    const payload = buildContentAssets(offer, {
      productCard: "Eine ehrliche Produktbeschreibung",
      reelScript: "Skript mit Hook und CTA",
      landingCopy: "Landingpage mit Nutzen und FAQ",
      hookVariants: ["Hook A", "Hook B"],
      cta: "Mehr erfahren", disclosure: "Werbung, falls erforderlich",
    });
    expect(payload.assets.map(a => a.format)).toEqual([
      "product-card", "reel-script", "reel-hook", "landing-copy",
    ]);
    expect(payload.approvalRequired).toBe(true);
    expect(payload.attributionContentId).toBe("offer:7:commerce");
  });
  it("verwendet kontrollierte Idempotenzschluessel", () => {
    expect(commerceKey(7, "2026-10-29", "price")).toBe("commerce-studio:price:7:2026-10-29");
    expect(() => commerceKey(0, "2026-10-29", "content")).toThrow();
  });
  it("stellt sicher, dass ohne zugeordnete Kosten kein Preisgewinner ausgerufen wird", () => {
    const evidence = evaluatePriceTest([
      { name: "A", priceCents: 7900, visitors: 500, purchases: 25, refundsCents: 0, knownCostsCents: 0, completeCostAttribution: false },
      { name: "B", priceCents: 8900, visitors: 500, purchases: 40, refundsCents: 0, knownCostsCents: 0, completeCostAttribution: false },
    ], "A");
    expect(evidence.status).toBe("NOT_READY");
    expect(evidence.proposedWinner).toBeNull();
    expect(evidence.applied).toBe(false);
  });
  it("verlangt vor Preisentscheidung mindestens 200 Beobachtungen und 10 Kauefe pro Arm", () => {
    const evidence = evaluatePriceTest([
      { name: "A", priceCents: 7900, visitors: 100, purchases: 9, refundsCents: 0, knownCostsCents: 0, completeCostAttribution: true },
      { name: "B", priceCents: 8900, visitors: 100, purchases: 12, refundsCents: 0, knownCostsCents: 0, completeCostAttribution: true },
    ], "A");
    expect(evidence.status).toBe("NOT_READY");
  });
  it("schlaegt einen Preisgewinner nur mit starken konservativen Evidenzen zur Freigabe vor", () => {
    const evidence = evaluatePriceTest([
      { name: "A", priceCents: 7900, visitors: 1000, purchases: 50, refundsCents: 0, knownCostsCents: 0, completeCostAttribution: true },
      { name: "B", priceCents: 8900, visitors: 1000, purchases: 150, refundsCents: 0, knownCostsCents: 0, completeCostAttribution: true },
    ], "A");
    expect(evidence.status).toBe("REVIEW_WINNER");
    expect(evidence.proposedWinner).toBe("B");
    expect(evidence.requiresHumanApproval).toBe(true);
    expect(evidence.applied).toBe(false);
  });

});
