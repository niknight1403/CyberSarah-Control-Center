import { useCallback, useRef, useState } from "react";

import {
  buildTradingResult,
  MICRO_TRADING_SYMBOLS,
  parseTradingPrompt,
  validateCandleSeries,
  type CandleSeries,
  type TradingResult,
} from "@/lib/micro-trading-logic";
import { fetchMarketSeries, type MarketDataStatus } from "@/lib/micro-trading-data";

/**
 * Sprint 220 — React-Kleber des Micro-Trading-Moduls: Watchlist-Liveabruf und
 * Prompt-Analyse. Der Hook orchestriert nur I/O und Zustand; jede Entscheidung
 * (Validierung, Signale, Backtest, Risiko) fällt in der reinen Logik.
 *
 * Ehrlichkeits-Regeln: Laden, Fehler und Rate-Limits sind sichtbare Zustände —
 * niemals eine stille leere Liste. Keine Order-Funktion, nirgendwo.
 */

export type WatchlistEntry = {
  symbolId: string;
  label: string;
  status: "loading" | "ok" | "error";
  lastPrice: number | null;
  changePercent: number | null;
  note: string | null;
};

export type MicroTradingState = {
  watchlist: WatchlistEntry[];
  refreshing: boolean;
  lastPrompt: string;
  result: TradingResult | null;
  analyzing: boolean;
  analyzeError: string | null;
  /** Begründung, warum gerade kein Live-Abruf möglich ist (z. B. Rate-Limit). */
  watchlistNote: string | null;
};

export function useMicroTrading() {
  const [state, setState] = useState<MicroTradingState>({
    watchlist: MICRO_TRADING_SYMBOLS.map((symbol) => ({
      symbolId: symbol.id, label: symbol.label, status: "loading", lastPrice: null, changePercent: null, note: null,
    })),
    refreshing: false,
    lastPrompt: "",
    result: null,
    analyzing: false,
    analyzeError: null,
    watchlistNote: null,
  });
  const statusRef = useRef<MarketDataStatus>({ rateLimitedUntil: 0 });

  const refreshWatchlist = useCallback(async (): Promise<void> => {
    setState((prev) => ({
      ...prev,
      refreshing: true,
      watchlistNote: null,
      watchlist: prev.watchlist.map((entry) => ({ ...entry, status: "loading", note: null })),
    }));
    const results = await Promise.all(
      MICRO_TRADING_SYMBOLS.map(async (symbol): Promise<WatchlistEntry> => {
        try {
          const series: CandleSeries = await fetchMarketSeries(symbol.id, 2, { status: statusRef.current });
          const validation = validateCandleSeries(series);
          if (!validation.valid) {
            return { symbolId: symbol.id, label: symbol.label, status: "error", lastPrice: null, changePercent: null, note: validation.reason };
          }
          const closes = series.candles.map((candle) => candle.close);
          const first = closes[0] ?? 0;
          const last = closes[closes.length - 1] ?? 0;
          return {
            symbolId: symbol.id, label: symbol.label, status: "ok",
            lastPrice: last, changePercent: first > 0 ? ((last - first) / first) * 100 : null,
            note: null,
          };
        } catch (error) {
          return { symbolId: symbol.id, label: symbol.label, status: "error", lastPrice: null, changePercent: null, note: error instanceof Error ? error.message : "Abruf fehlgeschlagen" };
        }
      }),
    );
    setState((prev) => {
      const rateLimited = results.some((entry) => entry.note?.includes("Rate-Limit"));
      const failed = results.filter((entry) => entry.status === "error").length;
      return {
        ...prev,
        refreshing: false,
        watchlist: results,
        watchlistNote: rateLimited
          ? "CoinGecko Rate-Limit erreicht — Watchlist unvollständig, gleich erneut versuchen."
          : failed > 0
            ? `${failed} von ${results.length} Kursen konnten nicht geladen werden.`
            : null,
      };
    });
  }, []);

  const runPrompt = useCallback(async (prompt: string): Promise<void> => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    const command = parseTradingPrompt(trimmed);
    const targets = command.symbolIds.length > 0 ? command.symbolIds : MICRO_TRADING_SYMBOLS.slice(0, 3).map((symbol) => symbol.id);
    setState((prev) => ({ ...prev, analyzing: true, analyzeError: null, lastPrompt: trimmed }));
    const seriesBySymbol: Record<string, CandleSeries> = {};
    let firstError: string | null = null;
    for (const symbolId of targets) {
      try {
        seriesBySymbol[symbolId] = await fetchMarketSeries(symbolId, command.days, { status: statusRef.current });
      } catch (error) {
        firstError = error instanceof Error ? error.message : "Abruf fehlgeschlagen";
      }
    }
    const result = buildTradingResult(command, seriesBySymbol);
    setState((prev) => ({ ...prev, analyzing: false, result, analyzeError: firstError }));
  }, []);

  return { state, refreshWatchlist, runPrompt };
}
