import { describe, expect, it } from "vitest";

import {
  autoTradeTick,
  closePosition,
  createPaperWallet,
  equityOf,
  manualClose,
  openPosition,
  positionBudget,
  statsOf,
  TRADING_GUARDRAILS,
  type PaperWallet,
} from "@/lib/paper-trading-engine";

const BTC = { symbolId: "btc", symbol: "BTC/USD", price: 50000, changePercent: -5 };

describe("Sprint 232 — Paper-Trading-Engine: Guardrails", () => {
  it("startet mit exakt 20 € Startkapital und leeren Positionen", () => {
    const w = createPaperWallet();
    expect(w.cash).toBe(20);
    expect(w.positions).toHaveLength(0);
    expect(w.startCapital).toBe(TRADING_GUARDRAILS.startCapital);
  });

  it("Positionssizing: Cash verteilt auf freie Slots, gedeckelt auf 40 % des Startkapitals", () => {
    const w = createPaperWallet();
    expect(positionBudget(w)).toBe(6.66); // 20 / 3 Slots (abgefloorlt)
    const res = openPosition(w, BTC, 1000);
    expect("position" in res).toBe(true);
    if ("position" in res) {
      expect(res.wallet.cash).toBe(13.34); // 20 - 6.66 Budget
      expect(res.position.qty).toBeGreaterThan(0);
      expect(res.position.qty * res.position.entryPrice).toBeLessThanOrEqual(6.66 - 0.00666); // Budget - Gebühr
      expect(res.position.stopLoss).toBeCloseTo(50000 * 0.98, 0);
      expect(res.position.takeProfit).toBeCloseTo(50000 * 1.04, 0);
    }
  });

  it("Blockt: 4. Position, Doppel-Buy desselben Symbols, Mindestvolumen", () => {
    let w = createPaperWallet();
    const markets = [BTC, { ...BTC, symbolId: "eth", symbol: "ETH/USD" }, { ...BTC, symbolId: "sol", symbol: "SOL/USD" }];
    for (const m of markets) {
      const res = openPosition(w, m, 50000);
      expect("position" in res).toBe(true);
      if ("position" in res) w = res.wallet;
    }
    expect(w.positions).toHaveLength(3);
    const fourth = openPosition(w, { ...BTC, symbolId: "link", symbol: "LINK/USD" }, 100);
    expect("error" in fourth).toBe(true);
    const duplicate = openPosition(w, BTC, 50000);
    expect("error" in duplicate).toBe(true);
  });

  it("Stop-Loss schließt hart bei -2 % inklusive Gebühr", () => {
    const base = createPaperWallet();
    const opened = openPosition(base, BTC, 1000);
    if (!("position" in opened)) throw new Error("open fehlgeschlagen");
    const crash = { ...BTC, price: opened.position.stopLoss * 0.999 };
    const tick = autoTradeTick(opened.wallet, [crash], 2000);
    expect(tick.wallet.positions).toHaveLength(0);
    expect(tick.wallet.history).toHaveLength(1);
    expect(tick.wallet.history[0].reason).toBe("STOP_LOSS");
    expect(tick.wallet.history[0].pnl).toBeLessThan(0); // Verlust inkl. Gebühr
    expect(tick.events.some((e) => e.type === "CLOSE" && e.reason === "STOP_LOSS")).toBe(true);
    // Re-Entry-Sperre: der Dip (-5 %/24h) darf NICHT sofort wieder kaufen
    expect(tick.events.filter((e) => e.type === "OPEN")).toHaveLength(0);
  });

  it("Re-Entry-Sperre laeuert nach 30 Minuten ab", () => {
    const base = createPaperWallet();
    const opened = openPosition(base, BTC, 1000);
    if (!("position" in opened)) throw new Error("open fehlgeschlagen");
    const tick = autoTradeTick(opened.wallet, [{ ...BTC, price: opened.position.stopLoss * 0.999 }], 2000);
    expect(tick.wallet.positions).toHaveLength(0);
    // Innerhalb der Sperre: kein Wiedereinstieg
    const blocked = autoTradeTick(tick.wallet, [BTC], 2000 + 29 * 60_000);
    expect(blocked.wallet.positions).toHaveLength(0);
    // Nach Ablauf: Wiedereinstieg erlaubt
    const after = autoTradeTick(tick.wallet, [BTC], 2000 + 31 * 60_000);
    expect(after.wallet.positions).toHaveLength(1);
  });

  it("Take-Profit realisiert bei +4 % und der Loop verzinst sich", () => {
    const base = createPaperWallet();
    const opened = openPosition(base, BTC, 1000);
    if (!("position" in opened)) throw new Error("open fehlgeschlagen");
    const spike = { ...BTC, price: opened.position.takeProfit * 1.001, changePercent: 0 };
    const tick = autoTradeTick(opened.wallet, [spike], 3000);
    expect(tick.wallet.history[0].reason).toBe("TAKE_PROFIT");
    expect(tick.wallet.history[0].pnl).toBeGreaterThan(0);
    expect(tick.wallet.cash).toBeGreaterThan(0);
    expect(equityOf(tick.wallet, {})).toBeGreaterThan(base.cash * 0.99); // Loop-Plus, Gebühren eingerechnet
  });

  it("Dip-Signal (-4 %/24h) löst automatisch einen Kauf aus, kein Dip kein Kauf", () => {
    const tick = autoTradeTick(createPaperWallet(), [BTC], 4000);
    expect(tick.wallet.positions).toHaveLength(1);
    expect(tick.events[0].type).toBe("OPEN");
    const calm = autoTradeTick(createPaperWallet(), [{ ...BTC, changePercent: 1.2 }], 5000);
    expect(calm.wallet.positions).toHaveLength(0);
  });

  it("Fehlende Kurse: Position bleibt unberührt, kein Blind-Schließen", () => {
    const base = createPaperWallet();
    const opened = openPosition(base, BTC, 1000);
    if (!("position" in opened)) throw new Error("open fehlgeschlagen");
    const tick = autoTradeTick(opened.wallet, [], 6000); // kein Kurs geliefert
    expect(tick.wallet.positions).toHaveLength(1);
  });

  it("Manueller Close und Statistik (Trefferquote, Equity)", () => {
    const base = createPaperWallet();
    const opened = openPosition(base, BTC, 1000);
    if (!("position" in opened)) throw new Error("open fehlgeschlagen");
    const closed = manualClose(opened.wallet, opened.position.id, 51000, 7000);
    if ("error" in closed) throw new Error("close fehlgeschlagen");
    const stats = statsOf(closed.wallet, {});
    expect(stats.trades).toBe(1);
    expect(stats.winRate).toBe(1); // Gewinn-Trade
    expect(stats.realized).toBeGreaterThan(0);
    expect(stats.equity).toBeCloseTo(closed.wallet.cash, 2);
  });

  it("Kapital-Loop über mehrere Gewinne wächst realistisch (Gebühren berücksichtigt)", () => {
    let w: PaperWallet = createPaperWallet();
    for (let i = 0; i < 5; i += 1) {
      const opened = openPosition(w, { ...BTC, symbolId: `sym${i}`, symbol: `SYM${i}` }, 1000);
      if (!("position" in opened)) throw new Error("open fehlgeschlagen");
      const closed = closePosition(opened.wallet, opened.position, opened.position.takeProfit * 1.001, "TAKE_PROFIT", 8000 + i);
      w = closed.wallet;
    }
    expect(statsOf(w, {}).realized).toBeGreaterThan(0);
    expect(w.cash).toBeGreaterThan(20);
  });
});
