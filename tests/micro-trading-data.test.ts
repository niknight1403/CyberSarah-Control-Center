import { describe, expect, it, vi } from "vitest";

import { fetchMarketSeries, RATE_LIMIT_COOLDOWN_MS, toCandles } from "../lib/micro-trading-data";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

const GOOD_PAYLOAD = { prices: [[1_700_000_000_000, 95.5], [1_700_086_400_000, 96.5], [1_700_172_800_000, 97.5]] };

describe("micro trading data layer (Sprint 219)", () => {
  it("lädt Tageskurse und markiert die Quelle ehrlich", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(GOOD_PAYLOAD));
    const series = await fetchMarketSeries("btc", 30, { fetchImpl, now: () => 1_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(series.source).toBe("coingecko");
    expect(series.currency).toBe("USD");
    expect(series.candles).toHaveLength(3);
    expect(series.candles[0]?.close).toBeCloseTo(95.5, 10);
  });

  it("verdichtet Intraday-Punkte auf einen Kurs pro Tag und wirft Unsinn weg", () => {
    const candles = toCandles([
      [1_700_000_100_000, 95], [1_700_010_000_000, 96], [1_700_086_400_000, 97],
      [1_700_086_500_000, 98], [Number.NaN, 99], [1_700_200_000_000, -1],
    ], "btc");
    expect(candles).toHaveLength(2);
    expect(candles[0]?.close).toBe(95);
  });

  it("erkennt 429 als Rate-Limit, setzt den Cooldown und wiederholt nicht blind", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "rate limited" }, 429));
    const status = { rateLimitedUntil: 0 };
    const now = vi.fn(() => 5_000);
    await expect(fetchMarketSeries("eth", 30, { fetchImpl, now, status })).rejects.toThrow("Rate-Limit");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(status.rateLimitedUntil).toBe(5_000 + RATE_LIMIT_COOLDOWN_MS);
    await expect(fetchMarketSeries("eth", 30, { fetchImpl, now, status })).rejects.toThrow("Cooldown");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("übt exponentiellen Backoff bei 5xx und wirft bei dauerhaftem Ausfall", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => { calls += 1; return jsonResponse({ error: "boom" }, 503); });
    await expect(fetchMarketSeries("sol", 30, { fetchImpl, now: () => 0 })).rejects.toThrow("Serverfehler");
    expect(calls).toBe(3);
  });

  it("lehnt unbekannte Symbole, Nicht-JSON und leere Antworten ehrlich ab", async () => {
    await expect(fetchMarketSeries("doge", 30)).rejects.toThrow("Unbekanntes Symbol");
    const html = vi.fn(async () => new Response("<!DOCTYPE html><p>offline</p>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(fetchMarketSeries("btc", 30, { fetchImpl: html })).rejects.toThrow();
    const empty = vi.fn(async () => jsonResponse({ prices: [] }));
    await expect(fetchMarketSeries("btc", 30, { fetchImpl: empty })).rejects.toThrow("keine Kurspunkte");
  });
});
