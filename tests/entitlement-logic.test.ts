import { describe, expect, it } from "vitest";
import {
  buildEntitlementView,
  canAfford,
  decideCheckoutEntitlement,
  resolveCreditTokens,
} from "../lib/entitlement-logic";
import { CREDIT_PACKS, PLAN_LIMITS } from "../lib/monetization-logic";

describe("resolveCreditTokens", () => {
  it("liest eine direkte Token-Zahl", () => {
    expect(resolveCreditTokens({ credits: "5000" })).toBe(5000);
    expect(resolveCreditTokens({ tokens: "750 " })).toBe(750);
  });

  it("löst eine Paket-Kennung auf die echten Paketgrößen auf", () => {
    const pack = CREDIT_PACKS[0];
    expect(resolveCreditTokens({ creditPackage: pack.id })).toBe(pack.tokens);
  });

  it("gibt bei unbekanntem Paket null zurück statt zu raten", () => {
    expect(resolveCreditTokens({ creditPackage: "credits_mega" })).toBeNull();
  });

  it("ignoriert unsinnige Zahlen", () => {
    expect(resolveCreditTokens({ credits: "0" })).toBeNull();
    expect(resolveCreditTokens({ credits: "-500" })).toBeNull();
    expect(resolveCreditTokens({ credits: "viele" })).toBeNull();
  });

  it("liefert null ohne Angabe", () => {
    expect(resolveCreditTokens({})).toBeNull();
  });
});

describe("decideCheckoutEntitlement", () => {
  it("schreibt Guthaben nur bei bestätigter Zahlung gut", () => {
    const paid = decideCheckoutEntitlement({
      id: "cs_1",
      mode: "payment",
      paymentStatus: "paid",
      metadata: { credits: "5000" },
    });
    expect(paid.kind).toBe("credits");
    expect(paid.tokens).toBe(5000);
    expect(paid.idempotencyKey).toBe("stripe_checkout:cs_1");

    const unpaid = decideCheckoutEntitlement({
      id: "cs_2",
      mode: "payment",
      paymentStatus: "unpaid",
      metadata: { credits: "5000" },
    });
    expect(unpaid.kind).toBe("none");
    expect(unpaid.reason).toContain("nicht bestätigt");
  });

  it("erkennt den Abo-Checkout und nennt den Plan", () => {
    const decision = decideCheckoutEntitlement({
      id: "cs_3",
      mode: "subscription",
      paymentStatus: "paid",
      metadata: { plan: "pro" },
    });
    expect(decision.kind).toBe("plan");
    expect(decision.plan).toBe("pro");
  });

  it("erfindet beim Abo ohne Plan-Angabe nichts", () => {
    const decision = decideCheckoutEntitlement({ id: "cs_4", mode: "subscription", paymentStatus: "paid" });
    expect(decision.kind).toBe("none");
    expect(decision.reason).toContain("Subscription-Sync");
  });

  it("bucht ohne Session-ID gar nichts", () => {
    const decision = decideCheckoutEntitlement({ mode: "payment", paymentStatus: "paid", metadata: { credits: "100" } });
    expect(decision.kind).toBe("none");
    expect(decision.idempotencyKey).toBeNull();
  });

  it("benennt eine bestätigte Zahlung ohne Guthaben-Angabe", () => {
    const decision = decideCheckoutEntitlement({ id: "cs_5", mode: "payment", paymentStatus: "paid", metadata: {} });
    expect(decision.kind).toBe("none");
    expect(decision.reason).toContain("keine Guthaben- oder Plan-Angabe");
  });

  it("nutzt die Session-ID als Idempotenz-Schlüssel, damit Wiederholungen nicht doppelt buchen", () => {
    const first = decideCheckoutEntitlement({ id: "cs_6", mode: "payment", paymentStatus: "paid", metadata: { credits: "100" } });
    const second = decideCheckoutEntitlement({ id: "cs_6", mode: "payment", paymentStatus: "paid", metadata: { credits: "100" } });
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });
});

describe("buildEntitlementView", () => {
  it("zeigt Plan, Status, Guthaben und Limits", () => {
    const view = buildEntitlementView({
      plan: "pro",
      subscription: {
        status: "active",
        currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
        cancelAtPeriodEnd: true,
      },
      creditsBalanceTokens: 4200,
    });
    expect(view.plan).toBe("pro");
    expect(view.planLabel).toBe(PLAN_LIMITS.pro.label);
    expect(view.status).toBe("active");
    expect(view.creditsBalanceTokens).toBe(4200);
    expect(view.cancelAtPeriodEnd).toBe(true);
    expect(view.currentPeriodEnd).toBe("2026-12-01T00:00:00.000Z");
    expect(view.limits.monthlyCloudTokens).toBe(PLAN_LIMITS.pro.monthlyCloudTokens);
    expect(view.creditPacks.length).toBe(CREDIT_PACKS.length);
  });

  it("gibt ohne Abo 'none' zurück und lässt das Guthaben ehrlich null", () => {
    const view = buildEntitlementView({ plan: "free", subscription: null, creditsBalanceTokens: null });
    expect(view.status).toBe("none");
    expect(view.creditsBalanceTokens).toBeNull();
    expect(view.currentPeriodEnd).toBeNull();
  });

  it("stuft trial und past_due korrekt ein", () => {
    expect(buildEntitlementView({ plan: "lite", subscription: { status: "trialing" }, creditsBalanceTokens: 0 }).status).toBe("trialing");
    expect(buildEntitlementView({ plan: "lite", subscription: { status: "past_due" }, creditsBalanceTokens: 0 }).status).toBe("past_due");
  });

  it("hebt Admin-Zugang auf Expert, ohne den Rest zu verfälschen", () => {
    const view = buildEntitlementView({ plan: "free", subscription: null, creditsBalanceTokens: 0, adminGuaranteed: true });
    expect(view.plan).toBe("expert");
    expect(view.limits.monthlyCloudTokens).toBe(PLAN_LIMITS.expert.monthlyCloudTokens);
  });
});

describe("canAfford", () => {
  it("erlaubt Läufe, die gedeckt sind", () => {
    expect(canAfford(1000, 900)).toEqual({ allowed: true, missingTokens: 0 });
    expect(canAfford(900, 900)).toEqual({ allowed: true, missingTokens: 0 });
  });

  it("nennt den fehlenden Betrag", () => {
    expect(canAfford(200, 1500)).toEqual({ allowed: false, missingTokens: 1300 });
  });

  it("blockiert, wenn das Guthaben unbekannt ist", () => {
    expect(canAfford(null, 10)).toEqual({ allowed: false, missingTokens: null });
  });

  it("behandelt kostenlose Läufe als gedeckt", () => {
    expect(canAfford(0, 0).allowed).toBe(true);
  });
});
