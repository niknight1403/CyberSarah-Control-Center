import { describe, expect, it } from "vitest";
import {
  COLD_START_RETRY_DELAYS_MS,
  buildWarmupPlan,
  classifyWorkspaceFailure,
  describeWorkspaceFailureKind,
  nextRetryDelayMs,
  shouldRetryColdStart,
} from "../lib/workspace-coldstart-logic";

describe("workspace-coldstart-logic", () => {
  it("klassifiziert Verbindungs- und Gateway-Fehler als Kaltstart", () => {
    expect(classifyWorkspaceFailure({ code: "ECONNREFUSED" })).toBe("coldStart");
    expect(classifyWorkspaceFailure({ code: "ETIMEDOUT" })).toBe("coldStart");
    expect(classifyWorkspaceFailure({ code: "ENOTFOUND" })).toBe("coldStart");
    expect(classifyWorkspaceFailure({ status: 502 })).toBe("coldStart");
    expect(classifyWorkspaceFailure({ status: 503 })).toBe("coldStart");
    expect(classifyWorkspaceFailure({ status: 504 })).toBe("coldStart");
    expect(classifyWorkspaceFailure({ status: 408 })).toBe("coldStart");
  });

  it("trennt Auth-Fehler und echte Ausfaelle vom Kaltstart", () => {
    expect(classifyWorkspaceFailure({ status: 401 })).toBe("auth");
    expect(classifyWorkspaceFailure({ status: 403 })).toBe("auth");
    expect(classifyWorkspaceFailure({ status: 500 })).toBe("down");
    expect(classifyWorkspaceFailure({ status: 404 })).toBe("down");
    expect(classifyWorkspaceFailure({})).toBe("down");
    expect(classifyWorkspaceFailure({ code: "SOME_OTHER_CODE" })).toBe("down");
  });

  it("erlaubt Retries nur fuer Kaltstart und nur bis zum Planende", () => {
    expect(shouldRetryColdStart(0, { status: 503 })).toBe(true);
    expect(shouldRetryColdStart(1, { status: 503 })).toBe(true);
    expect(shouldRetryColdStart(2, { status: 503 })).toBe(false);
    expect(shouldRetryColdStart(0, { status: 500 })).toBe(false);
    expect(shouldRetryColdStart(0, { status: 401 })).toBe(false);
    expect(shouldRetryColdStart(0, { status: 503 }, 0)).toBe(false);
  });

  it("liefert aufsteigende Wartezeiten und stoppt danach deterministisch", () => {
    expect(COLD_START_RETRY_DELAYS_MS[0]).toBeLessThan(COLD_START_RETRY_DELAYS_MS[1]);
    expect(nextRetryDelayMs(0)).toBe(COLD_START_RETRY_DELAYS_MS[0]);
    expect(nextRetryDelayMs(1)).toBe(COLD_START_RETRY_DELAYS_MS[1]);
    expect(nextRetryDelayMs(2)).toBeNull();
    expect(nextRetryDelayMs(-1)).toBeNull();
  });

  it("baut einen begrenzten, deterministischen Warmup-Plan", () => {
    const plan = buildWarmupPlan("https://workspace.example.com/");
    expect(plan).toHaveLength(1 + COLD_START_RETRY_DELAYS_MS.length);
    expect(plan[0]).toEqual({
      url: "https://workspace.example.com/api/v1/health",
      waitBeforeMs: 0,
      attempt: 0,
    });
    expect(plan[1].waitBeforeMs).toBe(COLD_START_RETRY_DELAYS_MS[0]);
    expect(plan[plan.length - 1].attempt).toBe(COLD_START_RETRY_DELAYS_MS.length);
    const custom = buildWarmupPlan("https://svc.internal", "/healthz");
    expect(custom[0].url).toBe("https://svc.internal/healthz");
  });

  it("beschreibt Fehlerklassen handlungsfaehig und tokenfrei", () => {
    expect(describeWorkspaceFailureKind("coldStart")).toContain("Render Free");
    expect(describeWorkspaceFailureKind("auth")).toContain("SERVICE_ACCESS_TOKEN");
    expect(describeWorkspaceFailureKind("down")).toContain("Dienst-Status");
  });
});
