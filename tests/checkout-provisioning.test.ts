import { beforeEach, describe, expect, it, vi } from "vitest";

const grantCreditsMock = vi.fn();
const getDbMock = vi.fn();

vi.mock("../server/credit-ledger", () => ({
  grantCredits: (...args: unknown[]) => grantCreditsMock(...args),
  getUserTotalCredits: vi.fn(async () => 0),
  readCreditBalance: vi.fn(async () => 0),
}));

vi.mock("../server/db", () => ({
  getDb: () => getDbMock(),
  getBillingSubscriptionForUser: vi.fn(async () => null),
}));

vi.mock("../server/monetization", () => ({
  resolvePlanForUser: vi.fn(async () => "free"),
}));

const { provisionCheckoutEntitlement, resolveCheckoutOwner } = await import("../server/entitlements");

describe("resolveCheckoutOwner", () => {
  beforeEach(() => {
    getDbMock.mockReset();
  });

  it("nimmt die openId direkt aus client_reference_id", async () => {
    const owner = await resolveCheckoutOwner({ clientReferenceId: "user_abc123" });
    expect(owner).toEqual({ userId: null, openId: "user_abc123" });
  });

  it("löst eine numerische Referenz über die Datenbank auf", async () => {
    getDbMock.mockResolvedValue({
      execute: async () => [{ open_id: "open_from_db" }],
    });
    const owner = await resolveCheckoutOwner({ clientReferenceId: "42" });
    expect(owner).toEqual({ userId: 42, openId: "open_from_db" });
  });

  it("bevorzugt die openId aus den Metadaten", async () => {
    const owner = await resolveCheckoutOwner({ clientReferenceId: "42", metadata: { userOpenId: "meta_open" } });
    expect(owner.openId).toBe("meta_open");
  });

  it("gibt ohne Referenz und ohne Metadaten nichts vor", async () => {
    const owner = await resolveCheckoutOwner({});
    expect(owner).toEqual({ userId: null, openId: null });
  });
});

describe("provisionCheckoutEntitlement", () => {
  beforeEach(() => {
    grantCreditsMock.mockReset();
    getDbMock.mockReset();
  });

  it("bucht ein bezahltes Token-Paket mit stripe_payment-Schlüssel", async () => {
    grantCreditsMock.mockResolvedValue(true);
    const result = await provisionCheckoutEntitlement({
      id: "cs_paid_1",
      mode: "payment",
      paymentStatus: "paid",
      clientReferenceId: "open_1",
      metadata: { creditPackageId: "credit_pack_medium", tokens: "250000" },
    });
    expect(result.kind).toBe("credits");
    expect(result.tokens).toBe(250_000);
    expect(grantCreditsMock).toHaveBeenCalledWith({
      openId: "open_1",
      tokens: 250_000,
      reason: expect.stringContaining("cs_paid_1"),
      executionKey: "stripe_payment:cs_paid_1",
    });
  });

  it("bucht nichts, wenn die Zahlung nicht bestätigt ist", async () => {
    const result = await provisionCheckoutEntitlement({
      id: "cs_unpaid",
      mode: "payment",
      paymentStatus: "unpaid",
      clientReferenceId: "open_1",
      metadata: { creditPackageId: "credit_pack_small" },
    });
    expect(result.kind).toBe("none");
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("nutzt bei Wiederholung desselben Events denselben Schlüssel", async () => {
    grantCreditsMock.mockResolvedValue(true);
    const session = {
      id: "cs_repeat",
      mode: "payment" as const,
      paymentStatus: "paid" as const,
      clientReferenceId: "open_1",
      metadata: { creditPackageId: "credit_pack_small" },
    };
    await provisionCheckoutEntitlement(session);
    await provisionCheckoutEntitlement(session);
    const keys = grantCreditsMock.mock.calls.map((call) => (call[0] as { executionKey: string }).executionKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("stripe_payment:cs_repeat");
  });

  it("meldet ehrlich, wenn die Buchung nicht durchging", async () => {
    grantCreditsMock.mockResolvedValue(false);
    const result = await provisionCheckoutEntitlement({
      id: "cs_fail",
      mode: "payment",
      paymentStatus: "paid",
      clientReferenceId: "open_1",
      metadata: { creditPackageId: "credit_pack_large" },
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toContain("nicht gebucht");
  });

  it("bucht nicht, wenn kein Nutzer auflösbar ist", async () => {
    getDbMock.mockResolvedValue(null);
    const result = await provisionCheckoutEntitlement({
      id: "cs_nouser",
      mode: "payment",
      paymentStatus: "paid",
      clientReferenceId: "42",
      metadata: { creditPackageId: "credit_pack_small" },
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toContain("Kein Nutzer");
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("erkennt den Tier-Checkout als Plan", async () => {
    const result = await provisionCheckoutEntitlement({
      id: "cs_tier",
      mode: "subscription",
      paymentStatus: "paid",
      clientReferenceId: "open_1",
      metadata: { tier: "pro" },
    });
    expect(result.kind).toBe("plan");
    expect(result.plan).toBe("pro");
  });
});
