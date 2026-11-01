import { describe, expect, it } from "vitest";
import {
  checkAuthGates,
  evaluateStagingSmokeReport,
  validateHealthEndpoint,
} from "../lib/staging-smoke-logic";

describe("Staging Smoke Logic (Sprint 379)", () => {
  it("validates health endpoint correctly", () => {
    const valid = validateHealthEndpoint({ status: 200, body: { ok: true } });
    expect(valid.ok).toBe(true);

    const invalidStatus = validateHealthEndpoint({ status: 500, body: { ok: true } });
    expect(invalidStatus.ok).toBe(false);

    const invalidBody = validateHealthEndpoint({ status: 200, body: { ok: false } });
    expect(invalidBody.ok).toBe(false);
  });

  it("checks auth gates for protected endpoints", () => {
    const endpoints = [
      { path: "/api/account/me", status: 401 },
      { path: "/api/billing", status: 401 },
      { path: "/api/ops/overview", status: 403 },
    ];
    const result = checkAuthGates(endpoints);
    expect(result.passed).toBe(true);
    expect(result.protectedCount).toBe(3);

    const failEndpoints = [
      { path: "/api/account/me", status: 200 },
    ];
    const failResult = checkAuthGates(failEndpoints);
    expect(failResult.passed).toBe(false);
  });

  it("evaluates a complete staging smoke report", () => {
    const report = evaluateStagingSmokeReport({
      healthResponse: { status: 200, body: { ok: true } },
      authGates: [
        { path: "/api/account/me", status: 401 },
        { path: "/api/billing", status: 401 },
      ],
      deepHealth: { db: true, neon: true, workspace: true },
      webhookEnforcement: { unsignedRejected: true, statusCode: 400 },
      billingStatus: { subscriptionActive: true, customerConfigured: true, tier: "pro" },
      checkoutGate: { adminForbidden: true, statusCode: 403 },
      draftQueue: { readable: true, pendingCount: 2 },
    });

    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
    expect(report.passedChecks).toBe(7);
    expect(report.honestLimits.length).toBeGreaterThan(0);
  });
});
