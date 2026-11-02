import { describe, expect, it } from "vitest";
import {
  aiInfluenzaTaskCostEventKey,
  estimateAiInfluenzaUsageCost,
  priceForAiInfluenzaModel,
} from "../lib/ai-influenza-cost-logic";

describe("AI Influenza Kostenmessung je Auftrag", () => {
  it("rechnet Verbrauch eines bekannten Modells in Cent", () => {
    const result = estimateAiInfluenzaUsageCost({
      model: "qwen/qwen3.8-27b",
      usage: { prompt_tokens: 1000, completion_tokens: 2000 },
    });
    expect(result).not.toBeNull();
    // 1000 * 15 / 1e6 + 2000 * 60 / 1e6 = 0,015 + 0,12 = 0,135 Cent -> aufgerundet 1
    expect(result?.cents).toBe(1);
    expect(result?.model).toBe("qwen/qwen3.8-27b");
    expect(result?.promptTokens).toBe(1000);
  });

  it("rechnet grosse Verbraeuche linear", () => {
    const result = estimateAiInfluenzaUsageCost({
      model: "openai/gpt-oss-20b",
      usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 },
    });
    expect(result?.cents).toBe(75);
  });

  it("liefert null statt einer erfundenen Zahl, wenn das Modell unbekannt ist", () => {
    expect(estimateAiInfluenzaUsageCost({
      model: "voellig-unbekannt-9000",
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })).toBeNull();
    expect(priceForAiInfluenzaModel(null)).toBeNull();
  });

  it("liefert null, wenn kein Verbrauch gemeldet wurde", () => {
    expect(estimateAiInfluenzaUsageCost({ model: "qwen", usage: null })).toBeNull();
    expect(estimateAiInfluenzaUsageCost({ model: "qwen", usage: { prompt_tokens: 0, completion_tokens: 0 } })).toBeNull();
  });

  it("kostet jeden Aufruf mindestens einen Cent", () => {
    const result = estimateAiInfluenzaUsageCost({
      model: "qwen/qwen3.8-27b",
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    expect(result?.cents).toBe(1);
  });

  it("baut einen deterministischen Event-Key gegen doppelte Kostenzeilen", () => {
    expect(aiInfluenzaTaskCostEventKey("order-123", 42)).toBe("ai-influenza-cost:order-123:task:42");
    expect(aiInfluenzaTaskCostEventKey("order-123", 42)).toBe(aiInfluenzaTaskCostEventKey("order-123", 42));
    expect(() => aiInfluenzaTaskCostEventKey("  ", 42)).toThrow();
    expect(() => aiInfluenzaTaskCostEventKey("order-123", 0)).toThrow();
  });
});
