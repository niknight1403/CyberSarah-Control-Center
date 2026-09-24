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

/* ==================== Signal-Engine (Sprint 214) ==================== */

export type PaperSignal = {
  symbolId: string;
  /** Analytische Beobachtung — ausdrücklich KEINE Kauf-/Verkaufsempfehlung. */
  kind: "bullish-cross" | "bearish-cross" | "momentum-extrem" | "no-signal";
  /** Index der Candle, auf der sich das Signal ergab. */
  index: number;
  reason: string;
  /** Heuristische Konfidenz 0..1 — kein Wahrscheinlichkeitsmaß, nur Vergleichbarkeit. */
  confidence: number;
};

export type SignalConfig = {
  fastPeriod: number;
  slowPeriod: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
};

export const DEFAULT_SIGNAL_CONFIG: SignalConfig = {
  fastPeriod: 10,
  slowPeriod: 30,
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
};

/**
 * Analysiert eine validierte Candle-Serie auf technische Beobachtungen.
 * Rückgabe ist bewusst eine Beobachtung mit Begründung, keine Handlung.
 * Unzureichende Daten => "no-signal" mit ehrlicher Begründung.
 */
export function analyzeSignals(series: CandleSeries, config: SignalConfig = DEFAULT_SIGNAL_CONFIG): PaperSignal[] {
  const validation = validateCandleSeries(series);
  if (!validation.valid) {
    return [{ symbolId: series.symbolId, kind: "no-signal", index: 0, reason: validation.reason, confidence: 0 }];
  }
  const closes = series.candles.map((candle) => candle.close);
  if (closes.length < config.slowPeriod + 1) {
    return [{
      symbolId: series.symbolId, kind: "no-signal", index: 0,
      reason: `Zu wenig Daten (${closes.length} Punkte) für Periode ${config.slowPeriod} — keine seriöse Analyse möglich.`,
      confidence: 0,
    }];
  }
  const fast = sma(closes, config.fastPeriod);
  const slow = sma(closes, config.slowPeriod);
  const momentum = rsi(closes, config.rsiPeriod);
  const signals: PaperSignal[] = [];
  for (let i = config.slowPeriod; i < closes.length; i += 1) {
    const crossUp = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
    const crossDown = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
    if (crossUp) {
      signals.push({
        symbolId: series.symbolId, kind: "bullish-cross", index: i,
        reason: `SMA${config.fastPeriod} überkreuzt SMA${config.slowPeriod} aufwärts (Close ${formatPriceGerman(closes[i], series.currency)}).`,
        confidence: momentum[i] > 50 ? 0.7 : 0.5,
      });
    } else if (crossDown) {
      signals.push({
        symbolId: series.symbolId, kind: "bearish-cross", index: i,
        reason: `SMA${config.fastPeriod} überkreuzt SMA${config.slowPeriod} abwärts (Close ${formatPriceGerman(closes[i], series.currency)}).`,
        confidence: momentum[i] < 50 ? 0.7 : 0.5,
      });
    }
    if (!Number.isNaN(momentum[i]) && (momentum[i] >= config.rsiOverbought || momentum[i] <= config.rsiOversold)) {
      signals.push({
        symbolId: series.symbolId, kind: "momentum-extrem", index: i,
        reason: `RSI ${formatPercentGerman(momentum[i] - 50)} im Extrembereich — momentum-getriebene Bewegung, kein Trendnachweis.`,
        confidence: 0.4,
      });
    }
  }
  if (signals.length === 0) {
    signals.push({
      symbolId: series.symbolId, kind: "no-signal", index: closes.length - 1,
      reason: "Keine SMA-Überkreuzung und kein RSI-Extrem im Zeitraum — keine auffällige Beobachtung.",
      confidence: 0,
    });
  }
  return signals;
}

/* ==================== Backtest-Engine (Sprint 215) ==================== */

export type HypotheticalTrade = {
  /** Candle-Index des (hypothetischen) Einstiegs. */
  entryIndex: number;
  exitIndex: number;
  entryPrice: number;
  exitPrice: number;
  /** Brutto-Rendite der Position in Prozent (ohne Gebühren). */
  grossReturnPercent: number;
  netReturnPercent: number;
  holdingDays: number;
};

export type BacktestResult = {
  symbolId: string;
  strategy: string;
  /** Ausdrücklich hypothetisch: Ergebnis der Vergangenheit, keine Prognose. */
  hypothetical: true;
  trades: HypotheticalTrade[];
  initialCapital: number;
  finalEquity: number;
  returnPercent: number;
  winRate: number;
  /** Größter prozentualer Rückgang der Equity-Kurve (immer >= 0). */
  maxDrawdownPercent: number;
  buyAndHoldReturnPercent: number;
  /** Ehrliche Warnhinweise (z. B. Überanpassung, zu wenige Trades). */
  caveats: string[];
};

export type BacktestOptions = {
  /** Handelsspanne in Tagen, die eine Position maximal gehalten wird. */
  maxHoldingDays: number;
  /** Simulierte Round-Turn-Gebühr in Prozent (z. B. 0,5 = 0,5 %). */
  feePercent: number;
  initialCapital: number;
  minTradesForStatistics: number;
};

export const DEFAULT_BACKTEST_OPTIONS: BacktestOptions = {
  maxHoldingDays: 10,
  feePercent: 0.5,
  initialCapital: 1_000,
  minTradesForStatistics: 5,
};

/**
 * Simuliert die Signal-Strategie (SMA-Cross) auf historischen Daten.
 * Jeder bullish-cross öffnet eine hypothetische Position, die beim nächsten
 * bearish-cross oder nach maxHoldingDays geschlossen wird. Kein Look-ahead:
 * Einstieg/Exit erfolgen zum Close der Signal-Candle.
 */
export function runBacktest(series: CandleSeries, config: SignalConfig = DEFAULT_SIGNAL_CONFIG, options: BacktestOptions = DEFAULT_BACKTEST_OPTIONS): BacktestResult {
  const validation = validateCandleSeries(series);
  const caveats: string[] = [];
  if (!validation.valid) {
    return {
      symbolId: series.symbolId, strategy: "SMA-Cross", hypothetical: true, trades: [], initialCapital: options.initialCapital,
      finalEquity: options.initialCapital, returnPercent: 0, winRate: 0, maxDrawdownPercent: 0, buyAndHoldReturnPercent: 0,
      caveats: [validation.reason],
    };
  }
  const closes = series.candles.map((candle) => candle.close);
  const signals = analyzeSignals(series, config);
  const crossSignals = signals.filter((signal) => signal.kind === "bullish-cross" || signal.kind === "bearish-cross");
  const trades: HypotheticalTrade[] = [];
  let equity = options.initialCapital;
  const equityCurve: number[] = [equity];
  let openEntry: { index: number; price: number } | null = null;

  const closeTrade = (entry: { index: number; price: number }, exitIndex: number, exitPrice: number) => {
    const grossReturn = (exitPrice - entry.price) / entry.price;
    const netReturn = grossReturn - (options.feePercent / 100) * 2;
    const days = exitIndex - entry.index;
    const positionSize = equity; // vereinfachte Voll-Position (Paper-Annahme)
    equity = equity * (1 + netReturn);
    trades.push({
      entryIndex: entry.index, exitIndex, entryPrice: entry.price, exitPrice,
      grossReturnPercent: grossReturn * 100, netReturnPercent: netReturn * 100, holdingDays: days,
    });
    equityCurve.push(equity);
    openEntry = null;
  };

  for (let i = 0; i < closes.length; i += 1) {
    const cross = crossSignals.find((signal) => signal.index === i);
    if (openEntry === null) {
      if (cross?.kind === "bullish-cross") openEntry = { index: i, price: closes[i] };
    } else if (cross?.kind === "bearish-cross") {
      closeTrade(openEntry, i, closes[i]);
    } else if (i - openEntry.index >= options.maxHoldingDays) {
      closeTrade(openEntry, i, closes[i]);
    }
    if (openEntry !== null && i === closes.length - 1) {
      // Offene Position zum letzten Kurs schließen — ehrlich als Simulationsschnitt.
      closeTrade(openEntry, i, closes[i]);
      caveats.push("Letzte Position wurde am Datenende geschlossen, nicht durch ein Gegensignal.");
    }
  }

  const wins = trades.filter((trade) => trade.netReturnPercent > 0).length;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of equityCurve) {
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak);
  }
  if (trades.length > 0 && trades.length < options.minTradesForStatistics) {
    caveats.push(`Nur ${trades.length} Trades — die Win-Rate ist statistisch nicht belastbar.`);
  }
  if (options.feePercent === 0) {
    caveats.push("Gebühren wurden nicht simuliert; reale Ergebnisse lägen tiefer.");
  }
  const buyAndHold = closes.length > 0 ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100 : 0;
  return {
    symbolId: series.symbolId,
    strategy: `SMA${config.fastPeriod}/${config.slowPeriod}-Cross`,
    hypothetical: true,
    trades,
    initialCapital: options.initialCapital,
    finalEquity: equity,
    returnPercent: ((equity - options.initialCapital) / options.initialCapital) * 100,
    winRate: trades.length === 0 ? 0 : (wins / trades.length) * 100,
    maxDrawdownPercent: maxDrawdown * 100,
    buyAndHoldReturnPercent: buyAndHold,
    caveats,
  };
}

/* ==================== Paper-Risiko & Positionsgrößen (Sprint 216) ==================== */

export type PaperPortfolio = {
  /** Simuliertes Gesamtkapital (USD). */
  capital: number;
  /** Maximaler Anteil einer einzelnen Position am Kapital (0..1). */
  maxPositionShare: number;
  /** Maximal simulierter Verlust je Position (0..1 vom eingsetzten Kapital). */
  maxLossShare: number;
  /** Gesamtes Risiko-Budget über alle offenen Positionen (0..1). */
  totalRiskBudget: number;
};

export type PositionSizing = {
  /** Empfohlene (simulierte) Positionsgröße in USD — 0 wenn kein Risiko frei. */
  positionSize: number;
  riskAmount: number;
  /** Ehrliche Begründung der Berechnung (nachvollziehbar für die UI). */
  reason: string;
  /** Bestandteil des Risiko-Budgets, den diese Position verbraucht (0..1). */
  budgetUsed: number;
};

export function validatePaperPortfolio(portfolio: PaperPortfolio): CandleValidationResult {
  if (!Number.isFinite(portfolio.capital) || portfolio.capital <= 0) {
    return { valid: false, reason: "Ungültiges Simulationskapital — Risiko-Rechnung abgelehnt." };
  }
  if (portfolio.maxPositionShare <= 0 || portfolio.maxPositionShare > 1 || portfolio.maxLossShare <= 0 || portfolio.maxLossShare > 1 || portfolio.totalRiskBudget <= 0 || portfolio.totalRiskBudget > 1) {
    return { valid: false, reason: "Risikolimits müssen zwischen 0 % und 100 % liegen." };
  }
  return { valid: true, reason: "Risikolimits plausibel." };
}

/**
 * Fixed-Fractional-Positionsgröße für die SIMULATION: Einsatz wird über den
 * Distanz zwischen Einstand und Stop-Loss begrenzt. Stop-Abstand in Prozent
 * (0..100). Bewusst konservativ; ein Verlust darf nie über maxLossShare gehen.
 */
export function sizePaperPosition(
  portfolio: PaperPortfolio,
  /** Stop-Loss-Abstand vom Einstand in Prozent (z. B. 5 = 5 %). */
  stopDistancePercent: number,
  /** Bereits durch offene Positionen verbrauchtes Risiko (0..1). */
  riskAlreadyUsed = 0,
): PositionSizing {
  const validation = validatePaperPortfolio(portfolio);
  if (!validation.valid) {
    return { positionSize: 0, riskAmount: 0, reason: validation.reason, budgetUsed: 0 };
  }
  if (!Number.isFinite(stopDistancePercent) || stopDistancePercent <= 0 || stopDistancePercent > 100) {
    return { positionSize: 0, riskAmount: 0, reason: "Ungültiger Stop-Abstand — Positionsgröße nicht berechenbar.", budgetUsed: 0 };
  }
  if (riskAlreadyUsed < 0 || riskAlreadyUsed >= 1) {
    return { positionSize: 0, riskAmount: 0, reason: "Risiko-Budget bereits ausgeschöpft oder ungültig.", budgetUsed: Math.max(0, riskAlreadyUsed) };
  }
  const remainingBudget = Math.max(0, portfolio.totalRiskBudget - riskAlreadyUsed);
  if (remainingBudget <= 0) {
    return { positionSize: 0, riskAmount: 0, reason: "Kein simuliertes Risiko-Budget mehr frei.", budgetUsed: portfolio.totalRiskBudget };
  }
  const byLossCap = portfolio.capital * portfolio.maxLossShare / (stopDistancePercent / 100);
  const byBudget = portfolio.capital * remainingBudget / (stopDistancePercent / 100);
  const byShare = portfolio.capital * portfolio.maxPositionShare;
  const positionSize = Math.min(byLossCap, byBudget, byShare);
  const riskAmount = positionSize * (stopDistancePercent / 100);
  const budgetUsed = portfolio.capital > 0 ? riskAmount / portfolio.capital : 0;
  const limits: string[] = [];
  if (positionSize === byShare) limits.push("Positionsanteil-Cap");
  if (positionSize === byLossCap) limits.push("Verlust-Cap");
  if (positionSize === byBudget) limits.push("Risiko-Budget");
  return {
    positionSize,
    riskAmount,
    budgetUsed,
    reason: `Simulierte Größe durch ${limits.join(" und ")} begrenzt; Risiko ${formatPriceGerman(riskAmount)} bei ${formatPercentGerman(stopDistancePercent).replace(" %", " %")} Stop-Abstand.`,
  };
}

/** Drawdown-Wächter für die Simulation: Bei Tieffstand wird kein neues Risiko erlaubt. */
export function drawdownGuard(equity: number, peakEquity: number, maxDrawdownPercent: number): { allowed: boolean; reason: string } {
  if (peakEquity <= 0 || equity > peakEquity) {
    return { allowed: true, reason: "Kein Drawdown vorhanden." };
  }
  const drawdown = (peakEquity - equity) / peakEquity * 100;
  if (!Number.isFinite(drawdown) || drawdown > maxDrawdownPercent) {
    return { allowed: false, reason: `Simulierter Drawdown ${formatPercentGerman(drawdown)} überschreitet das Limit ${formatPercentGerman(maxDrawdownPercent)} — keine neuen Positionen.` };
  }
  return { allowed: true, reason: `Drawdown ${formatPercentGerman(drawdown)} innerhalb des Limits.` };
}
