/**
 * Sprint 299 — Snackbar/Toast-System: reine, deterministische Logik fuer
 * eine vereinheitlichte Benachrichtigungs-Quelle mit konsequentem Styling.
 *
 * Datenfluss:
 *   UI-Komponenten rufen push/dismiss auf einen Zustand; die Logik
 *   entscheidet Dedup, Cap und Auto-Dismiss rein berechnet. Kein Timer
 *   im Modul — die UI fragt autoDismissDue(now) ab (testbar, ehrlich).
 *
 * Ehrlichkeits-Grenze: Dedup verhindert Spam, aber NIEMALS eine
 *   Fehlermeldung still schlucken — der Text der letzten Meldung
 *   gewinnt, mit Aktualitaets-Hinweis wenn eine identische ueberschrieben
 *   wurde (suppressedCount).
 */

export type SnackbarSeverity = "info" | "success" | "warning" | "error";

export type SnackbarMessage = {
  id: string;
  text: string;
  severity: SnackbarSeverity;
  /** Persistenter Gruppenschluessel; identische Schluessel deduplizieren. */
  dedupKey?: string;
  /** Sichtbarkeitsdauer in ms; 0 = manuell zu schliessen. */
  durationMs: number;
  actionLabel?: string;
  createdAt: number;
};

/** Maximal sichtbare/stehende Meldungen; aeltere fallen FIFO raus. */
export const MAX_ACTIVE_SNACKBARS = 3;

export type SnackbarState = {
  messages: SnackbarMessage[];
  /** Wie viele identische Meldungen seit dem letzten Push unterdrueckt wurden. */
  suppressedCount: number;
};

export const EMPTY_SNACKBAR_STATE: SnackbarState = {
  messages: [],
  suppressedCount: 0,
};

/** Schweregrad-Gewichtung: Fehler bleiben laenger stehen als Infos. */
export const DEFAULT_DURATION_BY_SEVERITY: Record<SnackbarSeverity, number> = {
  info: 3500,
  success: 3000,
  warning: 5000,
  error: 7000,
};

/** Fuegt eine Meldung hinzu. Dedup ueber dedupKey, FIFO-Cap ueber MAX_ACTIVE_SNACKBARS. */
export function pushSnackbar(
  state: SnackbarState,
  message: Omit<SnackbarMessage, "createdAt" | "durationMs"> & {
    createdAt?: number;
    durationMs?: number;
  },
): SnackbarState {
  const full: SnackbarMessage = {
    ...message,
    durationMs:
      message.durationMs ?? DEFAULT_DURATION_BY_SEVERITY[message.severity],
    createdAt: message.createdAt ?? 0,
  };

  if (full.dedupKey) {
    const existing = state.messages.find((m) => m.dedupKey === full.dedupKey);
    if (existing) {
      // Letzter Text gewinnt; unterdrueckte Anzahl steigt ehrlich mit.
      return {
        suppressedCount: state.suppressedCount + 1,
        messages: state.messages.map((m) =>
          m.id === existing.id ? { ...full, id: existing.id } : m,
        ),
      };
    }
  }

  const messages = [...state.messages, full];
  if (messages.length > MAX_ACTIVE_SNACKBARS) {
    return {
      suppressedCount: state.suppressedCount,
      messages: messages.slice(messages.length - MAX_ACTIVE_SNACKBARS),
    };
  }
  return { suppressedCount: state.suppressedCount, messages };
}

/** Entfernt eine Meldung nach Id (Fehl-Id = keine Aenderung). */
export function dismissSnackbar(
  state: SnackbarState,
  id: string,
): SnackbarState {
  return {
    suppressedCount: state.suppressedCount,
    messages: state.messages.filter((m) => m.id !== id),
  };
}

/** Ids, deren Dauer abgelaufen ist (durationMs=0 wird NIE automatisch entfernt). */
export function autoDismissDueIds(state: SnackbarState, now: number): string[] {
  return state.messages
    .filter((m) => m.durationMs > 0 && now - m.createdAt >= m.durationMs)
    .map((m) => m.id);
}

/** Hoechster Schweregrad im Zustand (fuer Sound/Vibration-Priorisierung). */
export function highestSeverity(
  state: SnackbarState,
): SnackbarSeverity | null {
  const order: SnackbarSeverity[] = ["info", "success", "warning", "error"];
  let best: SnackbarSeverity | null = null;
  for (const m of state.messages) {
    if (best === null || order.indexOf(m.severity) > order.indexOf(best)) {
      best = m.severity;
    }
  }
  return best;
}
