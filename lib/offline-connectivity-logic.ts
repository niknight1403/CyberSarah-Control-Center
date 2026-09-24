/**
 * Sprint 345 (Serie G: Mobile-Politur) — Offline-Konnektivitaets-Steuerung:
 * reine, deterministische Logik fuer Verbindungs-Zustaende und ihre
 * Uebergange auf Geraeteseite.
 *
 * Datenfluss:
 *   Rohe Verbindungs-Samples (NetInfo-artig: true/false) werden entprellt —
 *   ein einzelner Blip kippt die Anzeige nicht. Aus dem stabilen Zustand
 *   und der Offline-Dauer leitet diese Logik ab: Banner-Text, welche
 *   Bildschirme nach Reconnect EINMAL aufzufrischen sind, wann die
 *   Offline-Action-Queue (Sprint 48) fortgesetzt wird.
 *
 * Ehrlichkeits-Grenze: Der Zustand "unsicher" wird nie als "online"
 *   ausgegeben — ein frueher Reconnect-Refresh waere geraten. Queue-Resume
 *   erst nach stabilisierter Verbindung, Banner ohne die Offline-Dauer
 *   zu verschweigen.
 */

/** Sichtbarer Verbindungs-Zustand der App. */
export type ConnectivityState = "online" | "offline" | "unsicher";

/** Entprell-Fenster: so viele gleiche Samples in Folge staerken den Zustand. */
export const CONNECTIVITY_DEBOUNCE_SAMPLES = 3;

/**
 * Rohe Samples → entprellter Zustand.
 * Ehrlich: Ohne 3 identische Samples in Folge bleibt/bleibt es "unsicher" —
 * Blips (Tunnel, U-Bahn) kippen die UI nicht.
 */
export function debounceConnectivity(samples: boolean[]): ConnectivityState {
  if (samples.length === 0) return "unsicher";
  const window = samples.slice(-CONNECTIVITY_DEBOUNCE_SAMPLES);
  if (window.length < CONNECTIVITY_DEBOUNCE_SAMPLES) return "unsicher";
  const allTrue = window.every(Boolean);
  const allFalse = window.every((s) => !s);
  if (allTrue) return "online";
  if (allFalse) return "offline";
  return "unsicher";
}

export type ReconnectPlanInput = {
  /** Zustand vor dem Verbindungsabbruch (Vorher-Wert, kein Raten). */
  previousState: ConnectivityState;
  /** Aktueller entprellter Zustand. */
  currentState: ConnectivityState;
  /** Bildschirme, die beim Abbruch NICHT live waren (Cache/Fehler gezeigt). */
  staleScreens: string[];
  /** Anzahl wartender Offline-Actions in der Queue (Sprint 48). */
  queuedActions: number;
  /** Wie lange war die Verbindung weg (ms)? */
  offlineDurationMs: number;
};

export type ReconnectPlan = {
  /** Einmaliges Auffrischen der betroffenen Bildschirme nach Reconnect. */
  refreshScreens: string[];
  /** Queue-Wiederaufnahme (true nur bei stabilisiertem Online). */
  resumeActionQueue: boolean;
  /** Banner-Meldung (null = kein Banner noetig). */
  bannerText: string | null;
};

/** Reconnect-Plan: nur bei echtem Uebergang offline → online passiert etwas. */
export function planReconnect(input: ReconnectPlanInput): ReconnectPlan {
  const reconnected =
    input.previousState === "offline" && input.currentState === "online";
  if (!reconnected) {
    return { refreshScreens: [], resumeActionQueue: false, bannerText: null };
  }
  const minutes = Math.max(1, Math.round(input.offlineDurationMs / 60_000));
  const banner =
    input.queuedActions > 0
      ? `Wieder online nach ${minutes} Min. — ${input.queuedActions} Offline-Aktion(en) werden jetzt ausgefuehrt.`
      : `Wieder online nach ${minutes} Min. — Daten werden aufgefrischt.`;
  return {
    refreshScreens: [...new Set(input.staleScreens)], // dedupliziert, kein Doppel-Refresh
    resumeActionQueue: input.queuedActions > 0,
    bannerText: banner,
  };
}

/** Globaler Offline-Banner-Text (nur im stabilen Offline-Zustand). */
export function offlineBannerText(
  state: ConnectivityState,
  offlineDurationMs: number,
): string | null {
  if (state !== "offline") return null;
  const minutes = Math.floor(offlineDurationMs / 60_000); // Dauer nie aufgerundet
  return minutes < 1
    ? "Keine Verbindung — gezeigte Daten koennen aelter sein."
    : `Keine Verbindung seit ${minutes} Min. — gezeigte Daten koennen aelter sein.`;
}

/**
 * Queue-Wiederaufnahme bleibt ehrlich abwartend: Sie startet NUR im
 * stabilen Online-Zustand — "unsicher" heisst weiter warten, damit keine
 * halben Pushes rausgehen (Sprint 48-Konflikt-Risiko).
 */
export function shouldResumeQueue(
  state: ConnectivityState,
  queuedActions: number,
): boolean {
  return state === "online" && queuedActions > 0;
}

/** Nutzerlesbare Zustands-Uebersicht fuer Diagnose-Ansichten. */
export function describeConnectivity(
  state: ConnectivityState,
  offlineDurationMs: number,
  queuedActions: number,
): string {
  const base =
    state === "online"
      ? "Verbindung steht."
      : state === "offline"
        ? "Offline."
        : "Verbindung unsicher (wird geprueft).";
  const parts = [base];
  if (state !== "online" && offlineDurationMs > 0) {
    parts.push(`Offline-Dauer: ${Math.floor(offlineDurationMs / 60_000)} Min.`);
  }
  if (queuedActions > 0) parts.push(`${queuedActions} Aktion(en) warten auf Ausfuehrung.`);
  return parts.join(" ");
}
