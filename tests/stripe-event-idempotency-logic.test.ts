import { describe, expect, it } from "vitest";
import {
  applyRefundIdempotency,
  decideWebhookDelivery,
  STALE_PROCESSING_MS,
  summarizeWebhookDeliveries,
  webhookAggregateKey,
  type WebhookEventRecord,
} from "../lib/stripe-event-idempotency-logic";

const NOW = Date.parse("2026-11-02T00:00:00Z");
const event = (over: Partial<{ eventId: string; type: string; aggregateKey: string | null; createdAtMs: number | null }> = {}) => ({
  eventId: "evt_1",
  type: "invoice.paid",
  aggregateKey: "invoice:in_1",
  createdAtMs: NOW - 60_000,
  ...over,
});
const record = (over: Partial<WebhookEventRecord> = {}): WebhookEventRecord => ({
  eventId: "evt_1",
  type: "invoice.paid",
  aggregateKey: "invoice:in_1",
  status: "processed",
  receivedAtMs: NOW - 30_000,
  processedAtMs: NOW - 29_000,
  eventCreatedAtMs: NOW - 60_000,
  ...over,
});

describe("Sprint 25 – Webhook-Wiederholungen idempotent verarbeiten", () => {
  it("verarbeitet ein unbekanntes Event und wiederholt ein bereits verarbeitetes nicht", () => {
    expect(decideWebhookDelivery({ event: event(), prior: null, nowMs: NOW })).toBe("process");
    expect(decideWebhookDelivery({ event: event(), prior: record(), nowMs: NOW })).toBe("duplicate_skip");
  });

  it("laesst fehlgeschlagene Zustellungen erneut zu, statt sie als erledigt zu behandeln", () => {
    expect(decideWebhookDelivery({ event: event(), prior: record({ status: "failed" }), nowMs: NOW })).toBe("retry");
  });

  it("blockiert parallele Zustellungen und gibt haengende Verarbeitungen nach 5 Minuten frei", () => {
    const fresh = record({ status: "processing", receivedAtMs: NOW - 10_000 });
    expect(decideWebhookDelivery({ event: event(), prior: fresh, nowMs: NOW })).toBe("concurrent_retry");
    const stale = record({ status: "processing", receivedAtMs: NOW - STALE_PROCESSING_MS - 1 });
    expect(decideWebhookDelivery({ event: event(), prior: stale, nowMs: NOW })).toBe("reclaim_stale");
  });

  it("verwirft ein aelteres Event desselben Aggregats, damit kein neuerer Zustand ueberschrieben wird", () => {
    const late = event({ createdAtMs: NOW - 600_000 });
    expect(
      decideWebhookDelivery({
        event: late, prior: null, nowMs: NOW,
        lastProcessedEventCreatedAtMs: NOW - 60_000,
        lastProcessedAggregateKey: "invoice:in_1",
      }),
    ).toBe("stale_out_of_order");
  });

  it("verarbeitet ein neueres Event desselben Aggregats, auch wenn es frueher eintrifft", () => {
    const newer = event({ createdAtMs: NOW + 60_000 });
    expect(
      decideWebhookDelivery({
        event: newer, prior: null, nowMs: NOW,
        lastProcessedEventCreatedAtMs: NOW - 60_000,
        lastProcessedAggregateKey: "invoice:in_1",
      }),
    ).toBe("process");
  });

  it("vergleicht nur innerhalb eines Aggregats und ohne Zeitbelege nicht", () => {
    expect(
      decideWebhookDelivery({
        event: event({ aggregateKey: "subscription:sub_2" }),
        prior: null,
        nowMs: NOW,
        lastProcessedEventCreatedAtMs: NOW,
        lastProcessedAggregateKey: "invoice:in_1",
      }),
    ).toBe("process");
    expect(
      decideWebhookDelivery({
        event: event({ aggregateKey: null, createdAtMs: null }),
        prior: null,
        nowMs: NOW,
        lastProcessedEventCreatedAtMs: NOW,
        lastProcessedAggregateKey: "invoice:in_1",
      }),
    ).toBe("process");
  });

  it("leitet Aggregatsschluessel aus Event-Typ und Objekt ab", () => {
    expect(webhookAggregateKey({ type: "customer.subscription.updated", object: { id: "sub_9" } })).toBe("subscription:sub_9");
    expect(webhookAggregateKey({ type: "invoice.paid", object: { id: "in_9" } })).toBe("invoice:in_9");
    expect(webhookAggregateKey({ type: "charge.refunded", object: { id: "ch_9" } })).toBe("charge:ch_9");
    expect(webhookAggregateKey({ type: "refund.created", object: { charge: "ch_7", id: "re_1" } })).toBe("charge:ch_7");
    expect(webhookAggregateKey({ type: "checkout.session.completed", object: { id: "cs_9" } })).toBe("checkout:cs_9");
    expect(webhookAggregateKey({ type: "customer.created", object: { id: "cus_1" } })).toBeNull();
    expect(webhookAggregateKey({ type: "invoice.paid", object: {} })).toBeNull();
  });

  it("bucht einen Refund genau einmal und deckelt Ueberbuchungen auf den Restbetrag", () => {
    const first = applyRefundIdempotency({ refundedTotalMinor: 0, newRefundMinor: 1000, chargeAmountMinor: 2500, eventId: "evt_r1", processedEventIds: [] });
    expect(first).toMatchObject({ acceptedMinor: 1000, duplicate: false, capped: false, fullyRefunded: false });

    const replay = applyRefundIdempotency({ refundedTotalMinor: 1000, newRefundMinor: 1000, chargeAmountMinor: 2500, eventId: "evt_r1", processedEventIds: ["evt_r1"] });
    expect(replay).toMatchObject({ acceptedMinor: 0, duplicate: true });

    const over = applyRefundIdempotency({ refundedTotalMinor: 2000, newRefundMinor: 1000, chargeAmountMinor: 2500, eventId: "evt_r2" });
    expect(over).toMatchObject({ acceptedMinor: 500, capped: true, fullyRefunded: true });
  });

  it("bucht auf eine vollstaendig erstattete Charge nichts weiter", () => {
    const result = applyRefundIdempotency({ refundedTotalMinor: 2500, newRefundMinor: 2500, chargeAmountMinor: 2500, eventId: "evt_r3" });
    expect(result).toMatchObject({ acceptedMinor: 0, capped: true, fullyRefunded: true, duplicate: false });
  });

  it("ignoriert Refund-Events ohne Betrag, ohne sie als Duplikat zu taufen", () => {
    expect(applyRefundIdempotency({ refundedTotalMinor: 0, newRefundMinor: 0, chargeAmountMinor: 1000, eventId: "evt_r4" })).toMatchObject({
      acceptedMinor: 0,
      duplicate: false,
    });
  });

  it("fasst Zustellungen ehrlich zusammen und markiert haengende Verarbeitungen", () => {
    const empty = summarizeWebhookDeliveries([]);
    expect(empty).toMatchObject({ total: 0, note: expect.stringContaining("Noch keine") });

    const now = Date.now();
    const rows: WebhookEventRecord[] = [
      record({ eventId: "a", status: "processed" }),
      record({ eventId: "b", status: "failed" }),
      record({ eventId: "c", status: "processing", receivedAtMs: now - 1_000 }),
      record({ eventId: "d", status: "processing", receivedAtMs: now - STALE_PROCESSING_MS - 10_000 }),
    ];
    const summary = summarizeWebhookDeliveries(rows);
    expect(summary).toMatchObject({ total: 4, processed: 1, failed: 1, inFlight: 2, staleInFlight: 1 });
    expect(summary.note).toContain("abgebrochen");
  });
});
