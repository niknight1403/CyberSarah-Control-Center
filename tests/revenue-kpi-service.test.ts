/**
 * Tests fuer die Service-Abbildung der Stripe-Abos auf Kennzahlen.
 * Netzwerk und Datenbank werden hier bewusst nicht beruehrt: geprueft wird
 * die reine Abbildung, die aus Stripe-Objekten Preise und Intervalle liest.
 */
import { describe, expect, it } from "vitest";

import { mapStripeSubscription } from "@/server/revenue-kpi-service";

const monthly = { price: { unit_amount: 4900, recurring: { interval: "month" } }, quantity: 1 };

describe("mapStripeSubscription", () => {
  it("liest Preis, Intervall und Status", () => {
    expect(mapStripeSubscription({ status: "active", items: { data: [monthly] } })).toEqual({
      status: "active",
      amountCents: 4900,
      interval: "month",
      quantity: 1,
    });
  });

  it("rechnet Mengen ein und normalisiert den Status", () => {
    const mapped = mapStripeSubscription({ status: "PAST_DUE", items: { data: [{ ...monthly, quantity: 4 }] } });
    expect(mapped.amountCents).toBe(19_600);
    expect(mapped.quantity).toBe(4);
    expect(mapped.status).toBe("past_due");
  });

  it("summiert mehrere Positionen", () => {
    const mapped = mapStripeSubscription({
      status: "active",
      items: { data: [monthly, { price: { unit_amount: 1000, recurring: { interval: "month" } }, quantity: 2 }] },
    });
    expect(mapped.amountCents).toBe(6900);
  });

  it("macht den Gesamtpreis unbekannt, sobald eine Position keinen Preis hat", () => {
    const mapped = mapStripeSubscription({
      status: "active",
      items: { data: [monthly, { price: { unit_amount: null, recurring: { interval: "month" } } }] },
    });
    expect(mapped.amountCents).toBeNull();
  });

  it("haelt Abos ohne Positionen ehrlich leer", () => {
    expect(mapStripeSubscription({ status: "active", items: { data: [] } })).toEqual({
      status: "active",
      amountCents: null,
      interval: null,
      quantity: null,
    });
  });

  it("ignoriert unbekannte Intervalle statt sie als Monat zu zaehlen", () => {
    const mapped = mapStripeSubscription({
      status: "active",
      items: { data: [{ price: { unit_amount: 999, recurring: { interval: "week" } }, quantity: 1 }] },
    });
    expect(mapped.amountCents).toBeNull();
  });
});
