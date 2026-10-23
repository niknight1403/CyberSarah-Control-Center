import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../server/routers";
import { revenueEngineUrl, saasOverview, triggerRevenueScan } from "../server/revenue-command-service";
import type { TrpcContext } from "../server/_core/context";

const ctx = (role: "admin" | "user" | null): TrpcContext => ({
  user: role ? { role } as NonNullable<TrpcContext["user"]> : null,
  req: { headers: {} } as TrpcContext["req"],
  res: { locals: {} } as TrpcContext["res"],
});

describe("Zentrale Revenue-Router", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
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
  it("behaelt den Reverse-Proxy-Praefix fuer Revenue-Scans", () => {
    expect(revenueEngineUrl(new URL("https://hub.cybersarah-ki.com/revenue-api"), "hara/scan").toString())
      .toBe("https://hub.cybersarah-ki.com/revenue-api/api/hara/scan");
    expect(revenueEngineUrl(new URL("http://127.0.0.1:18741"), "expansion/scan").toString())
      .toBe("http://127.0.0.1:18741/api/expansion/scan");
  });
  it("sendet den Scan wirklich an den Relay-Prefix und akzeptiert Background-Start", async () => {
    vi.stubEnv("REVENUE_OS_API_BASE_URL", "https://hub.cybersarah-ki.com/revenue-api");
    vi.stubEnv("REVENUE_OS_API_KEY", "test-internal-key");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("https://hub.cybersarah-ki.com/revenue-api/api/hara/scan");
      return new Response(JSON.stringify({ success: true, background: true }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(triggerRevenueScan("hara/scan")).resolves.toMatchObject({ accepted: true, background: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
