import { describe, expect, it } from "vitest";
import {
  PRODUCTION_QUALITY_THRESHOLD,
  calculateQualityGate,
  scoreStandaloneHtmlPerformance,
  scoreStandaloneHtmlSecurity,
} from "../lib/quality-gate-logic";

describe("production quality gate", () => {
  it("implements the mandated weighted score and >=85 gate", () => {
    const result = calculateQualityGate({ syntax: 100, tests: 90, security: 80, performance: 70 });
    expect(result.score).toBe(87);
    expect(result.threshold).toBe(PRODUCTION_QUALITY_THRESHOLD);
    expect(result.passed).toBe(true);
  });

  it("fails honestly below threshold and clamps invalid ranges", () => {
    const result = calculateQualityGate({ syntax: 120, tests: 40, security: -5, performance: Number.NaN });
    expect(result.syntax).toBe(100);
    expect(result.security).toBe(0);
    expect(result.score).toBe(42);
    expect(result.passed).toBe(false);
  });

  it("penalizes dangerous standalone HTML patterns", () => {
    expect(scoreStandaloneHtmlSecurity("<!DOCTYPE html><script>const x=1</script>")).toBe(100);
    expect(scoreStandaloneHtmlSecurity('<script src="http://x.test/a.js"></script>eval("1")')).toBeLessThan(85);
  });

  it("scores artifact size deterministically", () => {
    expect(scoreStandaloneHtmlPerformance(90_000)).toBe(100);
    expect(scoreStandaloneHtmlPerformance(300_000)).toBe(75);
    expect(scoreStandaloneHtmlPerformance(2_000_000)).toBe(30);
  });
});
