import { describe, it, expect } from "vitest";
import {
  classifyEscalation,
  planAlert,
  markAlertSent,
  confirmAlertDelivery,
  unconfirmedAlerts,
  formatAlertText,
  formatDeliveryState,
  hasOpenAlertForInvoice,
} from "@/lib/ops-payment-alert-logic";
import type { PaymentFailureEvent } from "@/lib/ops-payment-alert-logic";

const ev = (over: Partial<PaymentFailureEvent> = {}): PaymentFailureEvent => ({
  invoiceId: "in_1",
  userId: "u_1",
  attemptCount: 1,
  occurredAt: 1000,
  amountCents: 1999,
  currency: "eur",
  ...over,
});

describe("Sprint 322 — Ops-Payment-Alerts", () => {
  it("eskaliert nach Versuch-Schwellen: 1 / 2+ / 4+", () => {
    expect(classifyEscalation(1)).toBe(1);
    expect(classifyEscalation(3)).toBe(2);
    expect(classifyEscalation(4)).toBe(3);
  });

  it("dedupliziert: ein offener Alert pro Rechnung", () => {
    const first = planAlert([], ev(), "a1");
    expect(first.created).not.toBeNull();
    const second = planAlert(first.alerts, ev({ attemptCount: 2, occurredAt: 2000 }), "a2");
    expect(second.created).toBeNull();
    expect(second.alerts).toHaveLength(1);
    expect(hasOpenAlertForInvoice(first.alerts, "in_1")).toBe(true);
  });

  it("versendet != zugestellt: erst Bestaetigung schliesst", () => {
    let alert = planAlert([], ev(), "a1").created!;
    expect(alert.delivery).toBe("geplant");
    alert = markAlertSent(alert, 2000);
    expect(alert.delivery).toBe("versendet");
    expect(alert.sentAttempts).toBe(1);
    alert = confirmAlertDelivery(alert);
    expect(alert.delivery).toBe("bestaetigt");
    // Bestaetigte Alerts werden nicht mehr versendet
    const again = markAlertSent(alert, 3000);
    expect(again.sentAttempts).toBe(1);
    expect(unconfirmedAlerts([alert])).toHaveLength(0);
  });

  it("Alert-Text nennt Rechnung, Nutzer, Betrag und Versuch", () => {
    const alert = planAlert([], ev({ attemptCount: 2 }), "a1").created!;
    const text = formatAlertText(alert, ev({ attemptCount: 2 }));
    expect(text).toContain("in_1");
    expect(text).toContain("u_1");
    expect(text).toContain("19,99 EUR");
    expect(text).toContain("Level 2");
  });

  it("Zustellungs-Zeilen sind ehrlich unbestaetigt bis ack", () => {
    let alert = planAlert([], ev(), "a1").created!;
    expect(formatDeliveryState(alert)).toContain("noch nicht versendet");
    alert = markAlertSent(alert, 1);
    expect(formatDeliveryState(alert)).toContain("UNBESTAETIGT");
    expect(formatDeliveryState(confirmAlertDelivery(alert))).toContain("bestaetigt");
  });
});
