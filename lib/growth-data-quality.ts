import type { GrowthMetrics } from "./always-on-growth-logic";

export type GrowthQualityReport = {
  status: "valid" | "review" | "blocked";
  errors: string[];
  warnings: string[];
  observedCounters: number;
  reviewedAt: string;
};
const counterKeys = [
  "impressions", "views", "clicks", "leads", "purchases", "refunds",
  "published", "failed", "pendingContentDrafts", "pendingRevenueDrafts", "activeExperiments",
] as const;
export function auditGrowthMetrics(data: GrowthMetrics, at = new Date(), source?: { jobsTruncated?: boolean; invalidInsightValues?: number }): GrowthQualityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const key of counterKeys) {
    const n = data[key];
    if (!Number.isSafeInteger(n) || n < 0) errors.push(key + ": kein nichtnegativer, sicherer Zaehler");
  }
  if (!Number.isSafeInteger(data.confirmedRevenueCents)) {
    errors.push("confirmedRevenueCents: keine sichere ganzzahlige Minor-Unit");
  }
  if (!errors.length) {
    if (data.impressions === 0 && (data.views > 0 || data.clicks > 0)) warnings.push("Reichweite ohne Impressionen: Tracking-Basis abgleichen");
    if (data.clicks === 0 && data.leads > 0) warnings.push("Leads ohne Klickdaten: Quellenzuordnung unvollstaendig");
    if (data.leads === 0 && data.purchases > 0) warnings.push("Kaeufe ohne Leads: Funnel-Attribution unvollstaendig");
    // Different sources, attribution windows and delayed events can explain these
    // discrepancies. Never silently correct or label them as fraud.
    if (data.views > data.impressions && data.impressions > 0) {
      warnings.push("Views ueber Impressionen: Quellen und Messfenster abgleichen");
    }
    if (data.leads > data.clicks && data.clicks > 0) {
      warnings.push("Leads ueber Klicks: kanalbezogene Attribution pruefen");
    }
    if (data.purchases > data.leads && data.leads > 0) {
      warnings.push("Kaeufe ueber Leads: Attribution und Funnel-Definition pruefen");
    }
    if (data.refunds > data.purchases && data.purchases > 0) {
      warnings.push("Refunds ueber Kaeufen: Periodenversatz und Refund-Kohorte pruefen");
    }
  }
  if (source?.jobsTruncated) warnings.push("Publishing-Job-Abfrage ist auf 5000 Eintraege begrenzt; Verlauf unvollstaendig");
  if ((source?.invalidInsightValues ?? 0) > 0) warnings.push("Plattformdaten enthalten verworfene, ungueltige Kennzahlen");
  return {
    status: errors.length ? "blocked" : warnings.length ? "review" : "valid",
    errors, warnings, observedCounters: counterKeys.length,
    reviewedAt: at.toISOString(),
  };
}
