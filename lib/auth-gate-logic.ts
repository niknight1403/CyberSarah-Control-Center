/**
 * Sprint 373 — Auth-Gate-Logik (rein, deterministisch).
 *
 * Der Login-Bereich ist ab sofort der Einstieg der App: Wer nicht
 * angemeldet ist, sieht zuerst den Login-Screen — danach erst Onboarding
 * (einmalig) und die App selbst. Diese Funktion leitet die Phase rein aus
 * Zustandseingaben ab; Navigation und tRPC-Aufrufe macht der Aufrufer
 * (app/(tabs)/_layout.tsx).
 *
 * Ehrlichkeits-Regeln:
 *   - "loading", solange die Session-Abfrage nicht entschieden ist —
 *     niemals auf den Login-Bildschirm wechseln, bevor feststeht, dass
 *     niemand angemeldet ist (kein Login-Flackern für eingeloggte Nutzer).
 *   - Login hat Vorrang vor Onboarding: Der Login-Bereich ist der Start
 *     der App (Owner-Anforderung Sprint 373), das einmalige Onboarding
 *     läuft nach der Anmeldung.
 */

export type AuthGatePhase = "loading" | "login" | "onboarding" | "app";

export type AuthGateInput = {
  /** Hat die account.me-Abfrage ein Ergebnis geliefert (egal ob Nutzer oder "nicht angemeldet")? */
  meResolved: boolean;
  /** Angemeldeter Nutzer (null = nicht angemeldet). */
  user: { role?: string } | null | undefined;
  /** Onboarding-Status aus dem lokalen Hook. */
  onboardingStatus: "incomplete" | "complete" | "loading";
};

export function resolveAuthGate(input: AuthGateInput): AuthGatePhase {
  if (!input.meResolved) return "loading";
  if (!input.user) return "login";
  if (input.onboardingStatus === "incomplete") return "onboarding";
  return "app";
}

/** Ziel-Route je Phase — zentral, damit Gate und Tests dieselbe Wahrheit nutzen. */
export function authGateRoute(phase: AuthGatePhase): "/login" | "/onboarding" | null {
  if (phase === "login") return "/login";
  if (phase === "onboarding") return "/onboarding";
  return null;
}
