import type { ComputeTier, TaskRequest } from "./compute-cascading-router";

export interface PaidPricing {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export function estimateMaximumPaidCost(
  task: TaskRequest,
  pricing: PaidPricing,
): number | null {
  const inputTokens = Math.ceil((task.prompt.length + (task.systemPrompt?.length ?? 0)) / 4);
  const outputTokens = task.maxTokens ?? 1024;
  if (!Number.isFinite(pricing.inputUsdPerMillion) ||
      !Number.isFinite(pricing.outputUsdPerMillion) ||
      pricing.inputUsdPerMillion < 0 ||
      pricing.outputUsdPerMillion < 0 ||
      !Number.isSafeInteger(outputTokens) || outputTokens < 1 || outputTokens > 8192) return null;
  return (inputTokens * pricing.inputUsdPerMillion +
    outputTokens * pricing.outputUsdPerMillion) / 1_000_000;
}

export function canUseTier(task: TaskRequest, tier: ComputeTier, pricing?: PaidPricing): boolean {
  if (task.privacy === "air-gapped" || task.privacy === "internal") {
    return tier === "TIER_1_LOCAL_OLLAMA";
  }
  if (tier !== "TIER_3_PAID_API") return true;
  if (task.allowPaid !== true || !Number.isFinite(task.maxCostUSD) ||
      (task.maxCostUSD ?? 0) <= 0 || !pricing) return false;
  const estimate = estimateMaximumPaidCost(task, pricing);
  return estimate !== null && estimate <= task.maxCostUSD!;
}
