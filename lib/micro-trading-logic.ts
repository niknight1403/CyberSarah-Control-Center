/**
 * Sprint 212 — Micro-Trading-Analysemodul (rein, testbar): Kern-Typen und
 * Formatierung.
 *
 * Ehrlichkeits-Regeln des Moduls:
 *   - Alles ist ANALYSE, niemals Anlageberatung. Keine Order-Funktion.
 *   - Preise sind Beobachtungen mit Zeitstempel, keine Garantien.
 *   - Ungültige Candle-Daten werden abgelehnt (kein stillschweigendes
 *     Weiterrechnen mit Unsinn-Werten).
 */

export type Candle = {
  /** Unix-Zeit in Millisekunden (Kursbeginn der Candle). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type CandleSeries = {
  symbolId: string;
  currency: string;
  candles: Candle[];
  /** Nur gesetzt, wenn die Quelle live abgerufen wurde (sonst Fixture/Test). */
  source?: "coingecko" | "fixture";
};

/* ==================== Formatierung (deutsch) ==================== */

/** Deutsch formatierter Preis: 94.123,45 USD */
export function formatPriceGerman(price: number, currency = "USD"): string {
  const safe = Number.isFinite(price) && price > 0 ? price : 0;
  const digits = safe >= 1000 ? 2 : safe >= 1 ? 2 : 6;
  return `${safe.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${currency}`;
}

/** Deutsch formatierte Prozent-Änderung mit Vorzeichen: +1,82 % */
export function formatPercentGerman(value: number): string {
  if (!Number.isFinite(value)) return "0,00 %";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

/* ==================== Symbol-Normalisierung ==================== */

export type KnownSymbol = {
  id: string;
  /** Anzeige-Name (Watchlist), z. B. "BTC/USD". */
  label: string;
  /** CoinGecko-ID für den Live-Abruf. */
  coingeckoId: string;
  name: string;
};

export const MICRO_TRADING_SYMBOLS: KnownSymbol[] = [
  { id: "btc", label: "BTC/USD", coingeckoId: "bitcoin", name: "Bitcoin" },
  { id: "eth", label: "ETH/USD", coingeckoId: "ethereum", name: "Ethereum" },
  { id: "sol", label: "SOL/USD", coingeckoId: "solana", name: "Solana" },
  { id: "link", label: "LINK/USD", coingeckoId: "chainlink", name: "Chainlink" },
  { id: "avax", label: "AVAX/USD", coingeckoId: "avalanche-2", name: "Avalanche" },
  { id: "dot", label: "DOT/USD", coingeckoId: "polkadot", name: "Polkadot" },
];

/** Normalisiert Nutzereingaben (" btc ", "Bitcoin", "BTC/USD") auf eine bekannte Symbol-ID oder null. */
export function normalizeSymbol(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const bare = trimmed.replace(/\/usd$|-usd|\s+usd$/g, "");
  const byId = MICRO_TRADING_SYMBOLS.find((symbol) => symbol.id === bare);
  if (byId) return byId.id;
  const byName = MICRO_TRADING_SYMBOLS.find(
    (symbol) => symbol.name.toLowerCase() === bare || symbol.label.toLowerCase() === trimmed || symbol.coingeckoId === bare,
  );
  return byName?.id ?? null;
}

export function getSymbol(id: string): KnownSymbol | null {
  return MICRO_TRADING_SYMBOLS.find((symbol) => symbol.id === id) ?? null;
}

/* ==================== Candle-Validierung ==================== */

export type CandleValidationResult = {
  valid: boolean;
  /** Ehrliche, sprechende Meldung für die UI — nie stillschweigend leer. */
  reason: string;
};

/** Prüft eine Candle-Serie auf strukturelle Plausibilität (ungesichertes Roh-Datum wird nie gerechnet). */
export function validateCandleSeries(series: CandleSeries): CandleValidationResult {
  if (series.candles.length === 0) {
    return { valid: false, reason: "Keine Kursdaten vorhanden — Analyse nicht möglich." };
  }
  for (const candle of series.candles) {
    const values = [candle.open, candle.high, candle.low, candle.close];
    if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
      return { valid: false, reason: `Ungültige Kursdaten bei ${new Date(candle.time).toISOString()} — Analyse abgelehnt.` };
    }
    if (candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close) || candle.low > candle.high) {
      return { valid: false, reason: `Widersprüchliche Hoch/Tief-Werte bei ${new Date(candle.time).toISOString()} — Analyse abgelehnt.` };
    }
  }
  for (let i = 1; i < series.candles.length; i += 1) {
    if (series.candles[i].time <= series.candles[i - 1].time) {
      return { valid: false, reason: "Kursdaten sind nicht chronologisch sortiert — Analyse abgelehnt." };
    }
  }
  if (!getSymbol(series.symbolId)) {
    return { valid: false, reason: `Unbekanntes Symbol "${series.symbolId}" — Analyse abgelehnt.` };
  }
  return { valid: true, reason: "Kursdaten strukturell plausibel." };
}

/* ==================== Indikatoren (Sprint 213) ==================== */

/** Einfacher gleitender Durchschnitt; liefert null, solange die Periode nicht gefüllt ist. */
export function sma(values: number[], period: number): number[] {
  if (period < 1) throw new Error("SMA-Periode muss mindestens 1 sein.");
  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    result.push(i >= period - 1 ? sum / period : Number.NaN);
  }
  return result;
}

/** Exponentieller gleitender Durchschnitt (Standard-Alpha 2/(period+1)). */
export function ema(values: number[], period: number): number[] {
  if (period < 1) throw new Error("EMA-Periode muss mindestens 1 sein.");
  const alpha = 2 / (period + 1);
  const result: number[] = [];
  let previous: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) {
      result.push(Number.NaN);
      continue;
    }
    if (previous === null) {
      // Seed: SMA der ersten `period` Werte (Standard-Praxis, deterministisch).
      const seed = values.slice(0, period).reduce((acc, value) => acc + value, 0) / period;
      previous = seed;
    } else {
      previous = alpha * values[i] + (1 - alpha) * previous;
    }
    result.push(previous);
  }
  return result;
}

/** RSI (Wilder, Periode typisch 14) auf Schlusskursen — Werte 0..100, null-artig als NaN vor Warmup. */
export function rsi(closes: number[], period = 14): number[] {
  if (period < 1) throw new Error("RSI-Periode muss mindestens 1 sein.");
  const result: number[] = [Number.NaN];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      result.push(i === period ? computeRsi(avgGain, avgLoss) : Number.NaN);
      continue;
    }
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push(computeRsi(avgGain, avgLoss));
  }
  return result;
}

function computeRsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Jahres-normalisierte Volatilität aus täglichen Schlusskurs-Renditen (Standardabweichung). */
export function annualizedVolatility(closes: number[]): number {
  if (closes.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = returns.reduce((acc, value) => acc + value, 0) / returns.length;
  const variance = returns.reduce((acc, value) => acc + (value - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(365);
}

/** Prozent-Änderung zwischen erstem und letztem Kurs einer Serie. */
export function totalChangePercent(closes: number[]): number {
  if (closes.length < 2 || closes[0] === 0) return 0;
  return ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
}
