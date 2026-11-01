export type ContentMetrics = {
  views: number;
  averageWatchSeconds: number;
  durationSeconds: number;
  saves: number;
  shares: number;
  clicks: number;
};

export type Feedback = {
  retentionRate: number;
  saveRate: number;
  shareRate: number;
  clickRate: number;
  recommendations: string[];
};

const rate = (part: number, total: number) => total > 0 ? Math.round(part / total * 1000) / 10 : 0;

export function analyzeContentMetrics(metrics: ContentMetrics): Feedback {
  const retentionRate = metrics.durationSeconds > 0 ? Math.min(100, rate(metrics.averageWatchSeconds, metrics.durationSeconds)) : 0;
  const saveRate = rate(metrics.saves, metrics.views);
  const shareRate = rate(metrics.shares, metrics.views);
  const clickRate = rate(metrics.clicks, metrics.views);
  const recommendations: string[] = [];
  if (retentionRate < 45) recommendations.push("Hook in den ersten 2-3 Sekunden kürzen und konkreter machen.");
  if (saveRate < 1) recommendations.push("Mehr speicherbaren Nutzwert liefern: Checkliste, Schritte oder Quellen.");
  if (shareRate < 0.5) recommendations.push("Social Utility erhöhen: klarer Mythos, Vergleich oder weiterleitbarer Merksatz.");
  if (clickRate < 1) recommendations.push("CTA und Angebots-Fit prüfen, ohne Druck oder Dark Patterns.");
  if (!recommendations.length) recommendations.push("Format beibehalten und mit einer einzelnen Variable weiter testen.");
  return { retentionRate, saveRate, shareRate, clickRate, recommendations };
}
