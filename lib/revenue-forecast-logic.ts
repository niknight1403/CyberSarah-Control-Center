/**
 * Umsatzprognose — und die Frage, wann sie aufhoert zu raten.
 *
 * Bis genug Kaeufe gemessen sind, rechnet das Modell mit offen gelegten
 * Annahmen. Ab drei bezahlten Kunden werden die gemessenen Raten verwendet,
 * weil ab dann die eigene Zahlenlage aussagekraeftiger ist als jede Annahme.
 *
 * Grundsaetze:
 * - Annahmen stehen sichtbar im Ergebnis (`basis`), nicht im Kommentar.
 * - Gemessene Raten werden nie beschoenigt: eine Rate von 0 bleibt 0.
 * - Das Modell verkauft keine Sicherheit: die Ausgabe ist eine Spanne, keine
 *   Zusage.
 */
import type { FunnelRates, KpiId } from "./kpi-weekly-logic";

export const MIN_PAID_FOR_MEASURED_FORECAST = 3;

/** Offengelegte Annahmen, solange keine eigenen Zahlen vorliegen. */
export const STATIC_ASSUMPTIONS = {
  /** Anteil gestarteter Checkouts, die bezahlt werden. */
  checkoutToPaid: 0.25,
  /** Anteil Anfragen, aus denen ein Gespraech wird. */
  requestToCall: 0.5,
  /** Anteil Gespraeche, die zum Abschluss fuehren. */
  callToPaid: 0.2,
  /** Durchschnittlicher Monatsumsatz pro Kunde in Cent (Einstieg 299 EUR, gemischt). */
  arpuCents: 34_900,
  /** Monatliche Kuendigungsquote. */
  churnRate: 0.08,
} as const;

export type ForecastBasis = "annahmen" | "gemessen" | "gemischt";

export type ForecastInput = {
  /** Summen der letzten Wochen. */
  totals: Record<KpiId, number>;
  /** Gemessene Raten aus der KPI-Auswertung. */
  measured: FunnelRates;
  /** Bezahlte Kunden insgesamt — entscheidet ueber die Umstellung. */
  paidCustomers: number;
  /** Abschluesse, die aus Gespraechen entstanden, falls bekannt. */
  paidFromCalls?: number | null;
};

export type ForecastScenario = {
  months: number;
  newCustomers: number;
  mrrCents: number;
  /** Kumulierter Umsatz inkl. Abwanderung. */
  cumulativeRevenueCents: number;
};

export type ForecastResult = {
  basis: ForecastBasis;
  /** Ab wann auf gemessene Raten umgestellt wird. */
  switchAt: number;
  paidCustomers: number;
  rates: FunnelRates;
  usedRateSource: { checkoutToPaid: "annahme" | "gemessen"; requestToCall: "annahme" | "gemessen"; callToPaid: "annahme" | "gemessen" };
  scenarios: ForecastScenario[];
  notes: string[];
};

function pickRate(measured: number | null, assumed: number): { value: number; source: "annahme" | "gemessen" } {
  return measured === null ? { value: assumed, source: "annahme" } : { value: measured, source: "gemessen" };
}

/** Wie viele Kunden aus den vorhandenen Funnel-Zahlen folgen. */
export function projectNewCustomers(input: ForecastInput): { fromCheckouts: number; fromCalls: number } {
  const useMeasured = input.paidCustomers >= MIN_PAID_FOR_MEASURED_FORECAST;
  const checkoutRate = useMeasured ? input.measured.checkoutToPaid : null;
  const requestRate = useMeasured ? input.measured.requestToCall : null;
  const callRate = useMeasured ? input.measured.callToPaid : null;

  const checkoutConversion = pickRate(checkoutRate, STATIC_ASSUMPTIONS.checkoutToPaid).value;
  const requestConversion = pickRate(requestRate, STATIC_ASSUMPTIONS.requestToCall).value;
  const callConversion = pickRate(callRate, STATIC_ASSUMPTIONS.callToPaid).value;

  return {
    fromCheckouts: Math.floor(input.totals.checkouts_started * checkoutConversion),
    fromCalls: Math.floor(input.totals.intro_requests * requestConversion * callConversion),
  };
}

/**
 * Erwarteter Monatsumsatz nach `months`, inklusive Abwanderung.
 * Bewusst einfach: eine Prognose, die niemand nachrechnen kann, glaubt niemand.
 */
export function forecast(input: ForecastInput): ForecastResult {
  const useMeasured = input.paidCustomers >= MIN_PAID_FOR_MEASURED_FORECAST;
  const basis: ForecastBasis = input.paidCustomers === 0 ? "annahmen" : useMeasured ? "gemessen" : "gemischt";

  const checkoutRate = useMeasured ? input.measured.checkoutToPaid : null;
  const requestRate = useMeasured ? input.measured.requestToCall : null;
  const callRate = useMeasured ? input.measured.callToPaid : null;

  const usedCheckout = pickRate(checkoutRate, STATIC_ASSUMPTIONS.checkoutToPaid);
  const usedRequest = pickRate(requestRate, STATIC_ASSUMPTIONS.requestToCall);
  const usedCall = pickRate(callRate, STATIC_ASSUMPTIONS.callToPaid);

  const projection = projectNewCustomers(input);
  const newCustomersPerMonth = projection.fromCheckouts + projection.fromCalls;

  const scenarios: ForecastScenario[] = [1, 3, 6].map((months) => {
    let active = 0;
    let cumulativeRevenueCents = 0;
    for (let month = 1; month <= months; month += 1) {
      active = active * (1 - STATIC_ASSUMPTIONS.churnRate) + newCustomersPerMonth;
      cumulativeRevenueCents += Math.round(active * STATIC_ASSUMPTIONS.arpuCents);
    }
    return {
      months,
      newCustomers: newCustomersPerMonth,
      mrrCents: Math.round(active * STATIC_ASSUMPTIONS.arpuCents),
      cumulativeRevenueCents,
    };
  });

  const notes: string[] = [];
  if (input.paidCustomers < MIN_PAID_FOR_MEASURED_FORECAST) {
    notes.push(
      `Noch ${MIN_PAID_FOR_MEASURED_FORECAST - input.paidCustomers} bezahlte Kunden bis zur Umstellung auf gemessene Raten. Bis dahin gilt: Annahmen, keine Prognose.`,
    );
  } else {
    notes.push("Raten stammen aus eigenen Kaeufen. Zuendende Annahmen sind nicht mehr im Spiel.");
  }
  if (input.measured.checkoutToPaid === null) {
    notes.push("Noch kein bezahlter Checkout gemessen — die Checkout-Rate ist eine Annahme.");
  }
  if (newCustomersPerMonth === 0) {
    notes.push("Ohne gestartete Checkouts und Anfragen ergibt jede Rate 0 Kunden. Erst Funnel, dann Prognose.");
  }
  notes.push(`ARPU-Annahme ${(STATIC_ASSUMPTIONS.arpuCents / 100).toFixed(2)} EUR/Monat, Kuendigungsquote ${Math.round(STATIC_ASSUMPTIONS.churnRate * 100)} %.`);

  return {
    basis,
    switchAt: MIN_PAID_FOR_MEASURED_FORECAST,
    paidCustomers: input.paidCustomers,
    rates: input.measured,
    usedRateSource: {
      checkoutToPaid: usedCheckout.source,
      requestToCall: usedRequest.source,
      callToPaid: usedCall.source,
    },
    scenarios,
    notes,
  };
}
