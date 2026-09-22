import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../server/routers";
import { saasOverview, triggerRevenueScan } from "../server/revenue-command-service";
import type { TrpcContext } from "../server/_core/context";

const ctx = (role: "admin" | "user" | null): TrpcContext => ({
  user: role ? { role } as NonNullable<TrpcContext["user"]> : null,
  req: { headers: {} } as TrpcContext["req"],
  res: { locals: {} } as TrpcContext["res"],
});

describe("Zentrale Revenue-Router", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("meldet bei fehlenden Quellen unbekannte statt erfundene SaaS-Kennzahlen", async () => {
    vi.stubEnv("REVENUE_OS_DATABASE_URL", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const result = await saasOverview();
    expect(result.subscriptions).toBeNull();
    expect(result.subscriptionsStatus).toBe("not-configured");
    expect(result.stripeStatus).toBe("not-configured");
    expect(result.checkout).toBeNull();
  });
  it("registriert alle Revenue-Domänen", () => {
    const c = appRouter.createCaller(ctx(null));
    expect(c.hara.overview).toBeTypeOf("function");
    expect(c.saas.overview).toBeTypeOf("function");
    expect(c.crossSell.overview).toBeTypeOf("function");
    expect(c.expansion.overview).toBeTypeOf("function");
    expect(c.subscriptionManagement.overview).toBeTypeOf("function");
  });
  it("verwehrt anonyme Abfragen und nicht-admins Finanzzahlen und Trigger", async () => {
    await expect(appRouter.createCaller(ctx(null)).saas.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(ctx("user")).hara.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(ctx("user")).expansion.scan()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("ohne Datenbank/Engine ehrlich fail-closed", async () => {
    if (!process.env.REVENUE_OS_DATABASE_URL) {
      await expect(appRouter.createCaller(ctx("admin")).hara.overview()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    }
    if (!process.env.REVENUE_OS_API_BASE_URL || !process.env.REVENUE_OS_API_KEY) {
      await expect(triggerRevenueScan("hara/scan")).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    }
  });
});
