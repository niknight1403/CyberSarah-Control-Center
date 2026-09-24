/**
 * Sprint 219 — Daten-Schicht des Micro-Trading-Moduls (I/O).
 *
 * Ruft Tageskurse über die öffentliche CoinGecko-API ab (kostenlos, kein Key).
 * Ehrlichkeits-Regeln:
 *   - fetch ist injizierbar (Tests bestimmen die Antworten, kein Netz nötig).
 *   - Zeitlimit und begrenzte Retries; 429 wird als Rate-Limit erkannt und
 *     mit Cooldown behandelt statt blind zu wiederholen.
 *   - Fehlschläge erscheinen als sprechende Meldungen, nie als leeres "OK".
 * Alle Analysen (Validierung, Signale, Backtest) bleiben in der reinen Logik.
 */

import { parseJsonResponse } from "@/lib/fetch-safety-logic";
import { getSymbol, type Candle, type CandleSeries } from "@/lib/micro-trading-logic";

const MARKET_CHART_URL = "https://api.coingecko.com/api/v3/coins";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
/** Cooldown nach einem Rate-Limit (429) — CoinGecko erlaubt ~10-30 Anfragen/Min. */
export const RATE_LIMIT_COOLDOWN_MS = 70_000;

export type MarketDataStatus = {
  /** true, wenn gerade Cooldown wegen Rate-Limit läuft. */
  rateLimitedUntil: number;
};

export type FetchMarketOptions = {
  /** Injizierter fetch (Tests). Produktiv: globalThis.fetch. */
  fetchImpl?: typeof globalThis.fetch;
  now?: () => number;
  timeoutMs?: number;
  maxAttempts?: number;
  status?: MarketDataStatus;
};

type CoinGeckoMarketChart = { prices: Array<[number, number]> };

function buildUrl(coingeckoId: string, days: number): string {
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  return `${MARKET_CHART_URL}/${encodeURIComponent(coingeckoId)}/market_chart?vs_currency=usd&interval=daily&days=${safeDays}`;
}

async function fetchOnce(url: string, fetchImpl: typeof globalThis.fetch, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lädt Tageskurse für ein Symbol. Wirft nie stumm: Fehler sind sprechend,
 * inkl. ausdrücklichem Rate-Limit-Hinweis bei HTTP 429.
 */
export async function fetchMarketSeries(symbolId: string, days: number, options: FetchMarketOptions = {}): Promise<CandleSeries> {
  const symbol = getSymbol(symbolId);
  if (!symbol) throw new Error(`Unbekanntes Symbol "${symbolId}" — kein Datenabruf möglich.`);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("Kein fetch verfügbar — Datenabruf auf dieser Plattform nicht möglich.");
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const url = buildUrl(symbol.coingeckoId, days);

  if (options.status && now() < options.status.rateLimitedUntil) {
    throw new Error(`Rate-Limit-Cooldown läuft noch — Datenabruf erst in ${Math.ceil((options.status.rateLimitedUntil - now()) / 1000)} s möglich.`);
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchOnce(url, fetchImpl, timeoutMs);
    } catch (error) {
      lastError = new Error(`Kursabruf für ${symbol.label} fehlgeschlagen (Versuch ${attempt}/${maxAttempts}): ${error instanceof Error ? (error.name === "AbortError" ? "Zeitlimit überschritten" : error.message) : "unbekannter Fehler"}`);
      continue;
    }
    if (response.status === 429) {
      if (options.status) options.status.rateLimitedUntil = now() + RATE_LIMIT_COOLDOWN_MS;
      lastError = new Error(`Rate-Limit bei CoinGecko erreicht — Datenabruf für ${symbol.label} pausiert. In ~1 Minute erneut versuchen.`);
      // Rate-Limit ist kein transienter Einzelfehler: kein Blind-Retry.
      break;
    }
    if (response.status >= 500) {
      lastError = new Error(`CoinGecko meldet einen Serverfehler (HTTP ${response.status}) für ${symbol.label}.`);
      continue;
    }
    if (!response.ok) {
      throw new Error(`Kursabruf für ${symbol.label} abgelehnt (HTTP ${response.status}) — URL: ${url}`);
    }
    const payload = await parseJsonResponse<CoinGeckoMarketChart>(response);
    if (!Array.isArray(payload?.prices) || payload.prices.length === 0) {
      throw new Error(`CoinGecko lieferte keine Kurspunkte für ${symbol.label}.`);
    }
    const candles = toCandles(payload.prices, symbolId);
    return { symbolId, currency: "USD", candles, source: "coingecko" };
  }
  throw lastError ?? new Error(`Kursabruf für ${symbol.label} fehlgeschlagen.`);
}

/** Wandelt [timestampMs, price]-Paare in OHLC-freie Tages-Candles (close=price) um. */
export function toCandles(prices: Array<[number, number]>, symbolId: string): Candle[] {
  const candles: Candle[] = [];
  let lastDay: number | null = null;
  for (const [time, price] of prices) {
    if (!Number.isFinite(time) || !Number.isFinite(price) || price <= 0) continue;
    const day = Math.floor(time / 86_400_000);
    if (day === lastDay) continue; // nur ein Kurswert pro Tag
    lastDay = day;
    candles.push({ time: day * 86_400_000, open: price, high: price, low: price, close: price });
  }
  return candles;
}
