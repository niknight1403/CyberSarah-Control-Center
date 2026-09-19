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
