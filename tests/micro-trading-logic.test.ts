import { describe, expect, it } from "vitest";

import {
  formatPercentGerman,
  formatPriceGerman,
  getSymbol,
  MICRO_TRADING_SYMBOLS,
  normalizeSymbol,
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
