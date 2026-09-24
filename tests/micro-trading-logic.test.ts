import { describe, expect, it } from "vitest";

import {
  annualizedVolatility,
  ema,
  formatPercentGerman,
  formatPriceGerman,
  getSymbol,
  MICRO_TRADING_SYMBOLS,
  normalizeSymbol,
  rsi,
  sma,
  totalChangePercent,
  validateCandleSeries,
  type Candle,
  type CandleSeries,
} from "../lib/micro-trading-logic";

function candle(time: number, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close };
}

function series(candles: Candle[], symbolId = "btc"): CandleSeries {
  return { symbolId, currency: "USD", candles };
}

const OK_CANDLES: Candle[] = [
  candle(1_000, 100, 110, 95, 105),
  candle(2_000, 105, 115, 100, 112),
  candle(3_000, 112, 120, 108, 118),
];

describe("micro trading core (Sprint 212)", () => {
  it("formatiert Preise und Prozente deutsch", () => {
    expect(formatPriceGerman(94_123.456)).toBe("94.123,46 USD");
    expect(formatPriceGerman(0.1234567)).toBe("0,123457 USD");
    expect(formatPriceGerman(-5)).toBe("0,000000 USD");
    expect(formatPriceGerman(1_500, "EUR")).toBe("1.500,00 EUR");
    expect(formatPercentGerman(1.824)).toBe("+1,82 %");
    expect(formatPercentGerman(-0.4)).toBe("-0,40 %");
    expect(formatPercentGerman(Number.NaN)).toBe("0,00 %");
  });

  it("normalisiert Symbol-Eingaben tolerant und ehrlich", () => {
    expect(normalizeSymbol(" btc ")).toBe("btc");
    expect(normalizeSymbol("BTC/USD")).toBe("btc");
    expect(normalizeSymbol("Bitcoin")).toBe("btc");
    expect(normalizeSymbol("bitcoin")).toBe("btc");
    expect(normalizeSymbol("SOL")).toBe("sol");
    expect(normalizeSymbol("doge")).toBeNull();
    expect(normalizeSymbol("")).toBeNull();
    expect(getSymbol("eth")?.coingeckoId).toBe("ethereum");
    expect(getSymbol("nope")).toBeNull();
    expect(MICRO_TRADING_SYMBOLS.every((symbol) => symbol.id === symbol.id.toLowerCase())).toBe(true);
  });

  it("validiert Candle-Serien strikt und meldet den Grund", () => {
    expect(validateCandleSeries(series(OK_CANDLES)).valid).toBe(true);
    expect(validateCandleSeries(series([])).reason).toContain("Keine Kursdaten");
    expect(validateCandleSeries(series([candle(1_000, 0, 110, 95, 105)])).reason).toContain("Ungültige Kursdaten");
    expect(validateCandleSeries(series([candle(1_000, 100, 90, 95, 105)])).reason).toContain("Widersprüchliche");
    expect(validateCandleSeries(series([candle(2_000, 100, 110, 95, 105), candle(1_000, 105, 115, 100, 112)])).reason).toContain("chronologisch");
    expect(validateCandleSeries(series(OK_CANDLES, "unknown")).reason).toContain("Unbekanntes Symbol");
  });
});

describe("micro trading indicators (Sprint 213)", () => {
  const closes = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 110, 111, 109, 112, 113, 111, 114, 115, 113, 116];

  it("berechnet SMA mit Warmup-Lücke", () => {
    const values = sma([1, 2, 3, 4, 5], 3);
    expect(Number.isNaN(values[0])).toBe(true);
    expect(values[2]).toBeCloseTo(2, 10);
    expect(values[4]).toBeCloseTo(4, 10);
  });

  it("berechnet EMA deterministisch mit SMA-Seed", () => {
    const values = ema(closes, 5);
    const seed = closes.slice(0, 5).reduce((acc, value) => acc + value, 0) / 5;
    expect(values[4]).toBeCloseTo(seed, 10);
    const alpha = 2 / 6;
    expect(values[5]).toBeCloseTo(alpha * closes[5] + (1 - alpha) * seed, 10);
  });

  it("berechnet RSI in sinnvollen Grenzen", () => {
    const rising = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(rsi(rising, 14)[19]).toBe(100);
    const falling = Array.from({ length: 20 }, (_, i) => 100 - i);
    expect(rsi(falling, 14)[19]).toBeCloseTo(0, 10);
    const mixed = rsi(closes, 14);
    expect(mixed[19]).toBeGreaterThan(0);
    expect(mixed[19]).toBeLessThan(100);
    expect(Number.isNaN(mixed[10])).toBe(true);
  });

  it("berechnet Volatilität und Gesamtveränderung ehrlich", () => {
    expect(annualizedVolatility([100])).toBe(0);
    const flat = Array.from({ length: 10 }, () => 100);
    expect(annualizedVolatility(flat)).toBeCloseTo(0, 10);
    expect(annualizedVolatility(closes)).toBeGreaterThan(0);
    expect(totalChangePercent([100, 150])).toBeCloseTo(50, 10);
    expect(totalChangePercent([100])).toBe(0);
  });

  it("lehnt unsinnige Perioden ab", () => {
    expect(() => sma([1], 0)).toThrow();
    expect(() => ema([1], -1)).toThrow();
    expect(() => rsi([1], 0)).toThrow();
  });
});
