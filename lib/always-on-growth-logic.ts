/**
 * Growth intelligence: first fix data reliability, then grow the measurable funnel.
 * This is a planning / prioritisation engine. No forecast, hidden spend or publishing.
 */
export type GrowthMetrics = {
  impressions: number; views: number; clicks: number; leads: number;
  purchases: number; refunds: number; confirmedRevenueCents: number;
  published: number; failed: number;
  pendingContentDrafts: number; pendingRevenueDrafts: number; activeExperiments: number;
};
export type GrowthFocus =
  | "DATA" | "RELIABILITY" | "QUEUE" | "REACH" | "HOOKS" | "CTA"
  | "LANDING" | "OFFER" | "PROFIT_EVIDENCE";
export type GrowthPlan = {
  focus: GrowthFocus; title: string; reason: string; experiment: string;
  primaryMetric: string; evidence: "none" | "low" | "measured";
  stage: "observe" | "repair" | "experiment";
  nextActions: string[];
  approvalRequiredForExternalActions: true;
  spendingAuthorized: false; publishingAuthorized: false; priceChangesAuthorized: false;
};
const valid = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
const pct = (part: number, whole: number) => whole > 0 ? part * 100 / whole : null;
const round = (value: number) => Number(value.toFixed(2));
export function decideGrowthPlan(data: GrowthMetrics): GrowthPlan {
  const impressions = valid(data.impressions), views = valid(data.views);
  const clicks = valid(data.clicks), leads = valid(data.leads);
  const purchases = valid(data.purchases), failed = valid(data.failed);
  const published = valid(data.published);
  const pending = valid(data.pendingContentDrafts) + valid(data.pendingRevenueDrafts);
  const active = valid(data.activeExperiments);
  const evidence: GrowthPlan["evidence"] = impressions >= 1000 && clicks >= 20 ? "measured" :
    impressions > 0 || clicks > 0 ? "low" : "none";
  const common = {
    evidence, approvalRequiredForExternalActions: true as const,
    spendingAuthorized: false as const, publishingAuthorized: false as const,
    priceChangesAuthorized: false as const,
  };
  if (pending >= 8 || active >= 6) return {
    ...common, focus: "QUEUE", stage: "repair", title: "Freigaben und Experimente abbauen",
    reason: "Zu viele Entwuerfe oder gleichzeitige Experimente; mehr Content wuerde den Stau nur verstaerken.",
    experiment: "Vorliegende Entwuerfe sichten, genehmigen oder verwerfen; laufende Tests auswerten.",
    primaryMetric: "pending drafts and active experiments",
    nextActions: ["Offene Freigaben priorisieren", "Experimente abschliessen", "Erst danach neuen Content vorbereiten"],
  };
  const attempts = published + failed;
  if (attempts >= 5 && failed / attempts > 0.15) return {
    ...common, focus: "RELIABILITY", stage: "repair", title: "Ausspielung stabilisieren",
    reason: "Der belegte Anteil fehlgeschlagener Publishing-Jobs ist zu hoch.",
    experiment: "Wiederkehrende Fehlerklassen isolieren und im Sandbox-Publishing beheben.",
    primaryMetric: "successful published jobs / attempted jobs",
    nextActions: ["Fehlerprotokolle gruppieren", "Verbindung und Tokens pruefen", "Sandbox-Tests vor neuem Rollout"],
  };
  if (impressions < 1000) return {
    ...common, focus: "REACH", stage: "observe", title: "Qualifizierte Reichweite aufbauen",
    reason: "Wenige gemessene Impressionen; Conversion-Aussagen waeren verfrueht.",
    experiment: "Drei klar unterschiedliche Hooks als Freigabeentwuerfe vorbereiten und spaeter organisch testen.",
    primaryMetric: "qualified impressions",
    nextActions: ["Plattform-Insights verifizieren", "Drei Hook-Entwuerfe vorbereiten", "Reichweite je Kanal erfassen"],
  };
  const viewRate = pct(views, impressions);
  if (viewRate !== null && viewRate < 5) return {
    ...common, focus: "HOOKS", stage: "experiment", title: "Hook und Thumbnail testen",
    reason: "Ausreichende Impressionen, aber ein niedriger beobachteter View-Anteil.",
    experiment: "Einen Thumbnail-/Hook-Test bei vergleichbarer Distribution als Entwurf vorbereiten.",
    primaryMetric: "views / impressions", nextActions: ["Creative-Varianten erzeugen", "Marken- und Bildrechte pruefen", "Viewrate messen"],
  };
  const clickRate = pct(clicks, views > 0 ? views : impressions);
  if (views >= 200 && clickRate !== null && clickRate < 1) return {
    ...common, focus: "CTA", stage: "experiment", title: "Klickabsicht verbessern",
    reason: "Aufmerksamkeit ist gemessen, qualifizierte Klicks bleiben niedrig.",
    experiment: "Einen passenden CTA gegen eine Kontrollvariante testen.",
    primaryMetric: "qualified clicks / views",
    nextActions: ["CTA passend zum Angebot formulieren", "Landing-Ziel pruefen", "Klickdaten vergleichen"],
  };
  const leadRate = pct(leads, clicks);
  if (clicks >= 20 && leadRate !== null && leadRate < 20) return {
    ...common, focus: "LANDING", stage: "experiment", title: "Landingpage verbessern",
    reason: "Klicks sind vorhanden, aber zu wenige gemessene Leads.",
    experiment: "Eine Value-Proposition oder Formular-Reibung isoliert testen.",
    primaryMetric: "leads / clicks",
    nextActions: ["Mobilen Funnel pruefen", "Landing-Variante entwerfen", "Consent und Attribution kontrollieren"],
  };
  const saleRate = pct(purchases, leads);
  if (leads >= 20 && saleRate !== null && saleRate < 3) return {
    ...common, focus: "OFFER", stage: "experiment", title: "Angebots-Fit optimieren",
    reason: "Interessenten sind vorhanden, aber die beobachtete Kaufquote ist niedrig.",
    experiment: "Produkt-Match und Preisdarstellung vergleichen, ohne Live-Preise zu veraendern.",
    primaryMetric: "confirmed purchases / leads",
    nextActions: ["Kauf- und Refund-Signale pruefen", "Produktnutzen erklaeren", "Kontrollierten Test entwerfen"],
  };
  return {
    ...common, focus: purchases > 0 ? "PROFIT_EVIDENCE" : "DATA",
    stage: "observe", title: "Profitabilitaet und Datenqualitaet absichern",
    reason: purchases > 0
      ? "Umsatzereignisse liegen vor, aber ein positiver Deckungsbeitrag laesst sich ohne vollstaendige Kosten nicht annehmen."
      : "Keine belastbare Kaufstrecke belegt; zunaechst Tracking und Checkout validieren.",
    experiment: "Kosten, Refunds und Attribution pro Angebot vollstaendig messen und dann kontrollierte Gewinner identifizieren.",
    primaryMetric: "verified contribution per qualified visitor",
    nextActions: ["Kosten- und Refund-Abdeckung pruefen", "Attribution validieren", "Nur belegte Varianten priorisieren"],
  };
}
export function growthPulseFingerprint(input: GrowthMetrics): string {
  const step = (value: number, chunk: number) => Math.floor(valid(value) / chunk) * chunk;
  return [
    step(input.impressions, 250), step(input.views, 50), step(input.clicks, 5),
    step(input.leads, 5), valid(input.purchases), valid(input.refunds),
    step(input.confirmedRevenueCents, 1000), valid(input.failed),
    valid(input.pendingContentDrafts), valid(input.pendingRevenueDrafts),
    valid(input.activeExperiments),
  ].join(":");
}
export function growthRateCard(input: GrowthMetrics) {
  return {
    viewRatePct: input.impressions > 0 ? round(100 * valid(input.views) / input.impressions) : null,
    clickRatePct: input.views > 0 ? round(100 * valid(input.clicks) / input.views) : null,
    leadRatePct: input.clicks > 0 ? round(100 * valid(input.leads) / input.clicks) : null,
    purchaseRatePct: input.leads > 0 ? round(100 * valid(input.purchases) / input.leads) : null,
    knownNetRevenueCents: input.confirmedRevenueCents,
    profitabilityVerified: false as const,
  };
}
