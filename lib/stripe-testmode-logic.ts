/**
 * Sprint 319 — Stripe-Testmodus-Kennzeichnung: reine, deterministische
 * Logik, die den Test-Modus IMMER sichtbar macht.
 *
 * Datenfluss:
 *   Der konfigurierte Stripe-Key entscheidet den Modus; die Logik
 *   liefert Badge-Text, Warnhinweise und Faerbung fuer alle Stellen,
 *   die mit Zahlungen zu tun haben.
 *
 * Ehrlichkeits-Grenze: Ohne Key heisst es "Stripe nicht konfiguriert"
 *   — nicht live und nicht test. Test-Modus-Daten zaehlen NIE als
 *   echter Umsatz; Dashboards muessen das kennzeichnen.
 */

export type StripeMode = "live" | "test" | "nicht-konfiguriert";

export function detectStripeMode(secretKey: string | null | undefined): StripeMode {
  const key = (secretKey ?? "").trim();
  if (key.length === 0) return "nicht-konfiguriert";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  return "nicht-konfiguriert";
}

/** Badge-Text, der an jeder Zahlungs-Flaeche auftaucht. */
export function modeBadgeLabel(mode: StripeMode): string {
  switch (mode) {
    case "test":
      return "STRIPE TEST-MODUS — keine echten Zahlungen";
    case "live":
      return "Stripe Live-Modus";
    case "nicht-konfiguriert":
      return "Stripe nicht konfiguriert";
  }
}

/** Warnstufe fuer Dashboards: Test-Daten nie als Umsatz deklarieren. */
export function revenueGuardForMode(mode: StripeMode): { countsAsRevenue: boolean; hint: string } {
  if (mode === "test") {
    return { countsAsRevenue: false, hint: "Test-Modus-Zahlungen werden NICHT als Umsatz gewertet." };
  }
  if (mode === "nicht-konfiguriert") {
    return { countsAsRevenue: false, hint: "Ohne Stripe-Konfiguration gibt es keine Umsatzdaten." };
  }
  return { countsAsRevenue: true, hint: "Live-Umsatz." };
}

/** Checkout-Button-Verhalten im Test-Modus ehrlich benennen. */
export function checkoutDisclaimer(mode: StripeMode): string | null {
  return mode === "test"
    ? "Achtung: Test-Checkout — Abbuchungen sind Sandbox-Events ohne echte Zahlung."
    : null;
}
