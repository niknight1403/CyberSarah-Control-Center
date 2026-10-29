import { describe, expect, it } from "vitest";
import {
  classifyReadinessHttp, describeMobileReadiness, MOBILE_READINESS_STALE_AFTER_MS,
} from "@/lib/mobile-readiness-logic";

describe("mobile readiness evidence policy", () => {
  it("requires both HTTP 200 and an explicit healthy database check", () => {
    expect(classifyReadinessHttp(200, { ok: true, checks: { database: true } })).toBe("ready");
    expect(classifyReadinessHttp(200, { ok: true })).toBe("unreachable");
    expect(classifyReadinessHttp(200, { ok: true, checks: { database: "true" } })).toBe("unreachable");
    expect(classifyReadinessHttp(200, { ok: false, checks: { database: true } })).toBe("unreachable");
  });
  it("distinguishes confirmed database degradation from malformed errors", () => {
    expect(classifyReadinessHttp(503, { ok: false, checks: { database: false } })).toBe("degraded");
    expect(classifyReadinessHttp(503, "unavailable")).toBe("unreachable");
    expect(classifyReadinessHttp(503, { ok: true })).toBe("unreachable");
    expect(classifyReadinessHttp(401, null)).toBe("unreachable");
  });
  it("never treats absent or expired checks as live", () => {
    expect(describeMobileReadiness(null, 100_000).state).toBe("checking");
    expect(describeMobileReadiness({ outcome: "ready", checkedAtMs: 0 }, MOBILE_READINESS_STALE_AFTER_MS).state).toBe("stale");
    expect(describeMobileReadiness({ outcome: "ready", checkedAtMs: 110 }, 100).state).toBe("stale");
    expect(describeMobileReadiness({ outcome: "ready", checkedAtMs: NaN }, 100).state).toBe("stale");
  });
  it("uses truthful, distinct, small-screen labels for all outcomes", () => {
    expect(describeMobileReadiness({ outcome: "ready", checkedAtMs: 100 }, 200)).toMatchObject({ state: "ready", label: "Bereit", accent: "green" });
    expect(describeMobileReadiness({ outcome: "degraded", checkedAtMs: 100 }, 200)).toMatchObject({ state: "degraded", accent: "amber" });
    expect(describeMobileReadiness({ outcome: "unreachable", checkedAtMs: 100 }, 200)).toMatchObject({ state: "unreachable", accent: "red" });
  });
});
