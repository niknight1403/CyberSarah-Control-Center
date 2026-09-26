import { describe, expect, it } from "vitest";
import {
  aggregateFailureStats,
  classifyFailure,
} from "../lib/agent-failure-analysis-logic";

describe("Sprint 371 — Agent Failure Analysis Logic", () => {
  it("klassifiziert Rate-Limit-Fehler (429) korrekt als transient & retryable", () => {
    const analysis = classifyFailure({
      errorMessage: "Rate limit exceeded. Please retry in 5s.",
      statusCode: 429,
      toolName: "web_search",
    });

    expect(analysis.category).toBe("rate_limit");
    expect(analysis.severity).toBe("transient");
    expect(analysis.isRetryable).toBe(true);
    expect(analysis.recommendedAction).toBe("retry_backoff");
    expect(analysis.incidentSummary).toContain("rate_limit");
  });

  it("klassifiziert Kontextüberlauf als recoverable und empfiehlt context_reduction", () => {
    const analysis = classifyFailure({
      errorMessage: "Maximum context length is 128000 tokens, but prompt contains 135000 tokens.",
    });

    expect(analysis.category).toBe("context_overflow");
    expect(analysis.severity).toBe("recoverable");
    expect(analysis.isRetryable).toBe(true);
    expect(analysis.recommendedAction).toBe("reduce_context");
  });

  it("klassifiziert Rechtefehler (403) als fatal & nicht wiederholbar", () => {
    const analysis = classifyFailure({
      errorMessage: "Forbidden: Insufficient scope for endpoint",
      statusCode: 403,
    });

    expect(analysis.category).toBe("permission_denied");
    expect(analysis.severity).toBe("fatal");
    expect(analysis.isRetryable).toBe(false);
    expect(analysis.recommendedAction).toBe("escalate_human");
  });

  it("aggregiert Fehlerstatistiken korrekt über mehrere Vorkommnisse", () => {
    const failures = [
      { errorMessage: "Rate limit 429", statusCode: 429 },
      { errorMessage: "Rate limit 429", statusCode: 429 },
      { errorMessage: "Timeout on backend", statusCode: 504 },
      { errorMessage: "Forbidden", statusCode: 403 },
    ];

    const stats = aggregateFailureStats(failures);

    expect(stats.totalFailures).toBe(4);
    expect(stats.dominantCategory).toBe("rate_limit");
    expect(stats.retryableCount).toBe(3);
    expect(stats.fatalCount).toBe(1);
    expect(stats.categoryCounts.rate_limit).toBe(2);
  });
});
