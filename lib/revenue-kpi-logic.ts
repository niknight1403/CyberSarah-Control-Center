/**
 * Revenue-KPIs fuer das Command Dashboard — reine, deterministische Logik.
 *
 * Grundsatz (Master-Prompt §3/§9): Jede Umsatzkennzahl stammt aus einer
 * nachvollziehbaren Quelle. Fehlt eine Quelle, liefert die Kennzahl `null`
 * und die Luecke wird benannt — es wird nichts geschaetzt und nichts
 * hochgerechnet.
 *
 * Quellen:
 *  - `stripe`: aktive/past_due Abos inkl. Preis (unit_amount + Intervall).
 *    Abos ohne bekannten Preis zaehlen NICHT in den MRR, sondern werden als
 *    `unknownPriceSubscriptions` ausgewiesen.
 *  - `ledger`: eigene Umsatz-Tagesstatistik und Conversion-Events in der
 *    Hauptdatenbank (extern belegte Verkaeufe).
 */

export type RevenueSubscriptionLike = {
  status: string;
  /** Preis pro Einheit in Cent; null = Preis nicht bekannt. */
  amountCents: number | null;
  interval: "month" | "year" | null;
  quantity?: number | null;
};

export type RevenueKpiSnapshot = {
  /** Monatlich normalisierter wiederkehrender Umsatz in Cent (ohne Schaetzung). */
  mrrCents: number | null;
  arrCents: number | null;
  /** Belegter Umsatz der letzten 30 Tage in Cent. */
  revenue30dCents: number | null;
  /** Aktive Abos (active + trialing) aus Stripe. */
  activeSubscriptions: number | null;
  /** Abos im Zahlungsverzug (past_due). */
  pastDueSubscriptions: number | null;
  /** Abos mit unbekanntem Preis — bewusst nicht in den MRR gerechnet. */
  unknownPriceSubscriptions: number | null;
  /** Belegte Bestellungen der letzten 30 Tage. */
  paidOrders30d: number | null;
  /** Durchschnittlicher Bestellwert in Cent. */
  averageOrderCents: number | null;
  /** Aktive Abo-Kunden laut Datenbank (billingSubscriptions). */
  activeCustomers: number | null;
  computedAt: string;
  sources: {
    mrr: "stripe" | "unavailable";
    revenue30d: "ledger" | "unavailable";
    customers: "ledger" | "unavailable";
  };
  /** Klartext-Hinweise fuer die UI (deutsch, ohne interne Details). */
  gaps: string[];
};

export type RevenueKpiInput = {
  /** `null` = Stripe nicht verbunden oder nicht lesbar. */
  subscriptions: RevenueSubscriptionLike[] | null;
  /** `null` = keine belegten Verkaeufe / Ledger nicht lesbar. */
  revenue30dCents: number | null;
  paidOrders30d: number | null;
  activeCustomers: number | null;
  /** Zusaetzliche Gruende, warum Quellen fehlen (werden unveraendert uebernommen). */
  gaps?: string[];
  now?: Date;
};

const MRR_STATUSES = new Set(["active", "trialing"]);

function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

/** Normalisiert einen Abo-Preis auf Monate. Jahrespreise werden geteilt, gerundet. */
export function normalizeMonthlyCents(subscription: RevenueSubscriptionLike): number | null {
  const amount = subscription.amountCents;
  if (amount === null || !Number.isFinite(amount)) return null;
  const quantity = typeof subscription.quantity === "number" && subscription.quantity > 0 ? Math.trunc(subscription.quantity) : 1;
  const total = toCents(amount) * quantity;
  if (subscription.interval === "year") return Math.round(total / 12);
  if (subscription.interval === "month") return total;
  return null;
}

export function isMrrEligible(subscription: RevenueSubscriptionLike): boolean {
  return MRR_STATUSES.has((subscription.status ?? "").toLowerCase().trim());
}

export function isPastDue(subscription: RevenueSubscriptionLike): boolean {
  return (subscription.status ?? "").toLowerCase().trim() === "past_due";
}

/** MRR ausschliesslich aus Abos mit bekanntem Preis; Unbekanntes wird gezaehlt, nicht geschaetzt. */
export function computeRecurringRevenue(subscriptions: RevenueSubscriptionLike[]): {
  mrrCents: number;
  activeSubscriptions: number;
  pastDueSubscriptions: number;
  unknownPriceSubscriptions: number;
} {
  let mrrCents = 0;
  let activeSubscriptions = 0;
  let pastDueSubscriptions = 0;
  let unknownPriceSubscriptions = 0;
  for (const subscription of subscriptions) {
    if (isPastDue(subscription)) pastDueSubscriptions += 1;
    if (!isMrrEligible(subscription)) continue;
    activeSubscriptions += 1;
    const monthly = normalizeMonthlyCents(subscription);
    if (monthly === null) {
      unknownPriceSubscriptions += 1;
      continue;
    }
    mrrCents += monthly;
  }
  return { mrrCents, activeSubscriptions, pastDueSubscriptions, unknownPriceSubscriptions };
}

/** Durchschnittlicher Bestellwert; ohne Bestellungen `null` statt 0 (0 waere eine Falschaussage). */
export function averageOrderCents(revenueCents: number | null, orders: number | null): number | null {
  if (revenueCents === null || orders === null) return null;
  if (!Number.isFinite(revenueCents) || !Number.isFinite(orders) || orders <= 0) return null;
  return Math.round(Math.max(0, revenueCents) / orders);
}

export function computeRevenueKpis(input: RevenueKpiInput): RevenueKpiSnapshot {
  const now = input.now ?? new Date();
  const gaps: string[] = [];

  let mrrCents: number | null = null;
  let activeSubscriptions: number | null = null;
  let pastDueSubscriptions: number | null = null;
  let unknownPriceSubscriptions: number | null = null;

  if (input.subscriptions === null) {
    gaps.push("Kein Stripe-Zugriff: wiederkehrender Umsatz ist nicht belegt.");
  } else {
    const recurring = computeRecurringRevenue(input.subscriptions);
    mrrCents = recurring.mrrCents;
    activeSubscriptions = recurring.activeSubscriptions;
    pastDueSubscriptions = recurring.pastDueSubscriptions;
    unknownPriceSubscriptions = recurring.unknownPriceSubscriptions;
    if (recurring.unknownPriceSubscriptions > 0) {
      gaps.push(`${recurring.unknownPriceSubscriptions} Abo(s) ohne hinterlegten Preis zaehlen nicht in den MRR.`);
    }
  }

  const revenue30dCents = input.revenue30dCents === null ? null : toCents(input.revenue30dCents);
  const paidOrders30d = input.paidOrders30d === null ? null : Math.max(0, Math.trunc(input.paidOrders30d));
  const activeCustomers = input.activeCustomers === null ? null : Math.max(0, Math.trunc(input.activeCustomers));

  if (revenue30dCents === null || paidOrders30d === null) {
    gaps.push("Keine belegten Verkaeufe in den letzten 30 Tagen: Umsatz und Bestellungen bleiben leer.");
  }
  if (activeCustomers === null) {
    gaps.push("Kundenstand nicht lesbar: Zahl aktiver Abo-Kunden bleibt leer.");
  }
  for (const extra of input.gaps ?? []) {
    if (extra.trim()) gaps.push(extra.trim());
  }

  return {
    mrrCents,
    arrCents: mrrCents === null ? null : mrrCents * 12,
    revenue30dCents,
    activeSubscriptions,
    pastDueSubscriptions,
    unknownPriceSubscriptions,
    paidOrders30d,
    averageOrderCents: averageOrderCents(revenue30dCents, paidOrders30d),
    activeCustomers,
    computedAt: now.toISOString(),
    sources: {
      mrr: input.subscriptions === null ? "unavailable" : "stripe",
      revenue30d: revenue30dCents === null ? "unavailable" : "ledger",
      customers: activeCustomers === null ? "unavailable" : "ledger",
    },
    gaps: [...new Set(gaps)],
  };
}

/** Euro-Formatierung (deutsch). `null` bleibt sichtbar leer statt "0,00 EUR". */
export function formatEuroCents(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) return "—";
  const value = (Math.trunc(cents) / 100).toFixed(2).replace(".", ",");
  // Tausenderpunkte fuer Lesbarkeit im Dashboard.
  const [whole, decimals] = value.split(",");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped},${decimals} €`;
}

/** Ganze Zahl deutsch formatiert; `null` als Strich. */
export function formatCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return String(Math.trunc(value));
}

/** Quelle als kurzer Klartext fuer die UI-Fusszeile. */
export function sourceLabel(snapshot: RevenueKpiSnapshot): string {
  const parts: string[] = [];
  parts.push(snapshot.sources.mrr === "stripe" ? "MRR: Stripe" : "MRR: keine Quelle");
  parts.push(snapshot.sources.revenue30d === "ledger" ? "Umsatz: eigene Buchungen" : "Umsatz: keine Buchungen");
  parts.push(snapshot.sources.customers === "ledger" ? "Kunden: Datenbank" : "Kunden: keine Quelle");
  return parts.join(" · ");
}
