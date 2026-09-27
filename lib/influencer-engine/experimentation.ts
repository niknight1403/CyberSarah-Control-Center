export type ExperimentVariant = {
  id: string;
  hook: string;
  change: "hook" | "cta" | "visual";
};

export function buildHookExperiment(topic: string): ExperimentVariant[] {
  const clean = topic.trim();
  return [
    { id: "A", hook: `Die 3 häufigsten Irrtümer zu ${clean} — in 20 Sekunden.`, change: "hook" },
    { id: "B", hook: `Bevor du einen Tipp zu ${clean} ausprobierst: prüfe diese 1 Sache.`, change: "hook" },
    { id: "C", hook: `Was bei ${clean} plausibel klingt — und was tatsächlich belegt ist.`, change: "hook" },
  ];
}

export function chooseVariantByMetric(metrics: Record<string, number>): string | null {
  const entries = Object.entries(metrics).filter(([, value]) => Number.isFinite(value));
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}
