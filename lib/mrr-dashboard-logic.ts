/**
 * Sprint 321 — MRR-Dashboard v2: reine, deterministische Logik fuer
 * Churn, Neukunden und Zahlungsverlauf aus Stripe-Abos.
 *
 * Datenfluss:
 *   Abo-/Zahlungs-Rohdaten (Stripe-artig) plus ein Preis-Katalog
 *   (Tier -> Monatspreis) ergeben MRR, Churn-Rate, Neukunden und
 *   einen Zahlungsverlauf — alles nur aus VERIFIZIERTEN Zustaenden.
 *
 * Ehrlichkeits-Grenze: Preise ohne Katalog-Eintrag zaehlen als
 *   "unbekannt" und nicht in MRR (kein Rueckschluss aus Luft).
 *   Churn nur aus abgelaufenen/gekuendigten Abos, Neukunden nur
 *   aus echten Starts im Zeitfenster.
 */

import type { SubscriptionTier } from "./subscription-tiers-logic";

export type SubscriptionRecordLike = {
  id: string;
  tier: SubscriptionTier;
  status: "active" | "canceled" | "past_due" | "trialing";
  startedAt: number;
  /** Ende der Kuendigung (Periodenende) oder null. */
  canceledAt: number | null;
};

export type TierPriceCatalog = Partial<Record<SubscriptionTier, number>>; // Cents/Monat

export type MrrWindow = { from: number; to: number };

/** Nur aktive und trialing Abos sind MRR-wuerdig; past_due bleibt draussen. */
export function mrrEligible(subs: SubscriptionRecordLike[], at: number): SubscriptionRecordLike[] {
  return subs.filter(
    (s) => (s.status === "active" || s.status === "trialing") && (s.canceledAt === null || s.canceledAt > at),
  );
}

/** MRR in Cents; unbekannte Tier-Preise werden NICHT geschaetzt. */
export function computeMrrCents(
  subs: SubscriptionRecordLike[],
  catalog: TierPriceCatalog,
  at: number,
): { mrrCents: number; unknownTierCount: number } {
  let mrrCents = 0;
  let unknownTierCount = 0;
  for (const sub of mrrEligible(subs, at)) {
    const price = catalog[sub.tier];
    if (typeof price !== "number") {
      unknownTierCount += 1;
    } else {
      mrrCents += price;
    }
  }
  return { mrrCents, unknownTierCount };
}

/** Churn-Rate im Fenster: gekuendete Abos / Abos, die am Fensterstart aktiv waren. */
export function computeChurnRate(subs: SubscriptionRecordLike[], window: MrrWindow): number {
  const activeAtStart = subs.filter(
    (s) => s.startedAt < window.from && (s.canceledAt === null || s.canceledAt > window.from),
  );
  if (activeAtStart.length === 0) return 0;
  const churned = activeAtStart.filter(
    (s) => s.canceledAt !== null && s.canceledAt > window.from && s.canceledAt <= window.to,
  );
  return churned.length / activeAtStart.length;
}

/** Neukunden: Abos, die im Fenster gestartet sind. */
export function countNewCustomers(subs: SubscriptionRecordLike[], window: MrrWindow): number {
  return subs.filter((s) => s.startedAt >= window.from && s.startedAt <= window.to).length;
}

/** Zahlungsverlauf: Monate (YYYY-MM) -> Summe bezahlter Betraege in Cents. */
export function buildPaymentTimeline(
  payments: Array<{ date: number; amountCents: number }>,
  window: MrrWindow,
): Array<{ month: string; amountCents: number }> {
  const byMonth = new Map<string, number>();
  for (const p of payments) {
    if (p.date < window.from || p.date > window.to) continue;
    const d = new Date(p.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + p.amountCents);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amountCents]) => ({ month, amountCents }));
}

/** Dashboard-Kachel: MRR ehrlich inkl. Unbekannt-Vermerk. */
export function formatMrrLine(result: { mrrCents: number; unknownTierCount: number }, currency: string): string {
  const value = (result.mrrCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 });
  const base = `${value} ${currency.toUpperCase()} MRR`;
  return result.unknownTierCount > 0
    ? `${base} — ${result.unknownTierCount} Abo(s) ohne Preis-Katalog-Eintrag NICHT mitgezaehlt`
    : base;
}
