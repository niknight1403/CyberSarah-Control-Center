/**
 * CyberSarah Commerce Studio – deterministische, testbare Entscheidungslogik.
 * Keine Preis- oder Publishing-Aktion in dieser Datei.
 */
export type CommerceOffer = {
  id: number;
  name: string;
  kind: string;
  status: string;
  priceCents: number | null;
  marginPct: number | null;
  targetUrl: string | null;
};
export type CommerceEvent = { contentId: string; eventType: string; valueCents: number };
export type CommerceCost = { amountCents: number; metadata: Record<string, unknown> };
export type CommerceBundle = {
  productCard: string;
  reelScript: string;
  landingCopy: string;
  hookVariants: [string, string];
  cta: string;
  disclosure: string;
};
export type OfferPerformance = {
  id: number; name: string; status: string; priceCents: number | null;
  impressions: number; clicks: number; leads: number; purchases: number;
  refunds: number; revenueCents: number; refundCents: number;
  costCents: number | null; contributionCents: number | null;
  ctrPct: number | null; clickToPurchasePct: number | null;
  evidence: "missing" | "low" | "measured";
  nextAction: "MEASURE" | "TEST_HOOK" | "TEST_LANDING" | "REVIEW_SCALE" | "HOLD";
  reason: string;
};
export type PriceScenario = {
  priceCents: number;
  grossMarginPct: number;
  contributionPerOrderCents: number;
  grossContributionFor100OrdersCents: number;
  breakEvenRelativeConversion: number | null;
  assumption: "conversion-held-constant";
};
export type PricePlan = {
  offerId: number; baselinePriceCents: number | null;
  mode: "not-eligible" | "measure-first" | "experiment-proposal";
  reason: string; scenarios: PriceScenario[];
  recommendedAction: "NO_CHANGE" | "RUN_CONTROLLED_EXPERIMENT";
  approvalRequired: true;
  applied: false;
};
const safe = (v: number) => Number.isFinite(v) ? Math.max(0, v) : 0;
const ratioPct = (a: number, b: number): number | null =>
  b > 0 ? Number((100 * a / b).toFixed(2)) : null;
export function taggedOfferId(contentId: string): number | null {
  const match = /^offer:(\d+)(?::|$)/.exec(contentId);
  return match ? Number(match[1]) : null;
}
export function commerceKey(offerId: number, day: string, kind: "content" | "price"): string {
  if (!Number.isSafeInteger(offerId) || offerId < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error("Ungueltiger Angebotsschluessel.");
  }
  return "commerce-studio:" + kind + ":" + offerId + ":" + day;
}
export function evaluateOffers(
  offers: CommerceOffer[], events: CommerceEvent[], costs: CommerceCost[],
): OfferPerformance[] {
  const byId = new Map<number, CommerceEvent[]>();
  for (const event of events) {
    const id = taggedOfferId(event.contentId);
    if (id === null) continue;
    const group = byId.get(id) ?? [];
    group.push(event);
    byId.set(id, group);
  }
  return offers.map(offer => {
    const own = byId.get(offer.id) ?? [];
    const number = (type: string) => own.filter(item => item.eventType === type).length;
    const impressions = number("impression"), clicks = number("click");
    const leads = number("lead"), purchases = number("purchase"), refunds = number("refund");
    const revenueCents = own.filter(item => item.eventType === "purchase")
      .reduce((sum, item) => sum + safe(item.valueCents), 0);
    const refundCents = own.filter(item => item.eventType === "refund")
      .reduce((sum, item) => sum + safe(item.valueCents), 0);
    const ownCosts = costs.filter(item =>
      item.metadata.offerId === offer.id || item.metadata.offerId === String(offer.id));
    const costCents = ownCosts.length
      ? ownCosts.reduce((sum, item) => sum + safe(item.amountCents), 0) : null;
    const contributionCents = costCents === null
      ? null : revenueCents - refundCents - costCents;
    const evidence: OfferPerformance["evidence"] =
      impressions >= 200 && clicks >= 20 ? "measured" : own.length ? "low" : "missing";
    let nextAction: OfferPerformance["nextAction"] = "MEASURE";
    let reason = "Keine ausreichend zugeordneten Ereignisse. Tracking und Attribution pruefen.";
    if (offer.status !== "active") {
      nextAction = "HOLD"; reason = "Angebot ist nicht aktiv.";
    } else if (impressions >= 100 && clicks < 3) {
      nextAction = "TEST_HOOK"; reason = "Reel-Hooks und Zielgruppenansprache testen.";
    } else if (clicks >= 30 && purchases === 0) {
      nextAction = "TEST_LANDING"; reason = "Landingpage, Angebot und Checkout testen.";
    } else if (evidence === "measured" && purchases >= 3 &&
      contributionCents !== null && contributionCents > 0) {
      nextAction = "REVIEW_SCALE";
      reason = "Gemessener positiver Deckungsbeitrag: Skalierungsversuch nur nach Freigabe.";
    }
    return { id: offer.id, name: offer.name, status: offer.status,
      priceCents: offer.priceCents, impressions, clicks, leads, purchases, refunds,
      revenueCents, refundCents, costCents, contributionCents, evidence,
      ctrPct: ratioPct(clicks, impressions),
      clickToPurchasePct: ratioPct(purchases, clicks), nextAction, reason };
  }).sort((a, b) => a.id - b.id);
}
/**
 * Relative Conversion am Gewinnschwellenpunkt im Vergleich zur Basis.
 * Dies ist nur Szenariorechnung, keine empirische Nachfragekurve.
 */
export function simulatePricePlan(
  offer: CommerceOffer,
  options: { minMarginPct?: number; maxRelativeChangePct?: number; measuredPurchases?: number } = {},
): PricePlan {
  const no = (reason: string): PricePlan => ({ offerId: offer.id,
    baselinePriceCents: offer.priceCents, mode: "not-eligible", reason,
    scenarios: [], recommendedAction: "NO_CHANGE", approvalRequired: true, applied: false });
  if (offer.status !== "active") return no("Angebot ist nicht aktiv.");
  const price = offer.priceCents;
  if (price === null || !Number.isSafeInteger(price) || price <= 0) {
    return no("Kein gueltiger Live-Preis vorhanden.");
  }
  if (offer.marginPct === null || !Number.isFinite(offer.marginPct) ||
    offer.marginPct <= 0 || offer.marginPct > 100) {
    return no("Variable Marge fehlt: ohne Kostenwissen keine sichere Preisempfehlung.");
  }
  const minMargin = Math.max(0, Math.min(100, options.minMarginPct ?? 20));
  const range = Math.max(1, Math.min(15, options.maxRelativeChangePct ?? 10));
  const perOrderCosts = Math.round(price * (1 - offer.marginPct / 100));
  const baseContribution = price - perOrderCosts;
  const multipliers = [1 - range / 100, 1, 1 + range / 100];
  const scenarios = multipliers.map(scale => {
    const candidate = Math.max(1, Math.round(price * scale));
    const contribution = candidate - perOrderCosts;
    return {
      priceCents: candidate,
      grossMarginPct: Number((100 * contribution / candidate).toFixed(2)),
      contributionPerOrderCents: contribution,
      grossContributionFor100OrdersCents: contribution * 100,
      breakEvenRelativeConversion: contribution > 0
        ? Number((baseContribution / contribution).toFixed(3)) : null,
      assumption: "conversion-held-constant" as const,
    };
  }).filter(scenario => scenario.grossMarginPct >= minMargin);
  const measured = safe(options.measuredPurchases ?? 0);
  // Never claim an optimum from a price simulation. Real randomised price-test data
  // and permissions are required before determining a winner.
  return { offerId: offer.id, baselinePriceCents: price,
    mode: measured < 20 ? "measure-first" : "experiment-proposal",
    reason: measured < 20
      ? "Weniger als 20 zugeordnete Kaeufe: Preiswirkung noch nicht belastbar. Erst messen."
      : "Preisvarianten sind unverbindliche Szenarien mit konstant angenommener Conversion. A/B-Test und Freigabe erforderlich.",
    scenarios, recommendedAction: measured < 20 ? "NO_CHANGE" : "RUN_CONTROLLED_EXPERIMENT",
    approvalRequired: true, applied: false };
}
export function buildContentAssets(offer: CommerceOffer, bundle: CommerceBundle) {
  return {
    personaId: "commerce-studio",
    platform: "instagram",
    topic: ("Produktkampagne · " + offer.name).slice(0, 300),
    content: bundle.reelScript,
    assets: [
      { format: "product-card", variant: 1, title: offer.name, content: bundle.productCard, cta: bundle.cta },
      { format: "reel-script", variant: 1, title: "Reel", content: bundle.reelScript, cta: bundle.cta },
      { format: "reel-hook", variant: 2, title: "A/B Hooks", content: bundle.hookVariants.join("\n\n") },
      { format: "landing-copy", variant: 1, title: "Landingpage", content: bundle.landingCopy, cta: bundle.cta },
    ],
    disclosure: bundle.disclosure,
    offerId: offer.id,
    attributionContentId: "offer:" + offer.id + ":commerce",
    approvalRequired: true,
  };
}
