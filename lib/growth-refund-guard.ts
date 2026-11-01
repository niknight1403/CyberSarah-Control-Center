import type { GrowthMetrics, GrowthPlan } from "./always-on-growth-logic";
/** Prioritise documented refunds before extending sales. This is not a fraud detector. */
export function refundRiskPlan(s: GrowthMetrics): GrowthPlan | null {
  const purchases = s.purchases, refunds = s.refunds;
  if (!Number.isSafeInteger(purchases) || !Number.isSafeInteger(refunds) ||
      purchases < 5 || refunds < 3 || refunds / purchases < 0.2) return null;
  return {
    focus: "REFUNDS", title: "Refunds und Angebotsqualitaet pruefen",
    reason: "Hoher Refund-Anteil im Messfenster; Kauf- und Refund-Kohorten koennen zeitversetzt sein.",
    experiment: "Erstattungsgruende, Produktversprechen und Support-Faelle vergleichen, ohne neue bezahlte Kampagnen.",
    primaryMetric: "refunds / confirmed purchases (same cohort after reconciliation)",
    evidence: purchases >= 20 ? "measured" : "low",
    stage: "repair",
    nextActions: [
      "Refund-Zuordnung pro Bestellung und Zeitraum pruefen",
      "Produktversprechen mit Lieferung und Rueckfragen abgleichen",
      "Erst nach geklaertem Refund-Risiko Wachstumstests vorbereiten",
    ],
    approvalRequiredForExternalActions: true,
    spendingAuthorized: false, publishingAuthorized: false, priceChangesAuthorized: false,
  };
}
