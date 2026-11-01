import { useSyncExternalStore } from "react";

/**
 * Sprint 172 — React-Compiler-Purity: Aktuelle Uhrzeit im Render lesbar.
 *
 * Date.now() waehrend des Renderns ist unrein (React-Compiler: purity). Diese
 * Uhr kapselt den Zeit lesenden Zugriff in einem externen Store: Der Ticker
 * lebt im Modul-Scope, der gecachte Snapshot ist zwischen Ticks stabil und
 * useSyncExternalStore ist der von React sanktionierte Weg, externe Werte im
 * Render zu lesen. Komponenten, die die Uhr abonnieren, re-rendern sekundlich.
 */

let cachedNowMs = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function startTimer() {
  timer = setInterval(() => {
    cachedNowMs = Date.now();
    for (const listener of listeners) listener();
  }, 1_000);
  // In Node-/Test-Umgebungen den Prozess nicht offen halten (RN kennt unref nicht).
  (timer as ReturnType<typeof setInterval> & { unref?: () => void }).unref?.();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  if (timer === null) startTimer();
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Aktuelle Uhrzeit in Millisekunden — sekundlicher Tick, gecacht, SSR-sicher. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => cachedNowMs, () => 0);
}

/**
 * Sprint 347 — Flacker-Fix: dasselbe Uhr-Prinzip, aber mit waehlbarem
 * Takt. Sekuendliche Uhren re-rendern den KOMPLETTEN abonnierenden
 * Screen (in Chat-Tabs inklusive aller Nachrichten-Bubbles) — auf
 * Android sichtbares Flackern. Tages-Trenner brauchen keinen Sekundentakt;
 * Warteschlangen-Alterungen auch nicht. Eigener Timer-Cache pro Intervall:
 * Anfragen mit gleichem Intervall teilen sich einen Ticker.
 */
const tickers = new Map<number, { cachedNowMs: number; timer: ReturnType<typeof setInterval> | null; listeners: Set<() => void> }>();

function getTicker(intervalMs: number) {
  let ticker = tickers.get(intervalMs);
  if (!ticker) {
    ticker = { cachedNowMs: Date.now(), timer: null, listeners: new Set() };
    tickers.set(intervalMs, ticker);
  }
  return ticker;
}

function subscribeEvery(intervalMs: number, callback: () => void) {
  const ticker = getTicker(intervalMs);
  ticker.listeners.add(callback);
  if (ticker.timer === null) {
    ticker.timer = setInterval(() => {
      ticker.cachedNowMs = Date.now();
      for (const listener of ticker.listeners) listener();
    }, intervalMs);
    (ticker.timer as ReturnType<typeof setInterval> & { unref?: () => void }).unref?.();
  }
  return () => {
    ticker.listeners.delete(callback);
    if (ticker.listeners.size === 0 && ticker.timer !== null) {
      clearInterval(ticker.timer);
      ticker.timer = null;
    }
  };
}

/** Aktuelle Uhrzeit mit eigenem Takt (ms) — z. B. 60_000 fuer Tages-Trenner. */
export function useNowEvery(intervalMs: number): number {
  const ticker = getTicker(intervalMs);
  return useSyncExternalStore(
    (callback) => subscribeEvery(intervalMs, callback),
    () => ticker.cachedNowMs,
    () => 0,
  );
}
