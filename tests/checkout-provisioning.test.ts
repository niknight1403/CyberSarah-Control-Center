import { describe, expect, it, vi } from "vitest";
import {
  provisionCheckoutEntitlement,
  resolveCheckoutOwner,
  type EntitlementDeps,
} from "../server/entitlements";

/**
 * Bewusst ohne vi.mock: die Suite läuft mit isolate:false, globale Modul-Mocks
 * sind dadurch reihenfolgeabhängig. Die Abhängigkeiten werden stattdessen
 * explizit injiziert (gleiches Muster wie der Revenue-Loop).
 */
function deps(overrides: Partial<Record<"openIdForUserId" | "grantCredits", unknown>> = {}): {
  deps: EntitlementDeps;
  grantCredits: ReturnType<typeof vi.fn>;
} {
  const grantCredits = vi.fn(async () => ({ booked: true, duplicate: false }));
  const openIdForUserId = vi.fn(async () => "open_from_db");
  const merged: EntitlementDeps = {
    openIdForUserId: (overrides.openIdForUserId as EntitlementDeps["openIdForUserId"]) ?? openIdForUserId,
    grantCredits: (overrides.grantCredits as EntitlementDeps["grantCredits"]) ?? grantCredits,
  };
  return { deps: merged, grantCredits };
}

describe("resolveCheckoutOwner", () => {
  it("nimmt die openId direkt aus client_reference_id", async () => {
    const owner = await resolveCheckoutOwner({ clientReferenceId: "user_abc123" }, deps().deps);
    expect(owner).toEqual({ userId: null, openId: "user_abc123" });
  });

  it("löst eine numerische Referenz über die Datenbank auf", async () => {
    const owner = await resolveCheckoutOwner({ clientReferenceId: "42" }, deps().deps);
    expect(owner).toEqual({ userId: 42, openId: "open_from_db" });
  });

  it("bevorzugt die openId aus den Metadaten", async () => {
    const owner = await resolveCheckoutOwner({ clientReferenceId: "42", metadata: { userOpenId: "meta_open" } }, deps().deps);
    expect(owner.openId).toBe("meta_open");
  });

  it("gibt ohne Referenz und ohne Metadaten nichts vor", async () => {
    const owner = await resolveCheckoutOwner({}, deps().deps);
    expect(owner).toEqual({ userId: null, openId: null });
  });
});

describe("provisionCheckoutEntitlement", () => {
  it("bucht ein bezahltes Token-Paket mit stripe_payment-Schlüssel", async () => {
    const { deps: d, grantCredits } = deps();
    const result = await provisionCheckoutEntitlement(
      {
        id: "cs_paid_1",
        mode: "payment",
        paymentStatus: "paid",
        clientReferenceId: "open_1",
        metadata: { creditPackageId: "credit_pack_medium", tokens: "250000" },
      },
      d,
    );
    expect(result.kind).toBe("credits");
    expect(result.tokens).toBe(250_000);
    expect(grantCredits).toHaveBeenCalledWith({
      openId: "open_1",
      tokens: 250_000,
      reason: expect.stringContaining("cs_paid_1"),
      executionKey: "stripe_payment:cs_paid_1",
    });
  });

  it("bucht nichts, wenn die Zahlung nicht bestätigt ist", async () => {
    const { deps: d, grantCredits } = deps();
    const result = await provisionCheckoutEntitlement(
      {
        id: "cs_unpaid",
        mode: "payment",
        paymentStatus: "unpaid",
        clientReferenceId: "open_1",
        metadata: { creditPackageId: "credit_pack_small" },
      },
      d,
    );
    expect(result.kind).toBe("none");
    expect(grantCredits).not.toHaveBeenCalled();
  });

  it("nutzt bei Wiederholung desselben Events denselben Schlüssel", async () => {
    const { deps: d, grantCredits } = deps();
    const session = {
      id: "cs_repeat",
      mode: "payment" as const,
      paymentStatus: "paid" as const,
      clientReferenceId: "open_1",
      metadata: { creditPackageId: "credit_pack_small" },
    };
    await provisionCheckoutEntitlement(session, d);
    await provisionCheckoutEntitlement(session, d);
    const keys = grantCredits.mock.calls.map((call) => (call[0] as { executionKey: string }).executionKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("stripe_payment:cs_repeat");
  });

  it("meldet ehrlich, wenn die Buchung nicht durchging", async () => {
    const { deps: d } = deps({ grantCredits: vi.fn(async () => ({ booked: false, duplicate: false })) });
    const result = await provisionCheckoutEntitlement(
      {
        id: "cs_fail",
        mode: "payment",
        paymentStatus: "paid",
        clientReferenceId: "open_1",
        metadata: { creditPackageId: "credit_pack_large" },
      },
      d,
    );
    expect(result.applied).toBe(false);
    expect(result.reason).toContain("nicht gebucht");
  });

  it("bucht nicht, wenn kein Nutzer auflösbar ist", async () => {
    const { deps: d, grantCredits } = deps({ openIdForUserId: vi.fn(async () => null) });
    const result = await provisionCheckoutEntitlement(
      {
        id: "cs_nouser",
        mode: "payment",
        paymentStatus: "paid",
        clientReferenceId: "42",
        metadata: { creditPackageId: "credit_pack_small" },
      },
      d,
    );
    expect(result.applied).toBe(false);
    expect(result.reason).toContain("Kein Nutzer");
    expect(grantCredits).not.toHaveBeenCalled();
  });

  it("erkennt den Tier-Checkout als Plan", async () => {
    const { deps: d } = deps();
    const result = await provisionCheckoutEntitlement(
      {
        id: "cs_tier",
        mode: "subscription",
        paymentStatus: "paid",
        clientReferenceId: "open_1",
        metadata: { tier: "pro" },
      },
      d,
    );
    expect(result.kind).toBe("plan");
    expect(result.plan).toBe("pro");
  });

  it("bucht dasselbe Paket nicht doppelt, wenn Stripe zweimal zustellt", async () => {
    const booked = new Set<string>();
    const grantCredits = vi.fn(async (input: { executionKey: string }) => {
      if (booked.has(input.executionKey)) return { booked: false, duplicate: true };
      booked.add(input.executionKey);
      return { booked: true, duplicate: false };
    });
    const { deps: d } = deps({ grantCredits });
    const session = {
      id: "cs_dup",
      mode: "payment" as const,
      paymentStatus: "paid" as const,
      clientReferenceId: "open_1",
      metadata: { creditPackageId: "credit_pack_small" },
    };
    const first = await provisionCheckoutEntitlement(session, d);
    const second = await provisionCheckoutEntitlement(session, d);
    expect(first.applied).toBe(true);
    expect(first.duplicate).toBe(false);
    // Zweite Zustellung gilt als erledigt (kein Retry-Sturm), bucht aber nichts.
    expect(second.applied).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(grantCredits).toHaveBeenCalledTimes(2);
    expect(booked.size).toBe(1);
  });
});

describe("provisionCheckoutEntitlement: Wiederholbarkeit", () => {
  it("markiert einen Datenbankfehler als wiederholbar", async () => {
    const { deps: d } = deps({
      grantCredits: vi.fn(async () => {
        throw new Error("Kontodatenbank nicht verfügbar");
      }),
    });
    const result = await provisionCheckoutEntitlement(
      {
        id: "cs_db_down",
        mode: "payment",
        paymentStatus: "paid",
        clientReferenceId: "open_1",
        metadata: { creditPackageId: "credit_pack_small" },
      },
      d,
    );
    expect(result.applied).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.reason).toContain("Kontodatenbank");
  });

  it("bucht bei verzögerter Zahlart erst nach Bestätigung", async () => {
    const { deps: d, grantCredits } = deps();
    const session = {
      id: "cs_async",
      mode: "payment" as const,
      clientReferenceId: "open_1",
      metadata: { creditPackageId: "credit_pack_medium" },
    };
    const offen = await provisionCheckoutEntitlement({ ...session, paymentStatus: "unpaid" }, d);
    expect(offen.kind).toBe("none");
    expect(grantCredits).not.toHaveBeenCalled();

    const bestaetigt = await provisionCheckoutEntitlement({ ...session, paymentStatus: "paid" }, d);
    expect(bestaetigt.kind).toBe("credits");
    expect(bestaetigt.tokens).toBe(250_000);
    expect(grantCredits).toHaveBeenCalledTimes(1);
  });
});
