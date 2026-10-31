/**
 * Kennzahlen fuer das Umsatz-Dashboard: MRR, Conversion-Rate und aktive
 * API-Nutzung. Rein rechnerisch, damit die Werte ohne Datenbank testbar sind.
 */

export type SubscriptionRecord = {
  customerId: string;
  status: "active" | "trialing" | "past_due" | "canceled";
  amountCents: number;
  interval: "month" | "year";
  createdAt?: string;
};

export type FunnelRecord = {
  visitors: number;
  signups: number;
  paidCustomers: number;
};

export type UsageRecord = {
  customerId: string;
  calls: number;
  occurredAt: string;
};

export type MetricsSnapshot = {
  mrrCents: number;
  arrCents: number;
  activeSubscriptions: number;
  conversionRate: number;
  signupRate: number;
  apiCalls30d: number;
  activeApiCustomers: number;
  computedAt: string;
};

const PAID_STATUSES = new Set<SubscriptionRecord["status"]>(["active", "past_due"]);

export function computeMrr(subscriptions: SubscriptionRecord[]): number {
  return subscriptions
    .filter((item) => PAID_STATUSES.has(item.status))
    .reduce((sum, item) => {
      const amount = Number.isFinite(item.amountCents) ? Math.max(0, Math.trunc(item.amountCents)) : 0;
      return sum + (item.interval === "year" ? Math.round(amount / 12) : amount);
    }, 0);
}

export function countActiveSubscriptions(subscriptions: SubscriptionRecord[]): number {
  return subscriptions.filter((item) => PAID_STATUSES.has(item.status)).length;
}

export function computeConversionRate(funnel: FunnelRecord): number {
  const visitors = Math.max(0, Math.trunc(funnel.visitors));
  const paid = Math.max(0, Math.trunc(funnel.paidCustomers));
  if (visitors === 0) return 0;
  return Math.round((paid / visitors) * 10_000) / 100;
}

export function computeSignupRate(funnel: FunnelRecord): number {
  const visitors = Math.max(0, Math.trunc(funnel.visitors));
  const signups = Math.max(0, Math.trunc(funnel.signups));
  if (visitors === 0) return 0;
  return Math.round((signups / visitors) * 10_000) / 100;
}

export function sumApiCalls(records: UsageRecord[], now: Date = new Date(), days = 30): number {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return records.reduce((sum, record) => {
    const stamp = Date.parse(record.occurredAt);
    if (!Number.isFinite(stamp) || stamp < cutoff) return sum;
    return sum + Math.max(0, Math.trunc(record.calls));
  }, 0);
}

export function countActiveApiCustomers(records: UsageRecord[], now: Date = new Date(), days = 30): number {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const active = new Set<string>();
  for (const record of records) {
    const stamp = Date.parse(record.occurredAt);
    if (!Number.isFinite(stamp) || stamp < cutoff) continue;
    if (record.calls > 0) active.add(record.customerId);
  }
  return active.size;
}

export function buildMetricsSnapshot(input: {
  subscriptions: SubscriptionRecord[];
  funnel: FunnelRecord;
  usage: UsageRecord[];
  now?: Date;
}): MetricsSnapshot {
  const now = input.now ?? new Date();
  const mrrCents = computeMrr(input.subscriptions);
  return {
    mrrCents,
    arrCents: mrrCents * 12,
    activeSubscriptions: countActiveSubscriptions(input.subscriptions),
    conversionRate: computeConversionRate(input.funnel),
    signupRate: computeSignupRate(input.funnel),
    apiCalls30d: sumApiCalls(input.usage, now, 30),
    activeApiCustomers: countActiveApiCustomers(input.usage, now, 30),
    computedAt: now.toISOString(),
  };
}

export function formatCents(cents: number): string {
  const value = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  return `${(value / 100).toFixed(2).replace(".", ",")} EUR`;
}
