import { describe, expect, it } from "vitest";

import {
  analyzeSignals,
  annualizedVolatility,
  DEFAULT_BACKTEST_OPTIONS,
  drawdownGuard,
  parseTradingPrompt,
  buildTradingResult,
  TRADING_DISCLAIMER,
  PaperPortfolio,
  sizePaperPosition,
  validatePaperPortfolio,
  DEFAULT_SIGNAL_CONFIG,
  runBacktest,
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

describe("micro trading signal engine (Sprint 214)", () => {
  function trendingSeries(up: boolean): CandleSeries {
    // 80 Punkte: 35 neutrale, dann klar auf-/abwärts — der Crossover fällt
    // sicher in den auswertbaren Bereich (beide SMAs definiert ab Index 29).
    const candles: Candle[] = [];
    for (let i = 0; i < 80; i += 1) {
      const base = up ? 100 + Math.max(0, i - 35) * 2 : 100 - Math.max(0, i - 35) * 2;
      candles.push(candle(1_000 * (i + 1), base, base + 1, base - 1, base));
    }
    return series(candles);
  }

  it("erkennt einen Aufwärts-Crossover als Beobachtung mit Begründung", () => {
    const signals = analyzeSignals(trendingSeries(true));
    expect(signals.some((signal) => signal.kind === "bullish-cross")).toBe(true);
    const cross = signals.find((signal) => signal.kind === "bullish-cross");
    expect(cross?.reason).toContain("überkreuzt");
    expect(cross?.confidence).toBeLessThanOrEqual(1);
  });

  it("erkennt einen Abwärts-Crossover", () => {
    const signals = analyzeSignals(trendingSeries(false));
    expect(signals.some((signal) => signal.kind === "bearish-cross")).toBe(true);
  });

  it("meldet ehrlich, wenn die Daten nicht reichen oder ungültig sind", () => {
    const short = analyzeSignals(series(OK_CANDLES));
    expect(short[0]?.kind).toBe("no-signal");
    expect(short[0]?.reason).toContain("Zu wenig Daten");
    const invalid = analyzeSignals(series([candle(1_000, 100, 90, 95, 105)]));
    expect(invalid[0]?.reason).toContain("abgelehnt");
  });

  it("gibt no-signal bei ruhigem Markt ohne Behauptung", () => {
    const flat = series(Array.from({ length: 40 }, (_, i) => candle(1_000 * (i + 1), 100, 101, 99, 100)));
    const signals = analyzeSignals(flat);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.kind).toBe("no-signal");
    expect(signals[0]?.reason).toContain("keine auffällige Beobachtung");
  });
});

describe("micro trading backtest engine (Sprint 215)", () => {
  function oscillatingSeries(): CandleSeries {
    // 90 Punkte: sanfte Welle — erzeugt mehrere Crossover mit klaren Abschnitten.
    const candles: Candle[] = [];
    for (let i = 0; i < 90; i += 1) {
      const base = 100 + Math.sin(i / 8) * 12 + i * 0.3;
      candles.push(candle(1_000 * (i + 1), base, base + 1, base - 1, base));
    }
    return series(candles);
  }

  it("simulierte Trades sind hypothetisch, gebührenbereinigt und lückenlos", () => {
    const result = runBacktest(oscillatingSeries());
    expect(result.hypothetical).toBe(true);
    expect(result.trades.length).toBeGreaterThan(0);
    for (const trade of result.trades) {
      expect(trade.exitIndex).toBeGreaterThan(trade.entryIndex);
      expect(trade.netReturnPercent).toBeLessThan(trade.grossReturnPercent);
    }
    expect(result.finalEquity).toBeGreaterThan(0);
    expect(result.maxDrawdownPercent).toBeGreaterThanOrEqual(0);
    expect(result.buyAndHoldReturnPercent).not.toBe(result.returnPercent);
  });

  it("lehnt ungültige Serien ab, statt Unsinn zu simulieren", () => {
    const result = runBacktest(series([]));
    expect(result.trades).toEqual([]);
    expect(result.caveats[0]).toContain("Keine Kursdaten");
    expect(result.returnPercent).toBe(0);
  });

  it("warnt ehrlich bei zu wenigen Trades und fehlenden Gebühren", () => {
    const noFee = runBacktest(oscillatingSeries(), DEFAULT_SIGNAL_CONFIG, { ...DEFAULT_BACKTEST_OPTIONS, feePercent: 0 });
    expect(noFee.caveats.some((caveat) => caveat.includes("Gebühren"))).toBe(true);
    const result = runBacktest(oscillatingSeries(), DEFAULT_SIGNAL_CONFIG, { ...DEFAULT_BACKTEST_OPTIONS, minTradesForStatistics: 100 });
    expect(result.caveats.some((caveat) => caveat.includes("statistisch nicht belastbar"))).toBe(true);
  });
});

describe("micro trading paper risk sizing (Sprint 216)", () => {
  const portfolio: PaperPortfolio = { capital: 1_000, maxPositionShare: 0.2, maxLossShare: 0.01, totalRiskBudget: 0.03 };

  it("begrenzt die Positionsgröße auf das engste Limit", () => {
    const sizing = sizePaperPosition(portfolio, 5, 0);
    // Verlust-Cap: 10 USD Risiko / 5 % Stop => 200 USD Einsatz.
    expect(sizing.positionSize).toBe(200);
    expect(sizing.reason).toContain("Verlust-Cap");
    expect(sizing.riskAmount).toBe(10);
    expect(sizing.budgetUsed).toBeCloseTo(0.01, 10);
  });

  it("respektiert das Risiko-Budget bereits verbrauchter Positionen", () => {
    const sizing = sizePaperPosition(portfolio, 5, 0.025);
    expect(sizing.positionSize).toBeCloseTo(100, 6);
    expect(sizing.reason).toContain("Risiko-Budget");
  });

  it("lehnt ungültige Portfolios und Stops ehrlich ab", () => {
    expect(sizePaperPosition({ ...portfolio, capital: -1 }, 5).positionSize).toBe(0);
    expect(sizePaperPosition({ ...portfolio, maxPositionShare: 2 }, 5).reason).toContain("Risikolimits");
    expect(sizePaperPosition(portfolio, 0).reason).toContain("Ungültiger Stop-Abstand");
    expect(sizePaperPosition(portfolio, 5, 1).reason).toContain("ausgeschöpft");
    expect(validatePaperPortfolio(portfolio).valid).toBe(true);
  });

  it("blockt neue Positionen im überzogenen Drawdown", () => {
    expect(drawdownGuard(900, 1_000, 5).allowed).toBe(false);
    expect(drawdownGuard(990, 1_000, 5).allowed).toBe(true);
    expect(drawdownGuard(1_100, 1_000, 5).reason).toContain("Kein Drawdown");
  });
});

describe("micro trading prompt parsing (Sprint 217)", () => {
  it("leerer Prompt fällt auf die Watchlist zurück", () => {
    const command = parseTradingPrompt("   ");
    expect(command.actions).toEqual(["watchlist"]);
    expect(command.days).toBe(90);
  });

  it("erkennt Aktionen und Symbole in deutschen Sätzen", () => {
    const command = parseTradingPrompt("Backteste BTC der letzten 30 Tage und zeig die Signale");
    expect(command.actions).toContain("backtest");
    expect(command.actions).toContain("signals");
    expect(command.symbolIds).toContain("btc");
    expect(command.days).toBe(30);
  });

  it("findet Symbole auch als Fließtext (Bitcoin und Ethereum)", () => {
    const command = parseTradingPrompt("Analysiere Bitcoin und Ethereum im Chart");
    expect(command.symbolIds).toEqual(["btc", "eth"]);
    expect(command.actions).toContain("analyze");
  });

  it("respektiert verneinte Signalaufträge", () => {
    const command = parseTradingPrompt("Analysiere BTC, aber keine Signale und keine Kaufempfehlung");
    expect(command.actions).not.toContain("signals");
    expect(command.actions).toContain("analyze");
  });

  it("liest Stop-Abstand und klemmt Tage und Stop in sinnvolle Grenzen", () => {
    const command = parseTradingPrompt("Positionsgröße für SOL mit Stop bei 4,5 % über 2 Tage");
    expect(command.actions).toContain("risk");
    expect(command.symbolIds).toContain("sol");
    expect(command.stopDistancePercent).toBeCloseTo(4.5, 10);
    expect(command.days).toBe(7);
    const clamped = parseTradingPrompt("Backtest ETH 400 Tage mit Stop bei 99 %");
    expect(clamped.days).toBe(365);
    expect(clamped.stopDistancePercent).toBe(99);
  });
});

describe("micro trading honest result builder (Sprint 218)", () => {
  const goodSeries: CandleSeries = series(Array.from({ length: 80 }, (_, i) => candle(1_000 * (i + 1), 100 + i, 101 + i, 99 + i, 100 + i)));

  it("nennt fehlende Symbole statt sie zu überspringen", () => {
    const result = buildTradingResult(parseTradingPrompt("Analysiere BTC"), {});
    expect(result.lines.some((line) => line.includes("Keine Daten geladen"))).toBe(true);
    expect(result.disclaimer).toBe(TRADING_DISCLAIMER);
  });

  it("beschreibt geladene Serien mit Kennzahlen und Disclaimer", () => {
    const result = buildTradingResult(parseTradingPrompt("Analysiere BTC 30 Tage"), { btc: goodSeries });
    expect(result.headline).toBe("Markt-Übersicht");
    expect(result.lines.some((line) => line.includes("Tageskurse"))).toBe(true);
    expect(result.lines.some((line) => line.includes("Volatilität"))).toBe(true);
    expect(result.disclaimer).toContain("keine Anlageberatung");
  });

  it("liefert Signale nur auf Wunsch, Backtest mit Hinweisen, Risiko mit Nachvollziehbarkeit", () => {
    const signals = buildTradingResult(parseTradingPrompt("Signale für BTC"), { btc: goodSeries });
    expect(signals.headline).toBe("Signal-Beobachtungen");
    expect(signals.lines.some((line) => line.includes("kein Handlungsauftrag"))).toBe(true);

    const backtest = buildTradingResult(parseTradingPrompt("Backtest BTC"), { btc: goodSeries });
    expect(backtest.headline).toBe("Hypothetischer Backtest");
    expect(backtest.lines.some((line) => line.includes("hypothetische Trades"))).toBe(true);

    const risk = buildTradingResult(parseTradingPrompt("Positionsgröße BTC mit Stop bei 4 %"), { btc: goodSeries });
    expect(risk.headline).toBe("Papier-Risikorechnung");
    expect(risk.lines.some((line) => line.includes("Positionsgröße"))).toBe(true);
  });
});
