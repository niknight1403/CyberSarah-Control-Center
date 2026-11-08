import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LiveProbeReport } from "../server/integrations/live-probe-service";

const mocks = vi.hoisted(() => ({
  getLiveProbes: vi.fn(),
  resetLiveProbeCache: vi.fn(),
}));

vi.mock("../server/integrations/live-probe-service", () => ({
  getLiveProbes: mocks.getLiveProbes,
  resetLiveProbeCache: mocks.resetLiveProbeCache,
  // Nur der Router steht hier auf dem Pruefstand; der Service selbst hat
  // eigene Tests (tests/live-probe-service.test.ts).
  collectLiveProbes: vi.fn(),
}));

const { appRouter } = await import("../server/routers");
type TrpcContext = import("../server/_core/context").TrpcContext;

function report(overrides: Partial<LiveProbeReport> = {}): LiveProbeReport {
  return {
    checkedAt: "2026-11-08T22:00:00.000Z",
    durationMs: 420,
    domain: "cybersarah-ki.com",
    fromCache: false,
    overall: "fail",
    summary: { total: 5, passed: 1, warned: 1, skipped: 1, failed: 2, exitCode: 1 },
    results: [
      { name: "Resend-Absenderdomain", severity: "fail", detail: "nie gestartet", provider: "resend" },
      { name: "Resend-DNS-Records", severity: "fail", detail: "2/2 fehlen", provider: "resend" },
      { name: "DMARC-Record", severity: "warn", detail: "kein _dmarc", provider: "resend" },
      { name: "TikTok Client-Credentials", severity: "skip", detail: "keine Schluessel", provider: "tiktok" },
      { name: "Meta Access-Token", severity: "pass", detail: "lesend bestaetigt", provider: "meta" },
    ],
    ...overrides,
  };
}

function context(role: "user" | "admin" | null): TrpcContext {
  const user =
    role === null
      ? null
      : {
          id: 1,
          openId: "sample-user",
          email: "sample@example.com",
          name: "Sample User",
          loginMethod: "manus",
          passwordHash: null,
          stripeCustomerId: null,
          role,
          designTheme: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

describe("integrationHealth-Router", () => {
  beforeEach(() => {
    mocks.getLiveProbes.mockReset();
    mocks.resetLiveProbeCache.mockReset();
    mocks.getLiveProbes.mockResolvedValue(report());
  });

  it("verlangt eine Anmeldung", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.integrationHealth.status()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("liefert Zaehler und Severities statt Rohdaten", async () => {
    const caller = appRouter.createCaller(context("user"));
    const result = await caller.integrationHealth.status();

    expect(result.domain).toBe("cybersarah-ki.com");
    expect(result.overall).toBe("fail");
    expect(result.counts).toEqual({ passed: 1, warned: 1, skipped: 1, failed: 2, total: 5 });
    expect(result.results[0]).toEqual({
      provider: "resend",
      name: "Resend-Absenderdomain",
      severity: "fail",
      detail: "nie gestartet",
    });
    expect(result.fromCache).toBe(false);
  });

  it("filtert nach Provider und rechnet das Urteil neu", async () => {
    const caller = appRouter.createCaller(context("user"));
    const meta = await caller.integrationHealth.status({ provider: "meta" });

    expect(meta.results).toHaveLength(1);
    expect(meta.counts).toEqual({ passed: 1, warned: 0, skipped: 0, failed: 0, total: 1 });
    expect(meta.overall).toBe("pass");
  });

  it("reicht force an den Service durch", async () => {
    const caller = appRouter.createCaller(context("user"));
    await caller.integrationHealth.status({ force: true });
    expect(mocks.getLiveProbes).toHaveBeenCalledWith({ force: true });
  });

  it("erlaubt den erzwungenen Lauf nur Admins", async () => {
    const userCaller = appRouter.createCaller(context("user"));
    await expect(userCaller.integrationHealth.refresh()).rejects.toMatchObject({ code: "FORBIDDEN" });

    const adminCaller = appRouter.createCaller(context("admin"));
    const result = await adminCaller.integrationHealth.refresh();
    expect(mocks.resetLiveProbeCache).toHaveBeenCalledTimes(1);
    expect(mocks.getLiveProbes).toHaveBeenCalledWith({ force: true });
    expect(result.counts.total).toBe(5);
  });

  it("liefert nur Handlungsbedarfe fuer Banner", async () => {
    const caller = appRouter.createCaller(context("user"));
    const result = await caller.integrationHealth.issues();

    expect(result.count).toBe(3);
    expect(result.overall).toBe("fail");
    expect(result.issues.every((issue) => issue.severity === "fail" || issue.severity === "warn")).toBe(true);
    expect(result.issues.map((issue) => issue.name)).not.toContain("Meta Access-Token");
  });

  it("meldet gruen, wenn es keine Handlungsbedarfe gibt", async () => {
    mocks.getLiveProbes.mockResolvedValue(
      report({
        overall: "pass",
        results: [{ name: "Resend-Absenderdomain", severity: "pass", detail: "verifiziert", provider: "resend" }],
      }),
    );
    const caller = appRouter.createCaller(context("user"));
    const result = await caller.integrationHealth.issues();
    expect(result).toMatchObject({ count: 0, overall: "pass" });
  });
});
