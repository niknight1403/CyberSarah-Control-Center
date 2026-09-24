/**
 * Sprint 329 — Selbstheilungs-Pass: reine, deterministische Logik fuer
 * bekannte Fehlermuster mit automatischer Wiederherstellung.
 *
 * Datenfluss:
 *   Symptom -> Muster -> Aktion. Jede Heilung wird protokolliert; nach
 *   zu vielen Fehlversuchen eskaliert das System ehrlich zum Menschen.
 *
 * Ehrlichkeits-Grenze: Selbstheilung ist NIE unsichtbar — jede Aktion
 *   erzeugt einen Log-Eintrag. Und nach MAX_ATTEMPTS gibt es kein
 *   weiterraten, sondern Eskalation mit voller Vorgeschichte.
 */

export type SelfHealAction = "restart" | "rebuild-cache" | "retry-request" | "reconnect-db";

export type SelfHealPattern = {
  id: string;
  symptomTest: RegExp;
  action: SelfHealAction;
  description: string;
};

export type SelfHealOutcome = { ok: boolean; at: number; detail: string };

export type SelfHealAttemptState = {
  patternId: string;
  outcomes: SelfHealOutcome[];
};

export const SELF_HEAL_MAX_ATTEMPTS = 3;

/** Bekannte Muster (pure Daten; Regex muss deterministisch matchen). */
export const KNOWN_PATTERNS: SelfHealPattern[] = [
  {
    id: "db-connection-lost",
    symptomTest: /ECONNREFUSED|connection terminated|pool exhausted/i,
    action: "reconnect-db",
    description: "DB-Verbindung neu aufbauen (Pool leeren und neu verbinden)",
  },
  {
    id: "cache-stale",
    symptomTest: /stale cache|Etag mismatch|checksum mismatch/i,
    action: "rebuild-cache",
    description: "Betroffenen Cache-Bereich invalidieren und neu aufbauen",
  },
  {
    id: "transient-http",
    symptomTest: /503|502|upstream unavailable/i,
    action: "retry-request",
    description: "Request mit Backoff wiederholen",
  },
];

/** Erkanntes Muster fuer ein Symptom oder null (kein Raten). */
export function matchPattern(symptom: string): SelfHealPattern | null {
  return KNOWN_PATTERNS.find((p) => p.symptomTest.test(symptom)) ?? null;
}

/** Ergebnis eines Heilversuchs verbuchen (append-only). */
export function recordOutcome(state: SelfHealAttemptState, outcome: SelfHealOutcome): SelfHealAttemptState {
  return { ...state, outcomes: [...state.outcomes, outcome] };
}

/** Ehrliche Entscheidung: weiterheilen oder eskalieren? */
export function decideNextStep(state: SelfHealAttemptState): {
  step: "heilen" | "warten" | "eskalieren";
  reason: string;
} {
  const failures = state.outcomes.filter((o) => !o.ok).length;
  const last = state.outcomes[state.outcomes.length - 1];

  if (last?.ok) {
    return { step: "warten", reason: `Muster geheilt nach ${failures} Fehlversuch(en).` };
  }
  if (failures >= SELF_HEAL_MAX_ATTEMPTS) {
    return {
      step: "eskalieren",
      reason: `${failures} Fehlversuche — automatische Heilung gestoppt, Mensch muss rein.`,
    };
  }
  return { step: "heilen", reason: `Versuch ${failures + 1} von ${SELF_HEAL_MAX_ATTEMPTS}.` };
}

/** Log-Zeile je Heilversuch — Selbstheilung bleibt IMMER sichtbar. */
export function formatHealLogLine(pattern: SelfHealPattern, attempt: number, ok: boolean, at: number): string {
  return `[self-heal] ${pattern.id} Versuch ${attempt} ${ok ? "ERFOLGREICH" : "FEHLGESCHLAGEN"} — Aktion: ${pattern.action} (${new Date(at).toISOString()})`;
}
