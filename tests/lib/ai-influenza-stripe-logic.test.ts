import { describe, expect, it } from "vitest";
import {
  baueCheckoutPlan,
  erkenneModus,
  planeStripeObjekte,
  pruefeStripeModus,
  summiereBestaetigtenUmsatzCent,
  wertWebhookAus,
} from "../../lib/ai-influenza-stripe-logic";

describe("Modus-Sperre", () => {
  it("erkennt den Modus nur am Praefix", () => {
    expect(erkenneModus("sk_test_abc")).toBe("test");
    expect(erkenneModus("rk_test_abc")).toBe("test");
    expect(erkenneModus("sk_live_abc")).toBe("live");
    expect(erkenneModus("pk_live_abc")).toBe("unbekannt");
    expect(erkenneModus("")).toBe("unbekannt");
    expect(erkenneModus(undefined)).toBe("unbekannt");
  });
  it("erlaubt Test-Keys immer", () => {
    expect(pruefeStripeModus("sk_test_abc", false)).toMatchObject({ erlaubt: true, modus: "test" });
  });
  it("sperrt Live-Keys ohne ausdrueckliche Freigabe", () => {
    const r = pruefeStripeModus("sk_live_abc", false);
    expect(r.erlaubt).toBe(false);
    expect(r.grund).toMatch(/AI_INFLUENZA_STRIPE_LIVE/);
  });
  it("erlaubt Live-Keys nur mit Freigabe", () => {
    expect(pruefeStripeModus("sk_live_abc", true)).toMatchObject({ erlaubt: true, modus: "live" });
  });
  it("lehnt unbekannte oder fehlende Keys ab", () => {
    expect(pruefeStripeModus("xyz", true).erlaubt).toBe(false);
    expect(pruefeStripeModus(undefined, true).erlaubt).toBe(false);
  });
});

describe("Stripe-Objektplan", () => {
  it("plant drei Pakete mit korrekten Cent-Betraegen und modusgebundenem lookup_key", () => {
    const plan = planeStripeObjekte("test");
    expect(plan.map((p) => p.betragCent)).toEqual([29900, 99900, 249900]);
    expect(plan.map((p) => p.lookupKey)).toEqual([
      "ai_influenza_starter_monthly_test",
      "ai_influenza_growth_monthly_test",
      "ai_influenza_business_monthly_test",
    ]);
    expect(new Set(plan.map((p) => p.waehrung))).toEqual(new Set(["eur"]));
  });
  it("trennt Test- und Live-Objekte ueber den lookup_key", () => {
    const t = planeStripeObjekte("test").map((p) => p.lookupKey);
    const l = planeStripeObjekte("live").map((p) => p.lookupKey);
    expect(t.some((k) => l.includes(k))).toBe(false);
  });
});

describe("Checkout-Plan", () => {
  const ok = { paketId: "growth", kundeId: 7, angebotId: 3, kundeEmail: "a@firma.de", baseUrl: "https://hub.example.com/ccc/" };
  it("baut den Plan mit Metadaten-Vertrag", () => {
    const p = baueCheckoutPlan(ok, "test");
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.lookupKey).toBe("ai_influenza_growth_monthly_test");
      expect(p.metadata).toMatchObject({ source: "cybersarah-ai-influenza", paket: "growth", kundeId: "7", angebotId: "3", modus: "test" });
      expect(p.successUrl).toBe("https://hub.example.com/ccc/ai-influenza/checkout?status=success&session_id={CHECKOUT_SESSION_ID}");
    }
  });
  it("lehnt ungueltige Eingaben ab", () => {
    expect(baueCheckoutPlan({ ...ok, paketId: "gold" }, "test").ok).toBe(false);
    expect(baueCheckoutPlan({ ...ok, kundeId: 0 }, "test").ok).toBe(false);
    expect(baueCheckoutPlan({ ...ok, angebotId: 0 }, "test").ok).toBe(false);
    expect(baueCheckoutPlan({ ...ok, kundeEmail: "kaputt" }, "test").ok).toBe(false);
    expect(baueCheckoutPlan({ ...ok, baseUrl: "http://unsicher.de" }, "test").ok).toBe(false);
  });
});

describe("Webhook-Auswertung", () => {
  const meta = { source: "cybersarah-ai-influenza", paket: "starter", kundeId: "5", angebotId: "9" };
  const session = (over: Record<string, unknown> = {}, livemode = false) => ({
    id: "evt_1",
    type: "checkout.session.completed",
    livemode,
    data: { object: { payment_status: "paid", metadata: meta, subscription: "sub_1", customer: "cus_1", amount_total: 29900, ...over } },
  });

  it("legt bei bezahlter Checkout-Session einen Auftrag an", () => {
    expect(wertWebhookAus(session(), "test")).toMatchObject({ art: "auftrag_anlegen", kundeId: 5, angebotId: 9, paketId: "starter", stripeSubscriptionId: "sub_1", betragCent: 29900 });
  });
  it("ignoriert unbezahlte Sessions", () => {
    expect(wertWebhookAus(session({ payment_status: "unpaid" }), "test").art).toBe("ignorieren");
  });
  it("ignoriert Events im falschen Modus", () => {
    expect(wertWebhookAus(session({}, true), "test").art).toBe("ignorieren");
    expect(wertWebhookAus(session({}, false), "live").art).toBe("ignorieren");
  });
  it("ignoriert Fremd-Events ohne unseren Metadaten-Vertrag", () => {
    expect(wertWebhookAus(session({ metadata: { source: "cybersarah-control-center" } }), "test").art).toBe("ignorieren");
  });
  it("ignoriert unvollstaendige Metadaten", () => {
    expect(wertWebhookAus(session({ metadata: { ...meta, kundeId: "x" } }), "test").art).toBe("ignorieren");
  });
  it("erfasst bezahlte Rechnungen mit Betrag", () => {
    const ev = { type: "invoice.paid", livemode: false, data: { object: { id: "in_1", amount_paid: 99900, customer: "cus_1", subscription: "sub_1", subscription_details: { metadata: meta } } } };
    expect(wertWebhookAus(ev, "test")).toMatchObject({ art: "zahlung_erfasst", betragCent: 99900, rechnungId: "in_1" });
  });
  it("zaehlt keine Rechnung ohne Zahlbetrag", () => {
    const ev = { type: "invoice.paid", livemode: false, data: { object: { id: "in_2", amount_paid: 0, subscription_details: { metadata: meta } } } };
    expect(wertWebhookAus(ev, "test").art).toBe("ignorieren");
  });
  it("meldet fehlgeschlagene Zahlungen", () => {
    const ev = { type: "invoice.payment_failed", livemode: false, data: { object: { id: "in_3", subscription: "sub_1", subscription_details: { metadata: meta } } } };
    expect(wertWebhookAus(ev, "test")).toMatchObject({ art: "zahlung_fehlgeschlagen", stripeSubscriptionId: "sub_1" });
  });
  it("erkennt das Abo-Ende nur bei eigenem Abo", () => {
    const eigen = { type: "customer.subscription.deleted", livemode: false, data: { object: { id: "sub_9", metadata: meta } } };
    const fremd = { type: "customer.subscription.deleted", livemode: false, data: { object: { id: "sub_8", metadata: {} } } };
    expect(wertWebhookAus(eigen, "test")).toMatchObject({ art: "abo_beendet", stripeSubscriptionId: "sub_9" });
    expect(wertWebhookAus(fremd, "test").art).toBe("ignorieren");
  });
  it("ignoriert nicht ausgewertete Eventtypen", () => {
    expect(wertWebhookAus({ type: "charge.refunded", livemode: false, data: { object: {} } }, "test").art).toBe("ignorieren");
  });
});

describe("Umsatz nur aus bestaetigten Zahlungen", () => {
  it("summiert nur bezahlte Positionen mit positivem Betrag", () => {
    expect(
      summiereBestaetigtenUmsatzCent([
        { betragCent: 29900, status: "bezahlt" },
        { betragCent: 99900, status: "offen" },
        { betragCent: 99900, status: "fehlgeschlagen" },
        { betragCent: -500, status: "bezahlt" },
        { betragCent: 49900, status: "bezahlt" },
      ]),
    ).toBe(79800);
  });
});
