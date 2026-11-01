/**
 * Revenue-Autopilot — reine, deterministische Priorisierung realer Umsatzsignale.
 *
 * Keine Umsatzprognosen, keine erfundenen Benchmarks: die Default-Ziele sind
 * interne Optimierungsziele und koennen spaeter konfiguriert werden.
 */

import type { RevenueHub } from "./draft-engine-logic";

export type RevenueAutopilotSnapshot = {
  landingViews: number | null;
  signups: number | null;
  checkoutStarts: number | null;
  upgrades: number | null;
  stripeCheckoutStarted: number | null;
  stripeCheckoutCompleted: number | null;
  stripeCheckoutSuccessRate: number | null;
  invoiceSuccessRate: number | null;
  invoiceAttempts: number | null;
  mrrEur: number | null;
  newMrr1dEur: number | null;
  newMrr7dEur: number | null;
  activeSubscriptions: number | null;
  affiliateClicks: number | null;
  affiliateConversions: number | null;
  crossSellRecommended: number | null;
  crossSellConverted: number | null;
  validatedExpansionOpportunities: number | null;
  haraOpenProposals: number | null;
};

export type RevenueAutopilotTargets = {
  signupRatePct: number;
  checkoutStartRatePct: number;
  upgradeRatePct: number;
  checkoutSuccessRatePct: number;
  invoiceSuccessRatePct: number;
  affiliateConversionRatePct: number;
  crossSellConversionRatePct: number;
};

export const DEFAULT_REVENUE_AUTOPILOT_TARGETS: RevenueAutopilotTargets = {
  signupRatePct: 15,
  checkoutStartRatePct: 12,
  upgradeRatePct: 8,
  checkoutSuccessRatePct: 70,
  invoiceSuccessRatePct: 92,
  affiliateConversionRatePct: 2,
  crossSellConversionRatePct: 5,
};

export type RevenueOpportunity = {
  key: string;
  hub: RevenueHub;
  title: string;
  score: number;
  evidence: "high" | "medium" | "low";
  metric: string;
  baseline: string;
  target: string;
  rationale: string;
  stages: string[];
  /** Vollstaendiger, direkt in Loop Engineering uebernehmbarer Experimentplan. */
  experiment: string;
  unit: string;
  targetValue: number;
  currentValue: number;
};

function pct(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || !Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

function fmtPct(value: number | null): string {
  return value === null ? "nicht messbar" : `${value.toFixed(1)} %`;
}

function gapScore(current: number, target: number, weight = 1): number {
  if (target <= 0) return 0;
  const gap = Math.max(0, target - current) / target;
  return Math.round(Math.min(100, gap * 100 * weight));
}

function evidenceFor(denominator: number): RevenueOpportunity["evidence"] {
  if (denominator >= 100) return "high";
  if (denominator >= 20) return "medium";
  return "low";
}

function addRateOpportunity(args: {
  list: RevenueOpportunity[];
  key: string;
  hub: RevenueHub;
  title: string;
  current: number | null;
  denominator: number;
  target: number;
  weight?: number;
  metric: string;
  rationale: string;
  stages: string[];
}) {
  if (args.current === null || args.denominator < 5 || args.current >= args.target) return;
  args.list.push({
    key: args.key,
    hub: args.hub,
    title: args.title,
    score: gapScore(args.current, args.target, args.weight ?? 1),
    evidence: evidenceFor(args.denominator),
    metric: args.metric,
    baseline: fmtPct(args.current),
    target: `${args.target.toFixed(1)} % internes Optimierungsziel`,
    rationale: args.rationale,
    stages: args.stages,
    experiment: `Kontrollierte Variante testen und ${args.metric} im gleichen Messfenster gegen die Baseline vergleichen.`,
    unit: "%",
    targetValue: args.target,
    currentValue: args.current,
  });
}

export function buildRevenueOpportunities(
  snapshot: RevenueAutopilotSnapshot,
  targets: RevenueAutopilotTargets = DEFAULT_REVENUE_AUTOPILOT_TARGETS,
): RevenueOpportunity[] {
  const list: RevenueOpportunity[] = [];

  const signupRate = pct(snapshot.signups, snapshot.landingViews);
  addRateOpportunity({
    list,
    key: "funnel.signup",
    hub: "saas",
    title: "Landing → Signup verbessern",
    current: signupRate,
    denominator: snapshot.landingViews ?? 0,
    target: targets.signupRatePct,
    weight: 0.9,
    metric: "Signup-Rate Landing → Registrierung",
    rationale: "Es liegen echte Landing- und Signup-Ereignisse vor; die interne Zielrate ist noch nicht erreicht.",
    stages: ["Top-Landing mit groesstem Drop analysieren", "Eine Value-Proposition/CTA-Variante testen", "Signup-Rate nach Testfenster vergleichen"],
  });

  const checkoutStartRate = pct(snapshot.checkoutStarts, snapshot.signups);
  addRateOpportunity({
    list,
    key: "funnel.checkout-start",
    hub: "saas",
    title: "Signup → Checkout aktivieren",
    current: checkoutStartRate,
    denominator: snapshot.signups ?? 0,
    target: targets.checkoutStartRatePct,
    weight: 1,
    metric: "Checkout-Start-Rate aus Signups",
    rationale: "Registrierungen werden gemessen, aber zu wenige erreichen den Checkout relativ zum internen Ziel.",
    stages: ["Upgrade-Trigger und Paywall-Kontext pruefen", "Eine klarere Nutzen-/Preis-Variante testen", "Checkout-Starts gegen vorheriges Fenster messen"],
  });

  const upgradeRate = pct(snapshot.upgrades, snapshot.checkoutStarts);
  addRateOpportunity({
    list,
    key: "funnel.upgrade",
    hub: "saas",
    title: "Checkout → Upgrade steigern",
    current: upgradeRate,
    denominator: snapshot.checkoutStarts ?? 0,
    target: targets.upgradeRatePct,
    weight: 1.2,
    metric: "Upgrade-Rate aus Checkout-Starts",
    rationale: "Checkout-Starts sind vorhanden; der Abschluss bis zum Upgrade kann messbar verbessert werden.",
    stages: ["Abbruchpunkte im Checkout pruefen", "Eine risikoarme Checkout-/Angebotsvariante testen", "Upgrade-Rate nach gleichem Traffic-Fenster vergleichen"],
  });

  if (snapshot.stripeCheckoutSuccessRate !== null && (snapshot.stripeCheckoutStarted ?? 0) >= 5) {
    addRateOpportunity({
      list,
      key: "stripe.checkout-completion",
      hub: "saas",
      title: "Stripe-Checkout-Abschluss stabilisieren",
      current: snapshot.stripeCheckoutSuccessRate,
      denominator: snapshot.stripeCheckoutStarted ?? 0,
      target: targets.checkoutSuccessRatePct,
      weight: 1.25,
      metric: "Stripe Checkout completed / started",
      rationale: "Stripe liefert echte Checkout-Sessions; ein Teil der gestarteten Sessions wird nicht abgeschlossen.",
      stages: ["Fehler-/Abbruchmuster der Sessions pruefen", "Checkout-Reibung und Zahlungsoptionen kontrollieren", "Abschlussrate im naechsten Fenster vergleichen"],
    });
  }

  if (snapshot.invoiceSuccessRate !== null) {
    addRateOpportunity({
      list,
      key: "saas.invoice-reliability",
      hub: "saas",
      title: "Abo-Zahlungserfolg verbessern",
      current: snapshot.invoiceSuccessRate,
      denominator: snapshot.invoiceAttempts ?? 0,
      target: targets.invoiceSuccessRatePct,
      weight: 1.15,
      metric: "Erfolgsquote Subscription-Invoices",
      rationale: "Fehlgeschlagene Abo-Rechnungen reduzieren realisierten Umsatz; hier ist ein messbarer Hebel vorhanden.",
      stages: ["Fehlgeschlagene Rechnungsgruende gruppieren", "Dunning/Retry-Kommunikation pruefen", "Invoice-Erfolgsquote im Folgefenster messen"],
    });
  }

  const affiliateRate = snapshot.affiliateClicks === null || snapshot.affiliateConversions === null
    ? null
    : pct(snapshot.affiliateConversions, snapshot.affiliateClicks);
  addRateOpportunity({
    list,
    key: "affiliate.conversion",
    hub: "hara",
    title: "Affiliate-Conversion verbessern",
    current: affiliateRate,
    denominator: snapshot.affiliateClicks ?? 0,
    target: targets.affiliateConversionRatePct,
    weight: 1.1,
    metric: "Affiliate-Conversions / Klicks",
    rationale: "Affiliate-Klicks und Conversions liegen als reale Daten vor; die Conversion kann experimentell optimiert werden.",
    stages: ["Top-Traffic-Angebote nach Fit sortieren", "Eine Landing-/CTA-Variante pro Angebot testen", "Conversion je Angebot vergleichen"],
  });

  const crossSellRate = snapshot.crossSellRecommended === null || snapshot.crossSellConverted === null
    ? null
    : pct(snapshot.crossSellConverted, snapshot.crossSellRecommended);
  addRateOpportunity({
    list,
    key: "cross-sell.conversion",
    hub: "loop",
    title: "Cross-Sell-Loop verbessern",
    current: crossSellRate,
    denominator: snapshot.crossSellRecommended ?? 0,
    target: targets.crossSellConversionRatePct,
    weight: 1.05,
    metric: "Cross-Sell-Conversions / Empfehlungen",
    rationale: "Empfehlungen und Conversions werden gemessen; niedriger Fit kann gezielt getestet werden.",
    stages: ["Regeln nach Empfehlung→Conversion sortieren", "Schwache Regel mit besserem Produkt-Fit ersetzen", "Conversion nach Testfenster vergleichen"],
  });

  if (snapshot.validatedExpansionOpportunities === 0) {
    list.push({
      key: "expansion.discovery",
      hub: "loop",
      title: "Validierte Expansion-Chance finden",
      score: 55,
      evidence: "low",
      metric: "Anzahl validierter Expansion-Chancen",
      baseline: "0 validierte Chancen",
      target: "mindestens 1 validierte Chance",
      rationale: "Aktuell ist keine validierte Expansion-Chance sichtbar. Discovery ist sinnvoll, aber noch kein Umsatzbeweis.",
      stages: ["Expansion-Scan ausfuehren", "Chancen nach Datenbelegen priorisieren", "Nur eine belegte Chance als Experiment freigeben"],
      experiment: "Expansion-Scan ausfuehren und genau eine datenbelegte Chance bis zur Validierungsentscheidung pruefen.",
      unit: "Chancen",
      targetValue: 1,
      currentValue: 0,
    });
  }

  if (snapshot.landingViews === 0 && snapshot.signups === 0 && snapshot.checkoutStarts === 0) {
    list.push({
      key: "instrumentation.funnel",
      hub: "saas",
      title: "Revenue-Funnel messbar machen",
      score: 80,
      evidence: "low",
      metric: "Landing-, Signup- und Checkout-Events",
      baseline: "keine Funnel-Ereignisse",
      target: "messbare Tages-Buckets vorhanden",
      rationale: "Ohne Funnel-Ereignisse kann der Autopilot keine Conversion-Luecken datenbasiert optimieren.",
      stages: ["Event-Tracking auf Kernseiten verifizieren", "Landing/Signup/Checkout-Endpunkte testen", "Erst danach Conversion-Experimente priorisieren"],
      experiment: "Kern-Events Ende-zu-Ende ausloesen und einen vollstaendigen Tages-Bucket fuer Landing, Signup und Checkout verifizieren.",
      unit: "Event-Buckets",
      targetValue: 1,
      currentValue: 0,
    });
  }

  return list
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, 8);
}

export function revenueAutopilotStatus(opportunities: RevenueOpportunity[]): "healthy" | "optimize" | "instrument" {
  if (opportunities.some((item) => item.key === "instrumentation.funnel")) return "instrument";
  if (opportunities.length === 0) return "healthy";
  return "optimize";
}
