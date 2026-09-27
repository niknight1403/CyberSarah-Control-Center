/**
 * Sprint 372 — Provider-Rotation v2: Qualitäts-/Kosten-Metriken je Provider
 *
 * Dynamische Auswahl und Rotation von Modell-Providern basierend auf Echtzeit-Metriken
 * für Kosten (per 1k Tokens), Latenz (p90/p95), Fehlerquoten, Qualitäts-Scores
 * und geforderten Features (z. B. Function Calling, Vision, Streaming).
 */

export type ProviderFeature = "tool_calling" | "vision" | "structured_json" | "streaming";

export type ProviderProfile = {
  id: string;
  name: string;
  costPer1kInputTokens: number;  // in USD
  costPer1kOutputTokens: number; // in USD
  avgLatencyMs: number;
  errorRate: number;            // 0..1 (0% bis 100%)
  qualityScore: number;         // 0..100
  maxContextTokens: number;
  supportedFeatures: ProviderFeature[];
  isAvailable: boolean;
  consecutiveErrorCount: number;
};

export type SelectionPriority = "cost" | "speed" | "quality" | "balanced";

export type ProviderSelectionCriteria = {
  requiredFeatures?: ProviderFeature[];
  maxCostPerRequestUSD?: number;
  maxLatencyMs?: number;
  minQualityScore?: number;
  minContextTokens?: number;
  priority?: SelectionPriority;
};

export type ProviderExecutionLog = {
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  qualityRating?: number; // 0..100
  timestamp?: number;
};

export type ProviderSelectionResult = {
  selectedProvider: ProviderProfile;
  estimatedCostUSD: number;
  selectionScore: number; // Höher = besser
  reason: string;
  fallbackProviders: ProviderProfile[];
};

/**
 * Berechnet die geschätzten Kosten für eine Anfrage.
 */
export function estimateRequestCostUSD(
  provider: ProviderProfile,
  estimatedInputTokens: number,
  estimatedOutputTokens: number
): number {
  const inputCost = (estimatedInputTokens / 1000) * provider.costPer1kInputTokens;
  const outputCost = (estimatedOutputTokens / 1000) * provider.costPer1kOutputTokens;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Bewertet ein Provider-Profil anhand der vorgegebenen Priorität (0..100 Score).
 */
export function calculateProviderScore(
  provider: ProviderProfile,
  priority: SelectionPriority = "balanced"
): number {
  if (!provider.isAvailable || provider.errorRate >= 0.5) {
    return 0; // Nicht verfügbar oder zu hohe Fehlerquote
  }

  // Normierte Teil-Scores (0..100)
  const qualityPart = provider.qualityScore;
  const reliabilityPart = Math.max(0, (1 - provider.errorRate) * 100);

  // Latenz-Score: 100 bei 0ms, 0 bei >= 5000ms
  const latencyPart = Math.max(0, 100 - (provider.avgLatencyMs / 5000) * 100);

  // Kosten-Score: 100 bei $0/1k, 0 bei $0.05/1k Output
  const avgCostPer1k = (provider.costPer1kInputTokens + provider.costPer1kOutputTokens) / 2;
  const costPart = Math.max(0, 100 - (avgCostPer1k / 0.05) * 100);

  switch (priority) {
    case "cost":
      return Math.round(costPart * 0.5 + reliabilityPart * 0.3 + qualityPart * 0.2);
    case "speed":
      return Math.round(latencyPart * 0.5 + reliabilityPart * 0.3 + qualityPart * 0.2);
    case "quality":
      return Math.round(qualityPart * 0.6 + reliabilityPart * 0.3 + costPart * 0.1);
    case "balanced":
    default:
      return Math.round(qualityPart * 0.35 + reliabilityPart * 0.25 + costPart * 0.2 + latencyPart * 0.2);
  }
}

/**
 * Wählt den optimalen Provider basierend auf harten Kriterien und Gewichtung aus.
 */
export function selectOptimalProvider(
  providers: ProviderProfile[],
  criteria: ProviderSelectionCriteria,
  estimatedTokens = { input: 1000, output: 500 }
): ProviderSelectionResult {
  if (!providers || providers.length === 0) {
    throw new Error("Keine Provider im System registriert.");
  }

  const reqFeatures = criteria.requiredFeatures ?? [];
  const minContext = criteria.minContextTokens ?? 0;
  const minQuality = criteria.minQualityScore ?? 0;
  const maxLatency = criteria.maxLatencyMs ?? Infinity;

  // Hard Filtering
  const eligibleProviders = providers.filter((p) => {
    if (!p.isAvailable) return false;
    if (p.errorRate >= 0.5) return false; // Über 50% Ausfälle = ausgeschlossen
    if (p.maxContextTokens < minContext) return false;
    if (p.qualityScore < minQuality) return false;
    if (p.avgLatencyMs > maxLatency) return false;

    // Feature-Prüfung
    const hasAllFeatures = reqFeatures.every((feat) => p.supportedFeatures.includes(feat));
    if (!hasAllFeatures) return false;

    // Budget-Prüfung
    if (criteria.maxCostPerRequestUSD !== undefined) {
      const cost = estimateRequestCostUSD(p, estimatedTokens.input, estimatedTokens.output);
      if (cost > criteria.maxCostPerRequestUSD) return false;
    }

    return true;
  });

  if (eligibleProviders.length === 0) {
    throw new Error(
      `Kein Provider erfüllt die geforderten Kriterien (Features: [${reqFeatures.join(", ")}], MinQuality: ${minQuality}).`
    );
  }

  // Scoring
  const priority = criteria.priority ?? "balanced";
  const scored = eligibleProviders.map((p) => ({
    provider: p,
    score: calculateProviderScore(p, priority),
    cost: estimateRequestCostUSD(p, estimatedTokens.input, estimatedTokens.output),
  }));

  // Absteigend nach Score sortieren
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const fallbacks = scored.slice(1).map((s) => s.provider);

  const reason = `Provider '${best.provider.name}' gewählt (Score: ${best.score}/100, Est. Cost: $${best.cost}, Prio: ${priority}).`;

  return {
    selectedProvider: best.provider,
    estimatedCostUSD: best.cost,
    selectionScore: best.score,
    reason,
    fallbackProviders: fallbacks,
  };
}

/**
 * Aktualisiert die Metriken eines Providers nach der Ausführung.
 */
export function recordProviderExecution(
  provider: ProviderProfile,
  log: ProviderExecutionLog
): ProviderProfile {
  const isSuccess = log.success;
  const consecutiveErrors = isSuccess ? 0 : provider.consecutiveErrorCount + 1;

  // Verfügbarkeit pausieren bei 3 aufeinanderfolgenden Fehlern
  const isAvailable = consecutiveErrors < 3;

  // Exponentieller gleitender Mittelwert für Latenz (Alpha = 0.2)
  const newAvgLatency = Math.round(provider.avgLatencyMs * 0.8 + log.latencyMs * 0.2);

  // Gleitende Fehlerquote
  const newErrorRate = Number((provider.errorRate * 0.85 + (isSuccess ? 0 : 0.15)).toFixed(3));

  // Qualitäts-Score anpassen, falls explizites Feedback vorliegt
  let newQualityScore = provider.qualityScore;
  if (log.qualityRating !== undefined) {
    newQualityScore = Math.round(provider.qualityScore * 0.8 + log.qualityRating * 0.2);
  }

  return {
    ...provider,
    avgLatencyMs: newAvgLatency,
    errorRate: newErrorRate,
    qualityScore: newQualityScore,
    consecutiveErrorCount: consecutiveErrors,
    isAvailable,
  };
}
