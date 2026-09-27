export type TrendSignal = {
  topic: string;
  velocity: number;
  engagement: number;
  saturation: number;
  euRelevance: number;
};

export type TrendScore = TrendSignal & {
  score: number;
  opportunity: "low" | "medium" | "high";
};

const clamp = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

export function scoreTrend(signal: TrendSignal): TrendScore {
  const velocity = clamp(signal.velocity);
  const engagement = clamp(signal.engagement);
  const saturation = clamp(signal.saturation);
  const euRelevance = clamp(signal.euRelevance);
  const score = Math.round((velocity * 0.3 + engagement * 0.3 + euRelevance * 0.3 + (100 - saturation) * 0.1) * 10) / 10;
  return {
    topic: signal.topic.trim(),
    velocity,
    engagement,
    saturation,
    euRelevance,
    score,
    opportunity: score >= 72 ? "high" : score >= 48 ? "medium" : "low",
  };
}

export function rankTrends(signals: TrendSignal[], limit = 5): TrendScore[] {
  return signals
    .filter((item) => item.topic.trim().length >= 3)
    .map(scoreTrend)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(20, limit)));
}
