export type LatencySample = {
  providerId: string;
  latencyMs: number;
  timestampMs: number;
};

export type ProviderScore = {
  providerId: string;
  score: number;
  sampleCount: number;
  lastSampleAgeMs: number | null;
  recommendation: "preferred" | "acceptable" | "degraded" | "stale";
};

export type RankingConfig = {
  nowMs: number;
  maxSampleAgeMs: number;
  degradedThresholdMs: number;
};

/**
 * Bewertet Provider anhand gemessener Latenzwerte mit exponentiell
 * gewichteter Mittelung (EWMA): Neuere Messungen zählen stärker, Ausreißer
 * werden durch die Gewichtung gedämpft. Veraltete Messungen (älter als
 * `maxSampleAgeMs`) fließen nicht in die Bewertung ein.
 */
export function rankProviders(samples: LatencySample[], config: RankingConfig): ProviderScore[] {
  if (!Array.isArray(samples)) {
    throw new Error("Messwerte müssen ein Array sein.");
  }
  const { nowMs, maxSampleAgeMs, degradedThresholdMs } = config;
  if (!Number.isFinite(maxSampleAgeMs) || maxSampleAgeMs <= 0) {
    throw new Error("Das maximale Messalter muss positiv sein.");
  }
  if (!Number.isFinite(degradedThresholdMs) || degradedThresholdMs <= 0) {
    throw new Error("Die Degradationsschwelle muss positiv sein.");
  }

  const byProvider = new Map<string, LatencySample[]>();
  for (const sample of samples) {
    if (!Number.isFinite(sample.latencyMs) || sample.latencyMs < 0 || !Number.isFinite(sample.timestampMs)) {
      continue;
    }
    const list = byProvider.get(sample.providerId) ?? [];
    list.push(sample);
    byProvider.set(sample.providerId, list);
  }

  const scores: ProviderScore[] = [];
  for (const [providerId, providerSamples] of byProvider) {
    const fresh = providerSamples
      .filter((sample) => nowMs - sample.timestampMs < maxSampleAgeMs)
      .sort((a, b) => a.timestampMs - b.timestampMs);

    if (fresh.length === 0) {
      scores.push({
        providerId,
        score: 0,
        sampleCount: 0,
        lastSampleAgeMs: null,
        recommendation: "stale",
      });
      continue;
    }

    const ewmaAlpha = 0.3;
    let score = fresh[0].latencyMs;
    for (let index = 1; index < fresh.length; index += 1) {
      score = ewmaAlpha * fresh[index].latencyMs + (1 - ewmaAlpha) * score;
    }

    const lastSampleAgeMs = nowMs - fresh[fresh.length - 1].timestampMs;
    const recommendation: ProviderScore["recommendation"] =
      score <= degradedThresholdMs * 0.5
        ? "preferred"
        : score <= degradedThresholdMs
          ? "acceptable"
          : "degraded";

    scores.push({ providerId, score: Math.round(score * 100) / 100, sampleCount: fresh.length, lastSampleAgeMs, recommendation });
  }

  const recommendationOrder: Record<ProviderScore["recommendation"], number> = {
    preferred: 0,
    acceptable: 1,
    degraded: 2,
    stale: 3,
  };

  return scores.sort((a, b) => {
    const delta = recommendationOrder[a.recommendation] - recommendationOrder[b.recommendation];
    if (delta !== 0) {
      return delta;
    }
    if (a.recommendation === "stale" && b.recommendation === "stale") {
      return a.providerId.localeCompare(b.providerId);
    }
    return a.score - b.score;
  });
}

export type FallbackAdvice = {
  primaryProviderId: string | null;
  fallbackProviderId: string | null;
  reason: string;
};

/**
 * Leitet aus dem Ranking eine begründete Fallback-Empfehlung ab: Der beste
 * nicht-degradierte Provider wird primär, der nächstbeste als Fallback. Ohne
 * nutzbare Provider bleibt die Empfehlung leer und damit ehrlich.
 */
export function adviseFallback(ranking: ProviderScore[]): FallbackAdvice {
  const usable = ranking.filter((score) => score.recommendation === "preferred" || score.recommendation === "acceptable");
  if (usable.length === 0) {
    return {
      primaryProviderId: null,
      fallbackProviderId: null,
      reason: "Kein Anbieter mit ausreichender Latenz verfügbar.",
    };
  }
  const [primary, secondary] = usable;
  return {
    primaryProviderId: primary.providerId,
    fallbackProviderId: secondary?.providerId ?? null,
    reason: secondary
      ? `${primary.providerId} ist primär; ${secondary.providerId} ist Fallback.`
      : `${primary.providerId} ist primär; kein weiterer Anbieter als Fallback verfügbar.`,
  };
}
