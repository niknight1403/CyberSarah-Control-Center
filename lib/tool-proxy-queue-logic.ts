/**
 * Sprint 196 — Tool-Proxy-Queue: zentraler Schutzschild fuer externe Tool-,
 * Browser- und API-Aktionen (Rate-Limit-Schutz, Concurrency-Limit,
 * exponentielles Backoff mit Jitter, Retry-Klassifizierung).
 *
 * Pure Logik ohne Netzwerk-I/O: der Aufrufer uebergibt eine Task-Fabrik,
 * die Queue entscheidet ausschliesslich ueber Reihenfolge, Parallelitaet,
 * Wiederholung und Backoff. Fehlerklassifizierung analog zum LLM-Pool
 * (429/5xx/Netzwerk → wiederholbar; 4xx Auth/Daten → endgueltig).
 */

export type QueueRetryDecision = { retry: true; delayMs: number } | { retry: false; delayMs: 0 };

export type ToolProxyQueueOptions = {
  /** Maximal gleichzeitig aktive Tasks. */
  concurrency?: number;
  /** Maximale Wiederholungen pro Task. */
  maxRetries?: number;
  /** Basis-Backoff in ms (verdoppelt sich pro Versuch). */
  baseBackoffMs?: number;
  /** Obergrenze des Backoffs in ms. */
  maxBackoffMs?: number;
  /** Zeitfunktion fuer deterministische Tests (Default: Date.now). */
  now?: () => number;
  /** Sleep-Funktion fuer deterministische Tests (Default: setTimeout). */
  sleep?: (ms: number) => Promise<void>;
};

export type ToolProxyQueueMetrics = {
  concurrency: number;
  maxRetries: number;
  queued: number;
  active: number;
  completed: number;
  failed: number;
  retried: number;
  rateLimited: number;
  peakActive: number;
  lastFailureAt: number | null;
  lastError: string | null;
};

/** Klassifiziert einen Task-Fehler: wiederholbar (429/5xx/Netzwerk) oder endgueltig. */
export function isRetryableTaskError(error: unknown): boolean {
  if (error && typeof error === "object" && "httpStatus" in error) {
    const status = Number((error as { httpStatus: unknown }).httpStatus);
    if (Number.isFinite(status)) {
      if (status === 429) return true;
      if (status >= 500) return true;
      if (status === 408) return true;
      return false;
    }
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("abort") || message.includes("timeout") || message.includes("network") || message.includes("econnreset") || message.includes("fetch failed")) {
      return true;
    }
  }
  return false;
}

/** Exponentielles Backoff mit Jitter: 2^attempt-1 * Basis, gedeckelt, ±20% Jitter. */
export function computeBackoffDelayMs(attempt: number, options: Pick<ToolProxyQueueOptions, "baseBackoffMs" | "maxBackoffMs"> & { jitter?: number; now?: () => number }): number {
  const base = Math.max(0, options.baseBackoffMs ?? 500);
  const max = Math.max(base, options.maxBackoffMs ?? 15_000);
  const raw = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  const jitterRatio = options.jitter ?? 0.2;
  const jitter = jitterRatio > 0 ? raw * jitterRatio : 0;
  return Math.round(raw - jitter / 2 + (jitterRatio > 0 ? jitter * ((options.now?.() ?? Date.now()) % 1000) / 1000 : 0));
}

export type ToolProxyQueue = {
  enqueue<T>(task: () => Promise<T>): Promise<T>;
  metrics(): ToolProxyQueueMetrics;
  /** Warteschlange leeren (laufende Tasks laufen aus). */
  clear(): void;
};

export function createToolProxyQueue(options: ToolProxyQueueOptions = {}): ToolProxyQueue {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const maxRetries = Math.max(0, options.maxRetries ?? 2);
  const baseBackoffMs = Math.max(0, options.baseBackoffMs ?? 500);
  const maxBackoffMs = Math.max(baseBackoffMs, options.maxBackoffMs ?? 15_000);
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let queued: Array<() => void> = [];
  let active = 0;
  let peakActive = 0;
  let completed = 0;
  let failed = 0;
  let retried = 0;
  let rateLimited = 0;
  let lastFailureAt: number | null = null;
  let lastError: string | null = null;
  let cleared = false;

  const metrics = (): ToolProxyQueueMetrics => ({
    concurrency,
    maxRetries,
    queued: queued.length,
    active,
    completed,
    failed,
    retried,
    rateLimited,
    peakActive,
    lastFailureAt,
    lastError,
  });

  const pump = (): void => {
    while (active < concurrency && !cleared && queued.length > 0) {
      const next = queued.shift();
      if (!next) return;
      active += 1;
      if (active > peakActive) peakActive = active;
      next();
    }
  };

  async function run<T>(task: () => Promise<T>): Promise<T> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const result = await task();
        completed += 1;
        return result;
      } catch (error) {
        const retryable = isRetryableTaskError(error);
        if (error && typeof error === "object" && Number((error as { httpStatus?: unknown }).httpStatus) === 429) {
          rateLimited += 1;
        }
        if (!retryable || attempt >= maxRetries) {
          failed += 1;
          lastFailureAt = now();
          lastError = error instanceof Error ? error.message : String(error);
          throw error;
        }
        attempt += 1;
        retried += 1;
        const delayMs = computeBackoffDelayMs(attempt, { baseBackoffMs, maxBackoffMs, now });
        if (delayMs > 0) await sleep(delayMs);
      }
    }
  }

  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queued.push(() => {
          run(task)
            .then(resolve, reject)
            .finally(() => {
              active -= 1;
              pump();
            });
        });
        pump();
      });
    },
    metrics,
    clear() {
      cleared = true;
      queued = [];
    },
  };
}
