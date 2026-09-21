/**
 * Sprint 196 — Prozessglobale Tool-Proxy-Queue fuer externe Tool-, Browser-
 * und API-Aktionen. Schuetzt Produktionssysteme vor Rate-Limits (429) und
 * gleichzeitigen Requests: begrenzte Concurrency, exponentielles Backoff,
 * Retry nur bei transienten Fehlern (siehe lib/tool-proxy-queue-logic.ts).
 */
import { createToolProxyQueue, type ToolProxyQueue, type ToolProxyQueueMetrics } from "../../lib/tool-proxy-queue-logic";

let queueInstance: ToolProxyQueue | null = null;

/** Queue-Optionen aus ENV (Default: 3 parallel, 2 Retries). */
function resolveQueueOptions() {
  const concurrency = Number.parseInt(process.env.TOOL_PROXY_CONCURRENCY ?? "", 10);
  const maxRetries = Number.parseInt(process.env.TOOL_PROXY_MAX_RETRIES ?? "", 10);
  return {
    concurrency: Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 3,
    maxRetries: Number.isInteger(maxRetries) && maxRetries >= 0 ? maxRetries : 2,
    baseBackoffMs: 800,
    maxBackoffMs: 15_000,
  };
}

/** Liefert die Prozess-Singleton-Queue (lazy, ENV-geoeffnet). */
export function getToolProxyQueue(): ToolProxyQueue {
  if (!queueInstance) {
    queueInstance = createToolProxyQueue(resolveQueueOptions());
  }
  return queueInstance;
}

/** Aktuelle Queue-Metriken fuer die Admin-UI (nie null). */
export function getToolProxyQueueMetrics(): ToolProxyQueueMetrics {
  if (!queueInstance) {
    // Noch nie benutzt: ehrliche Null-Metriken ohne Instanzbildung.
    const options = resolveQueueOptions();
    return {
      concurrency: options.concurrency,
      maxRetries: options.maxRetries,
      queued: 0,
      active: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      rateLimited: 0,
      peakActive: 0,
      lastFailureAt: null,
      lastError: null,
    };
  }
  return queueInstance.metrics();
}
