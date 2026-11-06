/**
 * Quarantaene fuer Media-Schluessel (TTS, Bildmotive, Vertonung).
 *
 * Problem, das dieser Baustein loest: Ein 401-Schluessel ist kein Zufall und
 * kein Aussetzer. Er bleibt ungueltig, bis ein Mensch ihn austauscht. Trotzdem
 * wurde er bisher fuer jede Szene erneut probiert — das kostet Zeit, blaeht die
 * Fehlerliste auf und verdeckt, dass der Lauf nur noch von einem einzigen
 * funktionierenden Schluessel getragen wird.
 *
 * Regeln:
 * - 401/402/403 → Schluessel ist fuer diesen Lauf tot (Quarantaene, endgueltig).
 * - 429 → Cooldown bis `retryAfter` (oder Standardfenster), danach wieder frei.
 * - 408/5xx/Netzwerk → kurzer Cooldown, kein Ausschluss.
 * - 400/404 → Anfrage passt nicht zum Modell: kein Schluesselproblem, aber auch
 *   kein neuer Versuch mit demselben Schluessel.
 * - Ein Lauf ohne verfuegbaren Schluessel endet ehrlich als unvollstaendig,
 *   nicht als "irgendwie fertig".
 *
 * Pure Logik: keine Uhr, kein Netzwerk, keine Prozessglobalen.
 */

export type MediaFailureClass = "invalid_key" | "quota" | "transient" | "bad_request" | "unknown";

export type MediaKeyState = {
  /** Stabiler Fingerabdruck des Schluessels (kein Klartext im Log). */
  keyId: string;
  /** Anzeigename der Quelle, z. B. "gemini" oder "openai". */
  source: string;
  quarantined: boolean;
  /** Zeitpunkt, ab dem ein Cooldown abgelaufen ist (ms seit Epoche). */
  cooldownUntil: number | null;
  successes: number;
  failures: number;
  lastFailure: MediaFailureClass | null;
};

export type MediaCanRun = { allowed: true } | { allowed: false; reason: string };

export const MEDIA_DEFAULT_COOLDOWN_MS = {
  quota: 60_000,
  transient: 15_000,
};

/** Kurzer, stabiler Fingerabdruck — djb2, wie in der Anfrage-Logik. */
export function mediaKeyId(apiKey: string): string {
  let hash = 5381;
  for (let index = 0; index < apiKey.length; index += 1) {
    hash = ((hash << 5) + hash + apiKey.charCodeAt(index)) >>> 0;
  }
  return `k${hash.toString(16).padStart(8, "0")}`;
}

export function classifyMediaFailure(status: number | null): MediaFailureClass {
  if (status === null) return "transient";
  if (status === 401 || status === 402 || status === 403) return "invalid_key";
  if (status === 429) return "quota";
  if (status === 408 || (status >= 500 && status <= 599)) return "transient";
  if (status === 400 || status === 404) return "bad_request";
  return "unknown";
}

export function initialKeyState(input: { apiKey: string; source: string }): MediaKeyState {
  return {
    keyId: mediaKeyId(input.apiKey),
    source: input.source,
    quarantined: false,
    cooldownUntil: null,
    successes: 0,
    failures: 0,
    lastFailure: null,
  };
}

/**
 * Verarbeitet eine Beobachtung und gibt den neuen Zustand zurueck.
 * `now` wird hereingereicht, damit die Logik testbar bleibt.
 */
export function observeMediaAttempt(
  state: MediaKeyState,
  observation: { status: number | null; now: number; retryAfterSeconds?: number | null },
): MediaKeyState {
  const failure = classifyMediaFailure(observation.status);
  if (observation.status !== null && observation.status >= 200 && observation.status < 300) {
    return { ...state, successes: state.successes + 1, cooldownUntil: null, lastFailure: null };
  }
  const next: MediaKeyState = {
    ...state,
    failures: state.failures + 1,
    lastFailure: failure,
  };
  if (failure === "invalid_key") {
    // Endgueltig: ein 401 wird nicht durch Warten besser.
    return { ...next, quarantined: true, cooldownUntil: null };
  }
  if (failure === "quota") {
    const window = Math.max(
      1_000,
      Math.min(300_000, (observation.retryAfterSeconds ?? 0) > 0 ? (observation.retryAfterSeconds as number) * 1_000 : MEDIA_DEFAULT_COOLDOWN_MS.quota),
    );
    return { ...next, cooldownUntil: observation.now + window };
  }
  if (failure === "transient") {
    return { ...next, cooldownUntil: observation.now + MEDIA_DEFAULT_COOLDOWN_MS.transient };
  }
  if (failure === "bad_request") {
    // Kein erneuter Versuch mit demselben Schluessel in diesem Lauf.
    return { ...next, quarantined: true };
  }
  return next;
}

export function isKeyUsable(state: MediaKeyState, now: number): boolean {
  if (state.quarantined) return false;
  return state.cooldownUntil === null || state.cooldownUntil <= now;
}

/** Naechster brauchbarer Schluessel in Reihenfolge; `null` heisst: keiner mehr. */
export function nextUsableKey(states: readonly MediaKeyState[], now: number): MediaKeyState | null {
  return states.find((state) => isKeyUsable(state, now)) ?? null;
}

/** Gruende, warum ein Lauf nicht starten darf — vor dem ersten Token ausgeben. */
export function canStartMediaRun(states: readonly MediaKeyState[], now: number): MediaCanRun {
  if (states.length === 0) {
    return {
      allowed: false,
      reason:
        "Kein Media-Schluessel konfiguriert. Vertonung und Bildmotive brauchen GEMINI_API_KEY oder OPENAI_API_KEY; ohne Schluessel wird nichts verkauft, was nicht lieferbar ist.",
    };
  }
  if (states.some((state) => isKeyUsable(state, now))) return { allowed: true };
  const quarantined = states.filter((state) => state.quarantined).length;
  const cooling = states.length - quarantined;
  return {
    allowed: false,
    reason: `Alle ${states.length} Media-Schluessel sind nicht nutzbar (${quarantined} ungueltig, ${cooling} im Cooldown). Erst Schluessel erneuern, dann liefern.`,
  };
}

/** Ehrliche Zusammenfassung fuer Log und Manifest. */
export function summarizeMediaKeys(states: readonly MediaKeyState[]) {
  return {
    keys: states.length,
    usable: states.filter((state) => !state.quarantined && state.cooldownUntil === null).length,
    quarantined: states.filter((state) => state.quarantined).length,
    cooling: states.filter((state) => !state.quarantined && state.cooldownUntil !== null).length,
    successes: states.reduce((sum, state) => sum + state.successes, 0),
    failures: states.reduce((sum, state) => sum + state.failures, 0),
    invalidSources: states.filter((state) => state.lastFailure === "invalid_key").map((state) => state.source),
  };
}

/**
 * Reihenfolge fuer den naechsten Versuch: gesunde Schluessel zuerst, dann
 * abgekuehlte (falls sie zwischenzeitlich frei werden), Quarantaene nie.
 */
export function orderForAttempt(states: readonly MediaKeyState[], now: number): MediaKeyState[] {
  const usable = states.filter((state) => isKeyUsable(state, now));
  const cooling = states.filter((state) => !state.quarantined && !isKeyUsable(state, now));
  return [...usable, ...cooling];
}
