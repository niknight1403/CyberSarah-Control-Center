import { describe, expect, it, vi } from "vitest";
import { computeRefundDelta, computeRefundTokens } from "../lib/entitlement-logic";
import { refundCreditsForCharge, type RefundDeps } from "../server/credit-ledger";

describe("computeRefundTokens", () => {
  it("entzieht bei voller Erstattung genau die Gutschrift", () => {
    expect(computeRefundTokens({ grantedTokens: 250_000, paidCents: 1_999, refundedCents: 1_999 })).toBe(250_000);
  });

  it("rechnet Teilerstattungen anteilig und abgerundet", () => {
    expect(computeRefundTokens({ grantedTokens: 250_000, paidCents: 2_000, refundedCents: 1_000 })).toBe(125_000);
    expect(computeRefundTokens({ grantedTokens: 50_000, paidCents: 3, refundedCents: 1 })).toBe(16_666);
  });

  it("behandelt Übererstattung wie volle Erstattung", () => {
    expect(computeRefundTokens({ grantedTokens: 50_000, paidCents: 499, refundedCents: 900 })).toBe(50_000);
  });

  it("gibt bei 0 Beträgen nichts zurück", () => {
    expect(computeRefundTokens({ grantedTokens: 50_000, paidCents: 0, refundedCents: 500 })).toBe(0);
    expect(computeRefundTokens({ grantedTokens: 50_000, paidCents: 499, refundedCents: 0 })).toBe(0);
    expect(computeRefundTokens({ grantedTokens: 0, paidCents: 499, refundedCents: 499 })).toBe(0);
  });
});

describe("computeRefundDelta", () => {
  it("zieht nur die Differenz zu bereits entzogenen Tokens nach", () => {
    const plan = computeRefundDelta({
      grantedTokens: 250_000,
      paidCents: 2_000,
      refundedCents: 1_000,
      alreadyRefundedTokens: 50_000,
      availableBalance: 900_000,
    });
    expect(plan.delta).toBe(75_000);
    expect(plan.cappedByBalance).toBe(false);
  });

  it("bucht nichts, wenn bereits alles entzogen ist", () => {
    const plan = computeRefundDelta({
      grantedTokens: 250_000,
      paidCents: 2_000,
      refundedCents: 2_000,
      alreadyRefundedTokens: 250_000,
      availableBalance: 900_000,
    });
    expect(plan.delta).toBe(0);
  });

  it("geht nie ins Minus, wenn das Guthaben verbraucht ist", () => {
    const plan = computeRefundDelta({
      grantedTokens: 250_000,
      paidCents: 2_000,
      refundedCents: 2_000,
      alreadyRefundedTokens: 0,
      availableBalance: 40_000,
    });
    expect(plan.delta).toBe(40_000);
    expect(plan.cappedByBalance).toBe(true);
  });

  it("verbucht ohne bekannten Kontostand die volle Zielmenge", () => {
    const plan = computeRefundDelta({
      grantedTokens: 50_000,
      paidCents: 499,
      refundedCents: 499,
      alreadyRefundedTokens: 0,
      availableBalance: null,
    });
    expect(plan.delta).toBe(50_000);
  });
});

function deps(overrides: Partial<RefundDeps> = {}): {
  deps: RefundDeps;
  bookNegative: ReturnType<typeof vi.fn>;
} {
  const bookNegative = vi.fn(async () => ({ booked: true, duplicate: false }));
  return {
    bookNegative,
    deps: {
      grantedTokensByPaymentIntent: overrides.grantedTokensByPaymentIntent ?? vi.fn(async () => ({ openId: "open_1", tokens: 250_000 })),
      refundedTokensByPaymentIntent: overrides.refundedTokensByPaymentIntent ?? vi.fn(async () => 0),
      balanceOf: overrides.balanceOf ?? vi.fn(async () => 1_000_000),
      bookNegative: (overrides.bookNegative as RefundDeps["bookNegative"]) ?? bookNegative,
    },
  };
}

describe("refundCreditsForCharge", () => {
  it("bucht die volle Gutschrift als Gegenposten zurück", async () => {
    const { deps: d, bookNegative } = deps();
    const result = await refundCreditsForCharge(
      { chargeId: "ch_1", paymentIntent: "pi_1", paidCents: 1_999, refundedCents: 1_999 },
      d,
    );
    expect(result.booked).toBe(true);
    expect(result.tokens).toBe(250_000);
    expect(bookNegative).toHaveBeenCalledWith({
      openId: "open_1",
      tokens: 250_000,
      reason: expect.stringContaining("ch_1"),
      executionKey: "stripe_refund:ch_1:1999",
      paymentIntent: "pi_1",
    });
  });

  it("bucht nichts, wenn zu der Zahlung keine Gutschrift existiert", async () => {
    const { deps: d, bookNegative } = deps({ grantedTokensByPaymentIntent: vi.fn(async () => null) });
    const result = await refundCreditsForCharge(
      { chargeId: "ch_abo", paymentIntent: "pi_abo", paidCents: 2_900, refundedCents: 2_900 },
      d,
    );
    expect(result.booked).toBe(false);
    expect(result.reason).toContain("Keine Guthaben-Gutschrift");
    expect(bookNegative).not.toHaveBeenCalled();
  });

  it("nutzt den kumulierten Betrag im Schlüssel, damit Teil-Erstattungen nachziehen", async () => {
    const { deps: d, bookNegative } = deps({
      refundedTokensByPaymentIntent: vi.fn(async () => 125_000),
    });
    await refundCreditsForCharge(
      { chargeId: "ch_2", paymentIntent: "pi_2", paidCents: 2_000, refundedCents: 2_000 },
      d,
    );
    expect(bookNegative).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: 125_000, executionKey: "stripe_refund:ch_2:2000" }),
    );
  });

  it("meldet eine Wiederholung ohne zweite Gegenbuchung", async () => {
    const { deps: d } = deps({
      refundedTokensByPaymentIntent: vi.fn(async () => 250_000),
    });
    const result = await refundCreditsForCharge(
      { chargeId: "ch_3", paymentIntent: "pi_3", paidCents: 1_999, refundedCents: 1_999 },
      d,
    );
    expect(result.booked).toBe(false);
    expect(result.duplicate).toBe(true);
  });

  it("begrenzt auf das vorhandene Guthaben und benennt das ehrlich", async () => {
    const { deps: d } = deps({ balanceOf: vi.fn(async () => 30_000) });
    const result = await refundCreditsForCharge(
      { chargeId: "ch_4", paymentIntent: "pi_4", paidCents: 1_999, refundedCents: 1_999 },
      d,
    );
    expect(result.tokens).toBe(30_000);
    expect(result.cappedByBalance).toBe(true);
    expect(result.reason).toContain("nicht gedeckt");
  });

  it("reicht einen Datenbankfehler weiter, statt ihn zu verschlucken", async () => {
    const { deps: d } = deps({
      bookNegative: vi.fn(async () => {
        throw new Error("Kontodatenbank nicht verfuegbar");
      }),
    });
    await expect(
      refundCreditsForCharge({ chargeId: "ch_5", paymentIntent: "pi_5", paidCents: 499, refundedCents: 499 }, d),
    ).rejects.toThrow("Kontodatenbank");
  });
});
