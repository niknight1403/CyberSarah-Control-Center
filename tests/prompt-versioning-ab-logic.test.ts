import { describe, it, expect } from "vitest";
import {
  createPromptVariant,
  recordExecutionMetric,
  summarizeVariant,
  evaluateABTest,
  selectVariantForTraffic,
  PromptVariant,
  ExecutionMetric,
} from "../lib/prompt-versioning-ab-logic";

describe("Sprint 364 — Prompt-Versionierung + A/B-Vergleichsmetrik", () => {
  const variantControl: PromptVariant = createPromptVariant({
    id: "p-v1",
    name: "Standard-System-Prompt",
    promptText: "Du bist ein hilfreicher Assistent.",
    version: "1.0.0",
    isControl: true,
    active: true,
  });

  const variantChallenger: PromptVariant = createPromptVariant({
    id: "p-v2",
    name: "Strukturierter-System-Prompt",
    promptText: "Du bist ein präziser, hochstrukturierter KI-Assistent.",
    version: "2.0.0-beta",
    isControl: false,
    active: true,
  });

  it("erstellt Prompt-Varianten korrekt mit Standard-Zeitstempel", () => {
    expect(variantControl.id).toBe("p-v1");
    expect(variantControl.isControl).toBe(true);
    expect(variantControl.createdAt).toBeDefined();
  });

  it("erfasst Ausführungsmetriken und berechnet Zusammenfassungen", () => {
    let metrics: ExecutionMetric[] = [];
    
    // 5 erfolgreiche Läufe für Control
    for (let i = 0; i < 5; i++) {
      metrics = recordExecutionMetric(metrics, {
        variantId: "p-v1",
        success: i < 4, // 80% success
        score: i < 4 ? 80 : 40,
        latencyMs: 100 + i * 10,
        tokenCount: 500,
        taskCompleted: true,
      });
    }

    const summary = summarizeVariant(variantControl, metrics);
    expect(summary.totalExecutions).toBe(5);
    expect(summary.successRate).toBe(80);
    expect(summary.averageScore).toBe(72);
    expect(summary.averageTokens).toBe(500);
    expect(summary.completionRate).toBe(100);
  });

  it("meldet 'insufficient_data' wenn Mindeststichprobe nicht erreicht ist", () => {
    let metrics: ExecutionMetric[] = [];
    metrics = recordExecutionMetric(metrics, { variantId: "p-v1", success: true });
    metrics = recordExecutionMetric(metrics, { variantId: "p-v2", success: true });

    const result = evaluateABTest(variantControl, variantChallenger, metrics, {
      minSampleSize: 5,
    });

    expect(result.status).toBe("insufficient_data");
    expect(result.recommendation).toContain("Nicht genügend Daten");
  });

  it("berechnet A/B-Testergebnis eindeutig bei signifikanter Überlegenheit", () => {
    let metrics: ExecutionMetric[] = [];

    // Control: 60% success rate
    for (let i = 0; i < 10; i++) {
      metrics = recordExecutionMetric(metrics, {
        variantId: "p-v1",
        success: i < 6,
        score: i < 6 ? 70 : 30,
        latencyMs: 200,
      });
    }

    // Challenger: 90% success rate
    for (let i = 0; i < 10; i++) {
      metrics = recordExecutionMetric(metrics, {
        variantId: "p-v2",
        success: i < 9,
        score: i < 9 ? 95 : 40,
        latencyMs: 150,
      });
    }

    const result = evaluateABTest(variantControl, variantChallenger, metrics, {
      minSampleSize: 10,
      targetMetric: "successRate",
      scoreDiffThreshold: 5.0,
    });

    expect(result.status).toBe("conclusive");
    expect(result.winningVariantId).toBe("p-v2");
    expect(result.winningVariantName).toBe("Strukturierter-System-Prompt");
    expect(result.scoreDiff).toBe(30); // 90% - 60%
  });

  it("wählt Traffic-Variante deterministisch per Seed", () => {
    const variants = [variantControl, variantChallenger];

    const selected1 = selectVariantForTraffic(variants, 0.5, "user-123");
    const selected2 = selectVariantForTraffic(variants, 0.5, "user-123");
    expect(selected1?.id).toBe(selected2?.id);
  });
});
