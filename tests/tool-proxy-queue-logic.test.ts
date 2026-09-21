import { describe, expect, it } from "vitest";

import {
  computeBackoffDelayMs,
  createToolProxyQueue,
  isRetryableTaskError,
} from "../lib/tool-proxy-queue-logic";

/**
 * Sprint 196 — Regressionstests fuer die Tool-Proxy-Queue:
 * Concurrency-Limit, Retry-Klassifizierung, exponentielles Backoff
 * und ehrliche Metriken.
 */
describe("isRetryableTaskError", () => {
  it("behandelt 429, 5xx, 408 und Netzwerkfehler als wiederholbar", () => {
    expect(isRetryableTaskError({ httpStatus: 429 })).toBe(true);
    expect(isRetryableTaskError({ httpStatus: 500 })).toBe(true);
    expect(isRetryableTaskError({ httpStatus: 504 })).toBe(true);
    expect(isRetryableTaskError({ httpStatus: 408 })).toBe(true);
    expect(isRetryableTaskError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableTaskError(new Error("AbortError: timeout"))).toBe(true);
  });

  it("behandelt 4xx ausser 429/408 als endgueltig", () => {
    expect(isRetryableTaskError({ httpStatus: 401 })).toBe(false);
    expect(isRetryableTaskError({ httpStatus: 403 })).toBe(false);
    expect(isRetryableTaskError({ httpStatus: 404 })).toBe(false);
  });
});

describe("computeBackoffDelayMs", () => {
  it("waechst exponentiell und deckelt bei maxBackoffMs", () => {
    const first = computeBackoffDelayMs(1, { baseBackoffMs: 100, maxBackoffMs: 10_000, jitter: 0, now: () => 0 });
    const second = computeBackoffDelayMs(2, { baseBackoffMs: 100, maxBackoffMs: 10_000, jitter: 0, now: () => 0 });
    const capped = computeBackoffDelayMs(10, { baseBackoffMs: 100, maxBackoffMs: 10_000, jitter: 0, now: () => 0 });
    expect(first).toBe(100);
    expect(second).toBe(200);
    expect(capped).toBe(10_000);
  });

  it("bleibt mit Jitter im Toleranzband um den Basiswert", () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const raw = 100 * 2 ** (attempt - 1);
      const delay = computeBackoffDelayMs(attempt, { baseBackoffMs: 100, maxBackoffMs: 10_000 });
      expect(delay).toBeGreaterThanOrEqual(Math.round(raw * 0.8));
      expect(delay).toBeLessThanOrEqual(Math.round(raw * 1.2));
    }
  });
});

describe("createToolProxyQueue", () => {
  it("verarbeitet Tasks und liefert Ergebnisse in Original-Reihenfolge zurueck", async () => {
    const queue = createToolProxyQueue({ concurrency: 2, baseBackoffMs: 0, sleep: async () => undefined });
    const results = await Promise.all([
      queue.enqueue(async () => "a"),
      queue.enqueue(async () => "b"),
      queue.enqueue(async () => "c"),
    ]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(queue.metrics().completed).toBe(3);
  });

  it("respektiert das Concurrency-Limit (max. 2 gleichzeitig)", async () => {
    let active = 0;
    let peak = 0;
    const queue = createToolProxyQueue({
      concurrency: 2,
      sleep: async () => undefined,
      baseBackoffMs: 0,
    });
    const task = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return active;
    };
    await Promise.all(Array.from({ length: 6 }, () => queue.enqueue(task)));
    expect(peak).toBe(2);
    expect(queue.metrics().peakActive).toBe(2);
  });

  it("holt 429-Fehler mit Retries durch (Rate-Limit-Schutz)", async () => {
    let calls = 0;
    const queue = createToolProxyQueue({
      concurrency: 1,
      maxRetries: 3,
      baseBackoffMs: 0,
      sleep: async () => undefined,
    });
    const result = await queue.enqueue(async () => {
      calls += 1;
      if (calls < 3) {
        throw Object.assign(new Error("rate limited"), { httpStatus: 429 });
      }
      return "ok";
    });
    expect(result).toBe("ok");
    expect(queue.metrics().retried).toBe(2);
    expect(queue.metrics().rateLimited).toBe(2);
    expect(queue.metrics().completed).toBe(1);
  });

  it("gibt endgueltige 4xx-Fehler ohne Retry durch", async () => {
    const queue = createToolProxyQueue({
      concurrency: 1,
      maxRetries: 3,
      baseBackoffMs: 0,
      sleep: async () => undefined,
    });
    await expect(
      queue.enqueue(async () => {
        throw Object.assign(new Error("forbidden"), { httpStatus: 403 });
      }),
    ).rejects.toThrow("forbidden");
    expect(queue.metrics().retried).toBe(0);
    expect(queue.metrics().failed).toBe(1);
    expect(queue.metrics().lastError).toBe("forbidden");
  });

  it("scheitert nach erschoeften Retries mit Metriken", async () => {
    const queue = createToolProxyQueue({
      concurrency: 1,
      maxRetries: 2,
      baseBackoffMs: 0,
      sleep: async () => undefined,
      now: () => 1_000,
    });
    await expect(
      queue.enqueue(async () => {
        throw new Error("network down");
      }),
    ).rejects.toThrow("network down");
    expect(queue.metrics().retried).toBe(2);
    expect(queue.metrics().failed).toBe(1);
    expect(queue.metrics().lastFailureAt).toBe(1_000);
  });
});
