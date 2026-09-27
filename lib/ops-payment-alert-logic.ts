/**
 * Sprint 322 — Ops-Alerts: reine, deterministische Logik fuer
 * Zahlungsausfall-Warnungen an den Admin mit Zustellungs-Verifikation.
 *
 * Datenfluss:
 *   Zahlungsausfall-Events werden klassifiziert, dedupliziert (ein
 *   Alert pro Rechnung, nicht pro Retry) und eskaliert; jede
 *   Zustellung wird protokolliert, bis sie bestaetigt ist.
 *
 * Ehrlichkeits-Grenze: "versendet" heisst nicht "angekommen" — erst
 *   die Admin-Bestaetigung macht einen Alert "zugestellt". Ohne
 *   Bestaetigung bleibt der Zustand ehrlich "unbestaetigt".
 */

export type PaymentFailureEvent = {
  invoiceId: string;
  userId: string;
  attemptCount: number; // 1 = erster Fehlversuch
  occurredAt: number;
  amountCents: number;
  currency: string;
};

export type AlertDeliveryState = "geplant" | "versendet" | "bestaetigt";

export type PaymentAlert = {
  id: string;
  invoiceId: string;
  userId: string;
  escalationLevel: 1 | 2 | 3;
  createdAt: number;
  delivery: AlertDeliveryState;
  sentAttempts: number;
  lastSentAt: number | null;
};

/** Alert-Schwelle: erst ab dem N-ten Fehlversuch eskalieren (Level 2/3). */
export const PAYMENT_ALERT_THRESHOLDS = { level2AtAttempt: 2, level3AtAttempt: 4 } as const;

export function classifyEscalation(attemptCount: number): 1 | 2 | 3 {
  if (attemptCount >= PAYMENT_ALERT_THRESHOLDS.level3AtAttempt) return 3;
  if (attemptCount >= PAYMENT_ALERT_THRESHOLDS.level2AtAttempt) return 2;
  return 1;
}

/** Dedup: pro Rechnung existiert hoechstens ein offener Alert. */
export function hasOpenAlertForInvoice(alerts: PaymentAlert[], invoiceId: string): boolean {
  return alerts.some((a) => a.invoiceId === invoiceId && a.delivery !== "bestaetigt");
}

/** Neuen Alert planen (nur wenn kein offener fuer die Rechnung existiert). */
export function planAlert(
  alerts: PaymentAlert[],
  event: PaymentFailureEvent,
  alertId: string,
): { alerts: PaymentAlert[]; created: PaymentAlert | null } {
  if (hasOpenAlertForInvoice(alerts, event.invoiceId)) {
    return { alerts, created: null };
  }
  const alert: PaymentAlert = {
    id: alertId,
    invoiceId: event.invoiceId,
    userId: event.userId,
    escalationLevel: classifyEscalation(event.attemptCount),
    createdAt: event.occurredAt,
    delivery: "geplant",
    sentAttempts: 0,
    lastSentAt: null,
  };
  return { alerts: [...alerts, alert], created: alert };
}

/** Senden buchen: Zustand "versendet", Zaehler steigt, Bestaetigung fehlt noch. */
export function markAlertSent(alert: PaymentAlert, now: number): PaymentAlert {
  if (alert.delivery === "bestaetigt") return alert;
  return {
    ...alert,
    delivery: "versendet",
    sentAttempts: alert.sentAttempts + 1,
    lastSentAt: now,
  };
}

/** Admin-Bestaetigung: erst jetzt gilt der Alert als zugestellt. */
export function confirmAlertDelivery(alert: PaymentAlert): PaymentAlert {
  return { ...alert, delivery: "bestaetigt" };
}

/** Alles ausser bestaetigt bleibt fuer Ops sichtbar. */
export function unconfirmedAlerts(alerts: PaymentAlert[]): PaymentAlert[] {
  return alerts.filter((a) => a.delivery !== "bestaetigt");
}

/** Alert-Text fuer den Admin: Rechnung, Betrag, Eskalationsstufe. */
export function formatAlertText(alert: PaymentAlert, event: PaymentFailureEvent): string {
  const amount = (event.amountCents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
  });
  return `Zahlungsausfall (Level ${alert.escalationLevel}): Rechnung ${alert.invoiceId} von Nutzer ${alert.userId} — ${amount} ${event.currency.toUpperCase()} nicht eingelassen (Versuch ${event.attemptCount}).`;
}

/** Ehrlicher Zustellungs-Bericht fuers Ops-Dashboard. */
export function formatDeliveryState(alert: PaymentAlert): string {
  switch (alert.delivery) {
    case "geplant":
      return "Geplant — noch nicht versendet.";
    case "versendet":
      return `Versendet (${alert.sentAttempts}x), Zustellung UNBESTAETIGT.`;
    case "bestaetigt":
      return "Versendet und vom Admin bestaetigt.";
  }
}
