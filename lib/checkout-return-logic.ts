/**
 * Sprint 316 — Stripe-Checkout-Rueckweg: reine, deterministische Logik
 * fuer Erfolg/Abbruch-Seiten mit klarem Zustand.
 *
 * Datenfluss:
 *   Rueckkehr-Parameter (Status aus der URL) + der VERIFIZIERTE
 *   Checkout-Session-Zustand ergeben den Seiten-Zustand. Der URL-
 *   Status allein entscheidet NIE — nur die gepruefte Session.
 *
 * Ehrlichkeits-Grenze: "Erfolg" wird nur aus einer verifizierten,
 * abgeschlossenen Session abgeleitet. Offen/Abgebrochen/Unbekannt
 * bleiben ehrlich getrennt, keine Beschönigung.
 */

export type CheckoutReturnParam = "success" | "cancel" | "pending" | "unknown";

export type VerifiedSessionState = "complete" | "expired" | "open" | null;

export type CheckoutOutcome =
  | { state: "erfolg"; message: string; retry: false }
  | { state: "abgebrochen"; message: string; retry: true }
  | { state: "offen"; message: string; retry: true }
  | { state: "ungueltig"; message: string; retry: true };

/** URL-Parameter robust parsen (unbekannt bleibt unbekannt). */
export function parseReturnParam(raw: string | null | undefined): CheckoutReturnParam {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "success" || value === "cancel" || value === "pending") return value;
  return "unknown";
}

/** Kernentscheidung: verifizierter Session-Zustand schlaegt URL. */
export function resolveCheckoutOutcome(
  urlParam: CheckoutReturnParam,
  session: VerifiedSessionState,
): CheckoutOutcome {
  if (session === "complete") {
    return {
      state: "erfolg",
      message: "Zahlung abgeschlossen — dein Abo ist aktiv. Gutschriften koennten wenige Minuten brauchen.",
      retry: false,
    };
  }
  if (session === "expired") {
    return {
      state: "ungueltig",
      message: "Die Checkout-Session ist abgelaufen. Starte den Checkout einfach erneut.",
      retry: true,
    };
  }
  if (session === "open") {
    return {
      state: "offen",
      message: "Zahlung ist noch offen. Pruefe den Status gleich noch einmal.",
      retry: true,
    };
  }
  // session === null: keine verifizierbare Session
  if (urlParam === "cancel") {
    return {
      state: "abgebrochen",
      message: "Checkout abgebrochen — es wurde nichts abgebucht. Du kannst jederzeit weitersuchen.",
      retry: true,
    };
  }
  return {
    state: "ungueltig",
    message: "Checkout-Zustand konnte nicht verifiziert werden. Bitte erneut versuchen.",
    retry: true,
  };
}

/** Weiter-Button-Logik: nur bei Erfolg gibt es keinen Wiederholungsweg. */
export function primaryActionLabel(outcome: CheckoutOutcome): string {
  return outcome.retry ? "Checkout erneut starten" : "Weiter zur App";
}
