/**
 * Vier Kennzahlen, eine Woche, eine ehrliche Rechnung.
 *
 * Die vier KPIs sind bewusst die einzigen, die den Funnel wirklich beschreiben:
 *
 *   checkouts_started    — wie viele wollten kaufen
 *   checkouts_completed  — wie viele haben bezahlt
 *   intro_requests       — wie viele wollten sprechen
 *   intro_calls_held     — wie viele Gespraeche fanden statt
 *
 * Alles andere (Klicks, Impressionen) ist schmueckend und wird hier nicht
 * erfunden. Fehlt eine Quelle, steht das als `null` in der Auswertung und nicht
 * als Null-Wert: "keine Daten" und "niemand hat gekauft" sind zwei verschiedene
 * Nachrichten.
 *
 * Diese Datei rechnet, sie fragt nicht ab.
 */

export type KpiId = "checkouts_started" | "checkouts_completed" | "intro_requests" | "intro_calls_held";

export const KPI_DEFINITIONS: readonly { id: KpiId; label: string; source: string }[] = [
  { id: "checkouts_started", label: "Gestartete Checkouts", source: "conversion_events (checkout_started)" },
  { id: "checkouts_completed", label: "Abgeschlossene Checkouts", source: "conversion_events (checkout_completed)" },
  { id: "intro_requests", label: "Erstgespraech-Anfragen", source: "revenue_jobs (ai-influenza-intro-request)" },
  { id: "intro_calls_held", label: "Gefuehrte Gespraeche", source: "revenue_jobs payload.conversationHeldAt" },
] as const;

/** Ein Ereignis, so wie es aus der Datenbank kommt. */
export type KpiEvent = {
  kpi: KpiId;
  occurredAt: Date;
  /** Betrag in Cent, wenn das Ereignis Geld traegt. */
  amountCents?: number;
  /** Kurzform fuer Nachvollziehbarkeit in der Auswertung. */
  reference?: string;
};

export type WeeklyBucket = {
  /** Montag der Woche, ISO-Datum (YYYY-MM-DD). */
  weekStart: string;
  totals: Record<KpiId, number>;
  revenueCents: number;
  events: number;
};

/** Montag 00:00 UTC der Woche, in der das Datum liegt. */
export function isoWeekStart(date: Date): Date {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay(); // 0 = Sonntag
  const offset = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + offset);
  return copy;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function emptyTotals(): Record<KpiId, number> {
  return { checkouts_started: 0, checkouts_completed: 0, intro_requests: 0, intro_calls_held: 0 };
}

/**
 * Gruppiert Ereignisse nach Woche. `weeks` bestimmt, wie viele Wochen
 * zurueckgerechnet werden (die aktuelle Woche ist immer enthalten), damit eine
 * Woche ohne Ereignisse als 0 erscheint statt zu fehlen — sonst sieht eine
 * Flaute wie ein Datenausfall aus.
 */
export function aggregateWeekly(events: readonly KpiEvent[], now: Date, weeks = 8): WeeklyBucket[] {
  const currentWeek = isoWeekStart(now);
  const buckets = new Map<string, WeeklyBucket>();
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const start = new Date(currentWeek);
    start.setUTCDate(start.getUTCDate() - index * 7);
    const key = isoDate(start);
    buckets.set(key, { weekStart: key, totals: emptyTotals(), revenueCents: 0, events: 0 });
  }
  for (const event of events) {
    const bucket = buckets.get(isoDate(isoWeekStart(event.occurredAt)));
    if (!bucket) continue;
    bucket.totals[event.kpi] += 1;
    bucket.revenueCents += event.amountCents ?? 0;
    bucket.events += 1;
  }
  return [...buckets.values()];
}

export type FunnelRates = {
  /** Anteil gestarteter Checkouts, die bezahlt wurden. */
  checkoutToPaid: number | null;
  /** Anteil Anfragen, aus denen ein Gespraech wurde. */
  requestToCall: number | null;
  /** Anteil Gespraeche, die zum Abschluss fuehren (nur gemessen, nie geschaetzt). */
  callToPaid: number | null;
};

/** Raten aus den Summen — `null`, wenn der Nenner 0 ist. Keine Division durch Nichtwissen. */
export function funnelRates(totals: Record<KpiId, number>, paidFromCalls: number | null = null): FunnelRates {
  const safe = (numerator: number, denominator: number): number | null =>
    denominator > 0 ? Math.round((numerator / denominator) * 1000) / 1000 : null;
  return {
    checkoutToPaid: safe(totals.checkouts_completed, totals.checkouts_started),
    requestToCall: safe(totals.intro_calls_held, totals.intro_requests),
    callToPaid: paidFromCalls !== null && totals.intro_calls_held > 0 ? safe(paidFromCalls, totals.intro_calls_held) : null,
  };
}

export function sumKpis(buckets: readonly WeeklyBucket[]): Record<KpiId, number> {
  return buckets.reduce((accumulator, bucket) => {
    for (const id of Object.keys(accumulator) as KpiId[]) {
      accumulator[id] += bucket.totals[id];
    }
    return accumulator;
  }, emptyTotals());
}

/** Durchschnitt pro Woche ueber die Wochen, in denen wirklich etwas passierte. */
export function weeklyAverage(buckets: readonly WeeklyBucket[]): Record<KpiId, number> {
  const active = buckets.filter((bucket) => bucket.events > 0);
  const divisor = active.length || 1;
  const totals = sumKpis(buckets);
  const result = emptyTotals();
  for (const id of Object.keys(result) as KpiId[]) {
    result[id] = Math.round((totals[id] / divisor) * 100) / 100;
  }
  return result;
}
