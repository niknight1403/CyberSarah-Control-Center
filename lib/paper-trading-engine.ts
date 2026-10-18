/**
 * Sprint 232 — Paper-Trading-Engine (20-Euro-Kapital-Loop).
 *
 * Ehrlichkeits-Regeln des Moduls:
 * - PAPER ONLY: Ausfuehrung ausschliesslich in der Simulation, echte Kurse
 *   kommen live ueber die bestehende CoinGecko-Anbindung (micro-trading-data).
 * - Alle Risiko-Guardrails sind Konstanten im Code, nicht vom UI ueberschreibbar.
 * - Jede Entscheidung (Open/Close/Groesse) faellt in dieser reinen Logik;
 *   der Hook macht nur I/O (Persistenz, Ticks).
 */

export const TRADING_GUARDRAILS = {
  /** Feste Startsumme des Kapital-Loops (Euro, paper). */
  startCapital: 20,
  /** Simulierte Ausfuehrungsgebuehr je Trade in Prozent. */
  feePercent: 0.1,
  /** Hartes Verlust-Limit je Position (vom Einstiegskurs). */
  stopLossPercent: 2,
  /** Gewinnmitnahme je Position (vom Einstiegskurs). */
  takeProfitPercent: 4,
  /** Maximal gleichzeitig offene Micro-Positionen. */
  maxPositions: 3,
  /** Hartes Limit je Position: Anteil des STARTKAPITALS (nie mehr als 40%). */
  maxPositionShare: 0.4,
  /** Re-Entry-Sperre nach Stop-Loss (Millisekunden) — nie ins fallende Messer zurück. */
  stopLossCooldownMs: 30 * 60_000,
  /** Kleinster sinnvoller Auftrag (Euro) — darunter kein Einstieg. */
  minNotional: 3,
  /** Kauf-Signal: Symbol im Watchlist-Dip (24h-Aenderung in Prozent). */
  dipSignalPercent: -4,
} as const;

export type PaperPosition = {
  id: string;
  symbolId: string;
  symbol: string;
  qty: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: number;
};

export type PaperTradeReason = "STOP_LOSS" | "TAKE_PROFIT" | "MANUAL";

export type PaperTrade = {
  id: string;
  symbolId: string;
  symbol: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  reason: PaperTradeReason;
  openedAt: number;
  closedAt: number;
};

export type PaperWallet = {
  version: 1;
  cash: number;
  startCapital: number;
  positions: PaperPosition[];
  history: PaperTrade[];
  /** symbolId -> Sperrzeitstempel (Re-Entry nach Stop-Loss). */
  cooldowns?: Record<string, number>;
};

export type TickEvent =
  | { type: "OPEN"; symbol: string; qty: number; price: number; note: string }
  | { type: "CLOSE"; symbol: string; reason: PaperTradeReason; pnl: number; note: string }
  | { type: "SKIP"; note: string };

export type MarketPrice = { symbolId: string; symbol: string; price: number; changePercent: number | null };

export function createPaperWallet(startCapital: number = TRADING_GUARDRAILS.startCapital): PaperWallet {
  return { version: 1, cash: startCapital, startCapital, positions: [], history: [], cooldowns: {} };
}

export function unrealizedPnlOf(wallet: PaperWallet, priceById: Record<string, number>): number {
  return wallet.positions.reduce((sum, p) => sum + ((priceById[p.symbolId] ?? p.entryPrice) - p.entryPrice) * p.qty, 0);
}

export function equityOf(wallet: PaperWallet, priceById: Record<string, number>): number {
  return wallet.cash + wallet.positions.reduce((sum, p) => sum + (priceById[p.symbolId] ?? p.entryPrice) * p.qty, 0);
}

export function realizedPnlOf(wallet: PaperWallet): number {
  return wallet.history.reduce((sum, t) => sum + t.pnl, 0);
}

export function statsOf(wallet: PaperWallet, priceById: Record<string, number>) {
  const wins = wallet.history.filter((t) => t.pnl > 0).length;
  return {
    equity: equityOf(wallet, priceById),
    cash: wallet.cash,
    realized: realizedPnlOf(wallet),
    unrealized: unrealizedPnlOf(wallet, priceById),
    openPositions: wallet.positions.length,
    trades: wallet.history.length,
    winRate: wallet.history.length > 0 ? wins / wallet.history.length : 0,
  };
}

function feeOn(notional: number): number {
  return (notional * TRADING_GUARDRAILS.feePercent) / 100;
}

/**
 * Positionssizing: Das Barvermoegen wird gleichmaessig auf die freien Slots
 * verteilt (20 EUR / 3 Slots = 6,67 EUR), je Position gedeckelt auf
 * maxPositionShare des STARTKAPITALS. So koennen auch kleine Konten alle
 * Slots fuellen, ohne das Mindestvolumen zu unterlaufen.
 */
export function positionBudget(wallet: PaperWallet): number {
  const freeSlots = Math.max(1, TRADING_GUARDRAILS.maxPositions - wallet.positions.length);
  const perSlot = wallet.cash / freeSlots;
  const cap = wallet.startCapital * TRADING_GUARDRAILS.maxPositionShare;
  return Math.floor(Math.min(perSlot, cap) * 100) / 100;
}

/** Einstieg: Guardrails pruefen, Menge runden, Gebuehr sofort abziehen. */
export function openPosition(
  wallet: PaperWallet,
  market: MarketPrice,
  nowMs: number
): { wallet: PaperWallet; position: PaperPosition } | { error: string } {
  if (wallet.positions.length >= TRADING_GUARDRAILS.maxPositions) {
    return { error: `Maximal ${TRADING_GUARDRAILS.maxPositions} offene Positionen` };
  }
  if (wallet.positions.some((p) => p.symbolId === market.symbolId)) {
    return { error: `${market.symbol}: Position bereits offen` };
  }
  const budget = positionBudget(wallet);
  if (budget < TRADING_GUARDRAILS.minNotional) {
    return { error: "Barbestand zu klein fuer eine neue Micro-Position" };
  }
  const fee = feeOn(budget);
  if (budget - fee < TRADING_GUARDRAILS.minNotional) {
    return { error: "Gebuehr frisst das Mindestvolumen auf" };
  }
  const invest = budget - fee;
  const qty = Math.floor((invest / market.price) * 1e6) / 1e6;
  if (qty <= 0) {
    return { error: "Preis zu hoch fuer Micro-Position" };
  }
  const position: PaperPosition = {
    id: `${market.symbolId}-${nowMs}`,
    symbolId: market.symbolId,
    symbol: market.symbol,
    qty,
    entryPrice: market.price,
    stopLoss: market.price * (1 - TRADING_GUARDRAILS.stopLossPercent / 100),
    takeProfit: market.price * (1 + TRADING_GUARDRAILS.takeProfitPercent / 100),
    openedAt: nowMs,
  };
  return { wallet: { ...wallet, cash: Math.round((wallet.cash - budget) * 100) / 100, positions: [...wallet.positions, position] }, position };
}

/** Ausstieg: Stop-Loss / Take-Profit pruefen, Gebuehr und Erlös verbuchen. */
export function closePosition(
  wallet: PaperWallet,
  position: PaperPosition,
  exitPrice: number,
  reason: PaperTradeReason,
  nowMs: number
): { wallet: PaperWallet; trade: PaperTrade } {
  const gross = exitPrice * position.qty;
  const fee = feeOn(gross);
  const net = gross - fee;
  const pnl = net - position.entryPrice * position.qty;
  const trade: PaperTrade = {
    ...position,
    exitPrice,
    pnl: Math.round(pnl * 100) / 100,
    pnlPercent: Math.round((pnl / (position.entryPrice * position.qty)) * 10000) / 100,
    reason,
    closedAt: nowMs,
  };
  return {
    wallet: {
      ...wallet,
      cash: Math.round((wallet.cash + net) * 100) / 100,
      positions: wallet.positions.filter((p) => p.id !== position.id),
      history: [...wallet.history, trade],
    },
    trade,
  };
}

/**
 * Ein Kapital-Loop-Tick: 1) offene Positionen gegen Stop/Ziel pruefen,
 * 2) auf Dips neuer Einstiege (Guardrails), sonst Skip.
 * Preise fehlen -> Position bleibt unberuehrt, kein Stillschliessen aus Unwissen.
 */
export function autoTradeTick(wallet: PaperWallet, markets: MarketPrice[], nowMs: number): { wallet: PaperWallet; events: TickEvent[] } {
  let current = wallet;
  const events: TickEvent[] = [];
  const priceById: Record<string, number> = {};
  for (const m of markets) priceById[m.symbolId] = m.price;

  for (const position of [...current.positions]) {
    const price = priceById[position.symbolId];
    if (!price) continue;
    if (price <= position.stopLoss) {
      const res = closePosition(current, position, price, "STOP_LOSS", nowMs);
      current = { ...res.wallet, cooldowns: { ...(res.wallet.cooldowns ?? {}), [position.symbolId]: nowMs + TRADING_GUARDRAILS.stopLossCooldownMs } };
      events.push({ type: "CLOSE", symbol: position.symbol, reason: "STOP_LOSS", pnl: res.trade.pnl, note: `${position.symbol} Stop-Loss bei ${price.toFixed(2)} USD` });
    } else if (price >= position.takeProfit) {
      const res = closePosition(current, position, price, "TAKE_PROFIT", nowMs);
      current = res.wallet;
      events.push({ type: "CLOSE", symbol: position.symbol, reason: "TAKE_PROFIT", pnl: res.trade.pnl, note: `${position.symbol} Ziel erreicht bei ${price.toFixed(2)} USD` });
    }
  }

  if (current.positions.length < TRADING_GUARDRAILS.maxPositions) {
    const cooldowns = current.cooldowns ?? {};
    const candidates = markets
      .filter((m) => m.changePercent != null && m.changePercent <= TRADING_GUARDRAILS.dipSignalPercent)
      .filter((m) => !current.positions.some((p) => p.symbolId === m.symbolId))
      .filter((m) => (cooldowns[m.symbolId] ?? 0) <= nowMs) // Re-Entry-Sperre nach Stop-Loss
      .sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0));
    for (const dip of candidates) {
      const res = openPosition(current, dip, nowMs);
      if ("error" in res) {
        events.push({ type: "SKIP", note: res.error });
        break;
      }
      current = res.wallet;
      events.push({
        type: "OPEN",
        symbol: dip.symbol,
        qty: res.position.qty,
        price: dip.price,
        note: `${dip.symbol} Dip-Kauf (${dip.changePercent?.toFixed(1)} %/24h) — ${res.position.qty} Stk. zu ${dip.price.toFixed(2)} USD`,
      });
      if (current.positions.length >= TRADING_GUARDRAILS.maxPositions) break;
    }
  }
  return { wallet: current, events };
}

/** Manueller Ausstieg aus dem UI (Grund MANUAL, gleiche Gebuehr-/Erlöslogik). */
export function manualClose(wallet: PaperWallet, positionId: string, price: number, nowMs: number): { wallet: PaperWallet } | { error: string } {
  const position = wallet.positions.find((p) => p.id === positionId);
  if (!position) return { error: "Position nicht gefunden" };
  return { wallet: closePosition(wallet, position, price, "MANUAL", nowMs).wallet };
}
