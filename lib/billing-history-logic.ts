/**
 * Sprint 317 — Abrechnungs-Screen: reine, deterministische Logik fuer
 * die Rechnungshistorie aus Stripe-Daten.
 *
 * Datenfluss:
 *   Rechnungs-Rohdaten (Stripe-Invoice-artig) werden sortiert,
 *   gefiltert und aggregiert — neueste zuerst, Summen ehrlich
 *   getrennt nach bezahlt/offen.
 *
 * Ehrlichkeits-Grenze: Fehlende Daten heissen "keine Rechnungen
 *   vorhanden", nicht "0 EUR Umsatz" aus Nichts. Offene Betraege
 *   werden nie als bezahlt mitgezaehlt.
 */

export type InvoiceStatus = "paid" | "open" | "void" | "uncollectible";

export type InvoiceLike = {
  id: string;
  number: string;
  date: number; // Epoch-ms
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
};

/** Rechnungen chronologisch absteigend (neueste zuerst). */
export function sortInvoicesDesc(invoices: InvoiceLike[]): InvoiceLike[] {
  return [...invoices].sort((a, b) => b.date - a.date);
}

/** Nur bezahlte zaehlen in die Bezahlt-Summe. */
export function sumPaid(invoices: InvoiceLike[]): number {
  return invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + i.amountCents, 0);
}

/** Offene Forderungen (open) — uncollectible bleibt separater Skandal. */
export function sumOutstanding(invoices: InvoiceLike[]): number {
  return invoices
    .filter((i) => i.status === "open")
    .reduce((sum, i) => sum + i.amountCents, 0);
}

export function sumUncollectible(invoices: InvoiceLike[]): number {
  return invoices
    .filter((i) => i.status === "uncollectible")
    .reduce((sum, i) => sum + i.amountCents, 0);
}

/** Cents -> "12,34 EUR" (deutsch, kein Fake-Format). */
export function formatAmount(cents: number, currency: string): string {
  const value = (cents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value} ${currency.toUpperCase()}`;
}

/** Eine Zeile pro Rechnung fuer die UI. */
export function formatInvoiceLine(invoice: InvoiceLike): string {
  const label: Record<InvoiceStatus, string> = {
    paid: "bezahlt",
    open: "offen",
    void: "storniert",
    uncollectible: "uneinziehbar",
  };
  return `${invoice.number}: ${formatAmount(invoice.amountCents, invoice.currency)} — ${label[invoice.status]}`;
}

/** Leerer Stand: ehrliche Meldung statt Nullsummen-Show. */
export function emptyHistoryMessage(invoices: InvoiceLike[]): string | null {
  return invoices.length === 0
    ? "Noch keine Rechnungen vorhanden — sie erscheinen nach der ersten Zahlung."
    : null;
}
