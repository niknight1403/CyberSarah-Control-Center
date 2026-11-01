import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { WatchlistEntry } from "@/hooks/use-micro-trading";
import { getSymbol, MICRO_TRADING_SYMBOLS } from "@/lib/micro-trading-logic";
import {
  autoTradeTick,
  createPaperWallet,
  equityOf,
  manualClose,
  statsOf,
  TRADING_GUARDRAILS,
  type PaperWallet,
  type TickEvent,
} from "@/lib/paper-trading-engine";

/**
 * Sprint 232 — React-Kleber der Paper-Trading-Engine.
 * Nur I/O (AsyncStorage, Tick-Timing) — alle Entscheidungen fallen in der
 * reinen Logik (paper-trading-engine.ts). PAPER ONLY, kein Order-Routing.
 */

const STORAGE_KEY = "ccc.paper-trading.wallet.v1";

export type PaperTradingState = {
  wallet: PaperWallet;
  events: TickEvent[];
  autoTrade: boolean;
  loaded: boolean;
};

async function loadWallet(): Promise<PaperWallet> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PaperWallet;
      if (parsed?.version === 1 && typeof parsed.cash === "number" && Array.isArray(parsed.positions)) {
        return parsed;
      }
    }
  } catch {
    /* kaputte Daten: frisch starten */
  }
  return createPaperWallet();
}

export function usePaperTrading(watchlist: WatchlistEntry[]) {
  const [wallet, setWallet] = useState<PaperWallet>(() => createPaperWallet());
  const [events, setEvents] = useState<TickEvent[]>([]);
  const [autoTrade, setAutoTrade] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const autoRef = useRef(false);
  // Ref-Update nur im Effect (react-hooks/lint: nie Refs waehrend des Renders
  // schreiben) — lesend bleibt autoRef in Ticks/Callbacks gleich aktuell.
  useEffect(() => {
    autoRef.current = autoTrade;
  }, [autoTrade]);

  useEffect(() => {
    void loadWallet().then((w) => {
      setWallet(w);
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((w: PaperWallet) => {
    setWallet(w);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(w)).catch(() => {});
  }, []);

  /** Live-Maerkte aus dem Watchlist-Hook fuer die Engine uebersetzen. */
  const markets = watchlist
    .filter((entry): entry is WatchlistEntry & { lastPrice: number } => entry.status === "ok" && entry.lastPrice != null)
    .map((entry) => {
      const meta = getSymbol(entry.symbolId) ?? MICRO_TRADING_SYMBOLS[0];
      return { symbolId: entry.symbolId, symbol: meta.label, price: entry.lastPrice, changePercent: entry.changePercent };
    });

  const priceById = Object.fromEntries(markets.map((m) => [m.symbolId, m.price]));

  const runTick = useCallback(() => {
    if (!autoRef.current || markets.length === 0) return;
    const { wallet: next, events: tickEvents } = autoTradeTick(wallet, markets, Date.now());
    if (tickEvents.length > 0) {
      setEvents((prev) => [...tickEvents, ...prev].slice(0, 30));
      persist(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, markets, persist]);

  /** Kapital-Loop: Tick nach jedem Live-Abruf des Watchlists. */
  useEffect(() => {
    runTick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist]);

  const closeManually = useCallback(
    (positionId: string) => {
      const position = wallet.positions.find((p) => p.id === positionId);
      if (!position) return;
      const price = priceById[position.symbolId];
      if (!price) return;
      const res = manualClose(wallet, positionId, price, Date.now());
      if (!("error" in res)) persist(res.wallet);
    },
    [wallet, priceById, persist]
  );

  const reset = useCallback(() => {
    const fresh = createPaperWallet();
    setEvents([]);
    persist(fresh);
  }, [persist]);

  return {
    wallet,
    stats: statsOf(wallet, priceById),
    equity: equityOf(wallet, priceById),
    events,
    autoTrade,
    loaded,
    guardrails: TRADING_GUARDRAILS,
    toggleAutoTrade: () => setAutoTrade((v) => !v),
    closeManually,
    reset,
  };
}
