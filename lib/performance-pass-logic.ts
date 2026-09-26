/**
 * Sprint 375: Performance-Pass: Antwortzeiten messen, heißeste Pfade optimieren
 * Logic-Modul für Latenz-Messung (P50/P90/P95/P99), Hotpath-Erkennung, SLA-Evaluation
 * und In-Memory LRU/TTL Hotpath Caching.
 */

export interface LatencyMetric {
  path: string;
  durationMs: number;
  timestamp: number;
}

export interface PathLatencyStats {
  path: string;
  sampleCount: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface HotpathEntry {
  path: string;
  callCount: number;
  avgDurationMs: number;
  p95Ms: number;
  impactScore: number; // callCount * p95Ms
}

export interface SLAEvaluationResult {
  isCompliant: boolean;
  targetP95Ms: number;
  actualP95Ms: number;
  violatingPaths: string[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRatioPercent: number;
  size: number;
  capacity: number;
}

/**
 * Berechnet Latenzstatistiken (Min, Max, Avg, P50, P90, P95, P99) für Pfade.
 */
export function calculateLatencyStats(metrics: LatencyMetric[]): Record<string, PathLatencyStats> {
  const grouped: Record<string, number[]> = {};

  for (const item of metrics) {
    if (!grouped[item.path]) {
      grouped[item.path] = [];
    }
    grouped[item.path].push(item.durationMs);
  }

  const result: Record<string, PathLatencyStats> = {};

  for (const path of Object.keys(grouped)) {
    const durations = grouped[path].sort((a, b) => a - b);
    const count = durations.length;
    const minMs = durations[0];
    const maxMs = durations[count - 1];
    const sum = durations.reduce((acc, v) => acc + v, 0);
    const avgMs = Math.round((sum / count) * 100) / 100;

    const getPercentile = (p: number) => {
      const index = Math.ceil((p / 100) * count) - 1;
      return durations[Math.max(0, Math.min(count - 1, index))];
    };

    result[path] = {
      path,
      sampleCount: count,
      minMs,
      maxMs,
      avgMs,
      p50Ms: getPercentile(50),
      p90Ms: getPercentile(90),
      p95Ms: getPercentile(95),
      p99Ms: getPercentile(99),
    };
  }

  return result;
}

/**
 * Identifiziert die heißen Pfade ("Hotpaths") basierend auf Aufrufhäufigkeit und P95-Latenz.
 */
export function identifyHotpaths(metrics: LatencyMetric[], topN = 5): HotpathEntry[] {
  const statsMap = calculateLatencyStats(metrics);
  const entries: HotpathEntry[] = Object.values(statsMap).map((stats) => ({
    path: stats.path,
    callCount: stats.sampleCount,
    avgDurationMs: stats.avgMs,
    p95Ms: stats.p95Ms,
    impactScore: Math.round(stats.sampleCount * stats.p95Ms),
  }));

  return entries.sort((a, b) => b.impactScore - a.impactScore).slice(0, topN);
}

/**
 * Bewertet die Einhaltung der SLA-Latenzen (z. B. Target P95 < 200ms).
 */
export function evaluateSLACompliance(
  metrics: LatencyMetric[],
  targetP95Ms = 200
): SLAEvaluationResult {
  const statsMap = calculateLatencyStats(metrics);
  const paths = Object.values(statsMap);

  if (paths.length === 0) {
    return {
      isCompliant: true,
      targetP95Ms,
      actualP95Ms: 0,
      violatingPaths: [],
    };
  }

  const allDurations = metrics.map((m) => m.durationMs).sort((a, b) => a - b);
  const overallCount = allDurations.length;
  const p95Idx = Math.ceil(0.95 * overallCount) - 1;
  const actualP95Ms = allDurations[Math.max(0, Math.min(overallCount - 1, p95Idx))];

  const violatingPaths = paths
    .filter((p) => p.p95Ms > targetP95Ms)
    .map((p) => `${p.path} (P95: ${p.p95Ms}ms)`);

  return {
    isCompliant: violatingPaths.length === 0 && actualP95Ms <= targetP95Ms,
    targetP95Ms,
    actualP95Ms,
    violatingPaths,
  };
}

/**
 * Erstellt einen performanten In-Memory Hotpath-Cache mit TTL und Kapazitätsbegrenzung.
 */
export function createHotpathCache<T>(capacity = 100, defaultTtlMs = 60000) {
  const cache = new Map<string, { value: T; expiresAt: number }>();
  let hits = 0;
  let misses = 0;

  return {
    get(key: string, now = Date.now()): T | undefined {
      const entry = cache.get(key);
      if (!entry) {
        misses++;
        return undefined;
      }
      if (now > entry.expiresAt) {
        cache.delete(key);
        misses++;
        return undefined;
      }
      hits++;
      return entry.value;
    },

    set(key: string, value: T, ttlMs = defaultTtlMs, now = Date.now()): void {
      if (cache.size >= capacity && !cache.has(key)) {
        // Ältesten Eintrag entfernen
        const firstKey = cache.keys().next().value;
        if (firstKey) cache.delete(firstKey);
      }
      cache.set(key, { value, expiresAt: now + ttlMs });
    },

    clear(): void {
      cache.clear();
      hits = 0;
      misses = 0;
    },

    getStats(): CacheStats {
      const total = hits + misses;
      const hitRatioPercent = total > 0 ? Math.round((hits / total) * 100) : 0;
      return {
        hits,
        misses,
        hitRatioPercent,
        size: cache.size,
        capacity,
      };
    },
  };
}
