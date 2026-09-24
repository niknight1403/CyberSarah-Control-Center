/**
 * Sprint 267 — Datenschutz-arme Produkt-Analytik (rein, testbar).
 *
 * Ehrlichkeits-Regeln:
 *   - Nur Ereignis-Arten und Zahlen, niemals Freitext oder PII.
 *   - Tages-Buckets mit Ganzzahlen reichen fuer Produkt-Entscheidungen —
 *     Einzelsessions werden bewusst NICHT gespeichert.
 *   - "Keine Daten" ist ein Ergebnis und wird benannt, nicht aufgefuellt.
 */

export const ANALYTICS_EVENT_KINDS = [
  "landing_view",
  "signup_completed",
  "chat_message_sent",
  "image_generated",
  "checkout_started",
  "plan_upgraded",
] as const;
export type AnalyticsEventKind = (typeof ANALYTICS_EVENT_KINDS)[number];

export const MAX_RETENTION_DAYS = 90;

export function isValidEventKind(kind: string): kind is AnalyticsEventKind {
  return (ANALYTICS_EVENT_KINDS as readonly string[]).includes(kind);
}

export function validateEventInput(kind: string, day: string): { valid: true } | { valid: false; reason: string } {
  if (!isValidEventKind(kind)) return { valid: false, reason: "Unbekannte Ereignis-Art — keine freien Strings, kein Tracking-Müll." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { valid: false, reason: "Ereignis-Tag muss ISO sein (YYYY-MM-DD)." };
  return { valid: true };
}

export type DailyBucket = Partial<Record<AnalyticsEventKind, number>>;

export function accumulateEvent(buckets: Record<string, DailyBucket>, kind: AnalyticsEventKind, day: string, delta = 1): Record<string, DailyBucket> {
  const next = { ...buckets };
  const dayBucket = { ...(next[day] ?? {}) };
  dayBucket[kind] = (dayBucket[kind] ?? 0) + delta;
  next[day] = dayBucket;
  return next;
}

export function pruneBuckets(buckets: Record<string, DailyBucket>, today: string, retentionDays = MAX_RETENTION_DAYS): { buckets: Record<string, DailyBucket>; prunedDays: number } {
  const cutoff = new Date(`${today}T00:00:00Z`).getTime() - retentionDays * 86_400_000;
  if (Number.isNaN(cutoff)) return { buckets, prunedDays: 0 };
  const kept: Record<string, DailyBucket> = {};
  let pruned = 0;
  for (const [day, bucket] of Object.entries(buckets)) {
    const time = new Date(`${day}T00:00:00Z`).getTime();
    if (!Number.isNaN(time) && time >= cutoff) kept[day] = bucket;
    else pruned += 1;
  }
  return { buckets: kept, prunedDays: pruned };
}

export function buildFunnelSummary(buckets: Record<string, DailyBucket>): {
  landingViews: number; signups: number; checkoutStarts: number; upgrades: number;
  signupRate: string; upgradeRate: string;
} {
  const sum = (kind: AnalyticsEventKind) => Object.values(buckets).reduce((total, bucket) => total + (bucket[kind] ?? 0), 0);
  const landingViews = sum("landing_view");
  const signups = sum("signup_completed");
  const checkoutStarts = sum("checkout_started");
  const upgrades = sum("plan_upgraded");
  const pct = (part: number, whole: number) => (whole === 0 ? "k. A." : `${Math.round((part / whole) * 100)}%`);
  return {
    landingViews, signups, checkoutStarts, upgrades,
    signupRate: pct(signups, landingViews),
    upgradeRate: pct(upgrades, signups),
  };
}
