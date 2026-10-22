/**
 * Production quality gate shared by autonomous generators.
 * Score = 30% syntax + 30% tests + 20% security + 20% performance.
 */
export type QualitySignals = {
  syntax: number;
  tests: number;
  security: number;
  performance: number;
};

export type QualityGateResult = QualitySignals & {
  score: number;
  threshold: number;
  passed: boolean;
};

export const PRODUCTION_QUALITY_THRESHOLD = 85;

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function calculateQualityGate(
  signals: QualitySignals,
  threshold = PRODUCTION_QUALITY_THRESHOLD,
): QualityGateResult {
  const syntax = clamp(signals.syntax);
  const tests = clamp(signals.tests);
  const security = clamp(signals.security);
  const performance = clamp(signals.performance);
  const score = Math.round((0.30 * syntax + 0.30 * tests + 0.20 * security + 0.20 * performance) * 10) / 10;
  return { syntax, tests, security, performance, score, threshold, passed: score >= threshold };
}

/** Deterministic security score for standalone HTML artifacts. */
export function scoreStandaloneHtmlSecurity(html: string): number {
  let score = 100;
  const hazards: Array<[RegExp, number]> = [
    [/<script[^>]+src=/i, 30],
    [/\beval\s*\(/i, 35],
    [/new\s+Function\s*\(/i, 35],
    [/document\.write\s*\(/i, 20],
    [/javascript\s*:/i, 25],
    [/http:\/\//i, 15],
  ];
  for (const [pattern, penalty] of hazards) if (pattern.test(html)) score -= penalty;
  return clamp(score);
}

/** Performance score based on shipped standalone artifact size. */
export function scoreStandaloneHtmlPerformance(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  if (bytes <= 100_000) return 100;
  if (bytes <= 250_000) return 90;
  if (bytes <= 500_000) return 75;
  if (bytes <= 1_000_000) return 55;
  return 30;
}
