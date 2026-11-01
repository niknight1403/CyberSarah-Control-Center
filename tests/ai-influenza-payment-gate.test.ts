import { describe, expect, it } from "vitest";
import {
  aiInfluenzaPaymentStatusForSubscriptionStatus,
  applyAiInfluenzaVerifiedInvoicePayment,
  subscriptionHasVerifiedLatestPaidInvoice,
  type AiInfluenzaOrderPayload,
} from "../lib/ai-influenza-team-logic";

const order: AiInfluenzaOrderPayload = {
  businessUnit: "ai-influenza-team",
  orderId: "ait-test-1",
  customerNodeKey: "customer:test",
  packageId: "starter",
  mode: "assisted",
  step: "payment-pending",
  monthlyBudgetCents: 10000,
  paymentStatus: "pending",
  stripeSubscriptionId: "sub_1",
  testOnly: false,
  createdByOpenId: "user:test",
};

describe("AI Influenza Stripe payment gate", () => {
  it("never treats active or trialing subscription status as payment", () => {
    expect(aiInfluenzaPaymentStatusForSubscriptionStatus("active")).toBe("pending");
    expect(aiInfluenzaPaymentStatusForSubscriptionStatus("trialing")).toBe("pending");
    expect(subscriptionHasVerifiedLatestPaidInvoice({
      subscriptionStatus: "trialing",
      latestInvoiceId: "in_1",
      lastPaidInvoiceId: "in_1",
    })).toBe(false);
  });

  it("requires the current active subscription invoice to match an invoice already recorded as paid", () => {
    expect(subscriptionHasVerifiedLatestPaidInvoice({
      subscriptionStatus: "active",
      latestInvoiceId: "in_1",
      lastPaidInvoiceId: "in_1",
    })).toBe(true);
    expect(subscriptionHasVerifiedLatestPaidInvoice({
      subscriptionStatus: "active",
      latestInvoiceId: "in_2",
      lastPaidInvoiceId: "in_1",
    })).toBe(false);
    expect(subscriptionHasVerifiedLatestPaidInvoice({
      subscriptionStatus: "incomplete",
      latestInvoiceId: "in_1",
      lastPaidInvoiceId: "in_1",
    })).toBe(false);
  });

  it("marks a real order paid only from a positive paid invoice for its subscription", () => {
    const result = applyAiInfluenzaVerifiedInvoicePayment(order, {
      invoiceId: "in_1",
      status: "paid",
      amountPaidCents: 29900,
      subscriptionId: "sub_1",
    });
    expect(result.applied).toBe(true);
    if (result.applied) {
      expect(result.order.step).toBe("paid");
      expect(result.order.paymentStatus).toBe("paid");
      expect(result.order.lastPaidInvoiceId).toBe("in_1");
    }
  });

  it.each([
    { status: "open", amountPaidCents: 29900, subscriptionId: "sub_1" },
    { status: "paid", amountPaidCents: 0, subscriptionId: "sub_1" },
    { status: "paid", amountPaidCents: 29900, subscriptionId: null },
    { status: "paid", amountPaidCents: 29900, subscriptionId: "sub_other" },
  ])("does not unlock delivery for an unverified invoice: %o", (invoice) => {
    const result = applyAiInfluenzaVerifiedInvoicePayment(order, {
      invoiceId: "in_bad",
      ...invoice,
    });
    expect(result.applied).toBe(false);
    expect(result.order.step).toBe("payment-pending");
    expect(result.order.paymentStatus).toBe("pending");
  });

  it("never unlocks a simulated/test-only order", () => {
    const result = applyAiInfluenzaVerifiedInvoicePayment({
      ...order,
      testOnly: true,
      paymentStatus: "test-only",
    }, {
      invoiceId: "in_test",
      status: "paid",
      amountPaidCents: 29900,
      subscriptionId: "sub_1",
    });
    expect(result.applied).toBe(false);
    expect(result.order.paymentStatus).toBe("test-only");
  });
});
