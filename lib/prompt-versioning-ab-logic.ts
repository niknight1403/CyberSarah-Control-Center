/**
 * Sprint 364 — Prompt-Versionierung + A/B-Vergleichsmetrik
 *
 * Verwaltet Prompt-Varianten und deren Ausführungsmetriken für A/B-Tests.
 * Erlaubt das Vergleichen von Erfolgsraten, Qualitäts-Scores, Latenzen und Token-Verbrauch
 * mit ehrlichen Schwellenwerten (z. B. Mindeststichprobengröße).
 */

export type PromptVariant = {
  id: string;
  name: string;
  promptText: string;
  version: string;
  isControl: boolean;
  active: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type ExecutionMetric = {
  id: string;
  variantId: string;
  timestamp: string;
  success: boolean;
  score?: number; // 0..100
  latencyMs?: number;
  tokenCount?: number;
  taskCompleted?: boolean;
  errorReason?: string;
};

export type ABTestMetricTarget = "successRate" | "score" | "latency" | "completionRate";

export type ABTestConfig = {
  minSampleSize: number; // Mindestanzahl Ausführungen pro Variante (z. B. 10)
  scoreDiffThreshold: number; // Mindestdifferenz für statistische Relevanz (z. B. 5%)
  targetMetric: ABTestMetricTarget;
};

export const DEFAULT_AB_CONFIG: ABTestConfig = {
  minSampleSize: 10,
  scoreDiffThreshold: 5.0,
  targetMetric: "successRate",
};

export type VariantSummary = {
  variantId: string;
  name: string;
  version: string;
  totalExecutions: number;
  successRate: number; // 0..100 (%)
  averageScore: number; // 0..100
  p95LatencyMs: number;
  averageTokens: number;
  completionRate: number; // 0..100 (%)
};

export type ABTestResult = {
  status: "insufficient_data" | "conclusive" | "no_significant_difference";
  winningVariantId?: string;
  winningVariantName?: string;
  scoreDiff?: number;
  metricName: ABTestMetricTarget;
  summaryA: VariantSummary;
  summaryB: VariantSummary;
  recommendation: string;
};

/**
 * Erstellt eine neue Prompt-Variante mit Zeitstempel.
 */
export function createPromptVariant(
  params: Omit<PromptVariant, "createdAt"> & { createdAt?: string }
): PromptVariant {
  return {
    ...params,
    createdAt: params.createdAt || new Date().toISOString(),
  };
}

/**
 * Fügt eine Ausführungsmetrik zur Metriken-Sammlung hinzu.
 */
export function recordExecutionMetric(
  existingMetrics: ExecutionMetric[],
  newMetric: Omit<ExecutionMetric, "id" | "timestamp"> & { id?: string; timestamp?: string }
): ExecutionMetric[] {
  const metric: ExecutionMetric = {
    ...newMetric,
    id: newMetric.id || `metric-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: newMetric.timestamp || new Date().toISOString(),
  };
  return [...existingMetrics, metric];
}

/**
 * Berechnet aggregierte Leistungskennzahlen für eine Prompt-Variante.
 */
export function summarizeVariant(
  variant: PromptVariant,
  metrics: ExecutionMetric[]
): VariantSummary {
  const variantMetrics = metrics.filter((m) => m.variantId === variant.id);
  const totalExecutions = variantMetrics.length;

  if (totalExecutions === 0) {
    return {
      variantId: variant.id,
      name: variant.name,
      version: variant.version,
      totalExecutions: 0,
      successRate: 0,
      averageScore: 0,
      p95LatencyMs: 0,
      averageTokens: 0,
      completionRate: 0,
    };
  }

  const successCount = variantMetrics.filter((m) => m.success).length;
  const completedCount = variantMetrics.filter((m) => m.taskCompleted ?? m.success).length;
  
  const scores = variantMetrics
    .map((m) => m.score)
    .filter((s): s is number => typeof s === "number");
  const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const latencies = variantMetrics
    .map((m) => m.latencyMs)
    .filter((l): l is number => typeof l === "number")
    .sort((a, b) => a - b);
  
  let p95LatencyMs = 0;
  if (latencies.length > 0) {
    const index = Math.min(Math.floor(latencies.length * 0.95), latencies.length - 1);
    p95LatencyMs = latencies[index];
  }

  const tokens = variantMetrics
    .map((m) => m.tokenCount)
    .filter((t): t is number => typeof t === "number");
  const averageTokens = tokens.length > 0 ? tokens.reduce((a, b) => a + b, 0) / tokens.length : 0;

  return {
    variantId: variant.id,
    name: variant.name,
    version: variant.version,
    totalExecutions,
    successRate: Math.round((successCount / totalExecutions) * 1000) / 10,
    averageScore: Math.round(averageScore * 10) / 10,
    p95LatencyMs: Math.round(p95LatencyMs),
    averageTokens: Math.round(averageTokens),
    completionRate: Math.round((completedCount / totalExecutions) * 1000) / 10,
  };
}

/**
 * Führt den A/B-Vergleich zweier Prompt-Varianten durch.
 */
export function evaluateABTest(
  variantA: PromptVariant,
  variantB: PromptVariant,
  metrics: ExecutionMetric[],
  config: Partial<ABTestConfig> = {}
): ABTestResult {
  const mergedConfig: ABTestConfig = { ...DEFAULT_AB_CONFIG, ...config };
  const summaryA = summarizeVariant(variantA, metrics);
  const summaryB = summarizeVariant(variantB, metrics);

  if (
    summaryA.totalExecutions < mergedConfig.minSampleSize ||
    summaryB.totalExecutions < mergedConfig.minSampleSize
  ) {
    return {
      status: "insufficient_data",
      metricName: mergedConfig.targetMetric,
      summaryA,
      summaryB,
      recommendation: `Nicht genügend Daten (mindestens ${mergedConfig.minSampleSize} Ausführungen pro Variante erforderlich. Aktuell: A=${summaryA.totalExecutions}, B=${summaryB.totalExecutions}).`,
    };
  }

  let valA = 0;
  let valB = 0;
  let lowerIsBetter = false;

  switch (mergedConfig.targetMetric) {
    case "successRate":
      valA = summaryA.successRate;
      valB = summaryB.successRate;
      break;
    case "score":
      valA = summaryA.averageScore;
      valB = summaryB.averageScore;
      break;
    case "completionRate":
      valA = summaryA.completionRate;
      valB = summaryB.completionRate;
      break;
    case "latency":
      valA = summaryA.p95LatencyMs;
      valB = summaryB.p95LatencyMs;
      lowerIsBetter = true;
      break;
  }

  const scoreDiff = lowerIsBetter ? valA - valB : valB - valA;
  const absDiff = Math.abs(scoreDiff);

  if (absDiff < mergedConfig.scoreDiffThreshold) {
    return {
      status: "no_significant_difference",
      scoreDiff: Math.round(scoreDiff * 10) / 10,
      metricName: mergedConfig.targetMetric,
      summaryA,
      summaryB,
      recommendation: `Kein signifikanter Unterschied für ${mergedConfig.targetMetric} (Differenz: ${Math.round(absDiff * 10) / 10}%, Schwelle: ${mergedConfig.scoreDiffThreshold}%). Behalte Standard bei.`,
    };
  }

  const winnerIsB = lowerIsBetter ? valB < valA : valB > valA;
  const winner = winnerIsB ? variantB : variantA;

  return {
    status: "conclusive",
    winningVariantId: winner.id,
    winningVariantName: winner.name,
    scoreDiff: Math.round(scoreDiff * 10) / 10,
    metricName: mergedConfig.targetMetric,
    summaryA,
    summaryB,
    recommendation: `Variante '${winner.name}' (${winner.version}) ist gewinnend für Metrik '${mergedConfig.targetMetric}' mit einem Vorsprung von ${Math.round(absDiff * 10) / 10}%.`,
  };
}

/**
 * Wählt anhand des Traffic-Splits deterministisch oder per Zufall eine Variante aus.
 */
export function selectVariantForTraffic(
  variants: PromptVariant[],
  controlRatio: number = 0.5,
  seed?: string
): PromptVariant | null {
  const activeVariants = variants.filter((v) => v.active);
  if (activeVariants.length === 0) return null;
  if (activeVariants.length === 1) return activeVariants[0];

  const control = activeVariants.find((v) => v.isControl) || activeVariants[0];
  const challengers = activeVariants.filter((v) => v.id !== control.id);

  if (challengers.length === 0) return control;

  let randomVal: number;
  if (seed) {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    randomVal = ((hash >>> 0) % 1000) / 1000;
  } else {
    randomVal = Math.random();
  }

  if (randomVal < controlRatio) {
    return control;
  } else {
    const challengerIndex = Math.floor(
      ((randomVal - controlRatio) / (1 - controlRatio)) * challengers.length
    );
    return challengers[Math.min(challengerIndex, challengers.length - 1)];
  }
}
