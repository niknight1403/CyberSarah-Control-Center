import { describe, expect, it } from "vitest";
import {
  ProviderProfile,
  recordProviderExecution,
  selectOptimalProvider,
} from "../lib/provider-rotation-v2-logic";

describe("Sprint 372 — Provider Rotation v2 Logic", () => {
  const mockProviders: ProviderProfile[] = [
    {
      id: "prov-fast",
      name: "FastModel-Mini",
      costPer1kInputTokens: 0.00015,
      costPer1kOutputTokens: 0.0006,
      avgLatencyMs: 300,
      errorRate: 0.02,
      qualityScore: 75,
      maxContextTokens: 32000,
      supportedFeatures: ["tool_calling", "streaming"],
      isAvailable: true,
      consecutiveErrorCount: 0,
    },
    {
      id: "prov-smart",
      name: "SmartModel-Pro",
      costPer1kInputTokens: 0.0025,
      costPer1kOutputTokens: 0.01,
      avgLatencyMs: 1200,
      errorRate: 0.01,
      qualityScore: 95,
      maxContextTokens: 128000,
      supportedFeatures: ["tool_calling", "vision", "structured_json", "streaming"],
      isAvailable: true,
      consecutiveErrorCount: 0,
    },
    {
      id: "prov-failing",
      name: "BrokenModel",
      costPer1kInputTokens: 0.0001,
      costPer1kOutputTokens: 0.0002,
      avgLatencyMs: 200,
      errorRate: 0.8, // 80% Fehler
      qualityScore: 80,
      maxContextTokens: 64000,
      supportedFeatures: ["tool_calling"],
      isAvailable: true,
      consecutiveErrorCount: 2,
    },
  ];

  it("wählt das schnellste/günstigste Modell bei Priorität 'cost'", () => {
    const result = selectOptimalProvider(mockProviders, {
      priority: "cost",
      requiredFeatures: ["tool_calling"],
    });

    expect(result.selectedProvider.id).toBe("prov-fast");
    expect(result.selectionScore).toBeGreaterThan(0);
    expect(result.fallbackProviders.length).toBe(1); // prov-failing gefiltert wegen 80% errorRate
  });

  it("wählt das schlaueste Modell bei Priorität 'quality' oder gefordertem Vision-Feature", () => {
    const result = selectOptimalProvider(mockProviders, {
      priority: "quality",
      requiredFeatures: ["vision"],
    });

    expect(result.selectedProvider.id).toBe("prov-smart");
    expect(result.selectedProvider.supportedFeatures).toContain("vision");
  });

  it("wirft Fehler, wenn kein Provider die geforderten Kriterien erfüllt", () => {
    expect(() =>
      selectOptimalProvider(mockProviders, {
        requiredFeatures: ["vision"],
        maxCostPerRequestUSD: 0.00001, // Extrem niedriges Budget
      })
    ).toThrow("Kein Provider erfüllt die geforderten Kriterien");
  });

  it("deaktiviert Provider bei 3 aufeinanderfolgenden Fehlern", () => {
    let prov = mockProviders[0];

    prov = recordProviderExecution(prov, {
      providerId: prov.id,
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 500,
      success: false,
    });
    prov = recordProviderExecution(prov, {
      providerId: prov.id,
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 500,
      success: false,
    });

    expect(prov.isAvailable).toBe(true);

    prov = recordProviderExecution(prov, {
      providerId: prov.id,
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 500,
      success: false,
    });

    expect(prov.isAvailable).toBe(false); // 3. Fehler = Ausfall
    expect(prov.consecutiveErrorCount).toBe(3);
  });
});
