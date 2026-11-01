import { describe, expect, it } from "vitest";
import { growthAdminStatus } from "../lib/growth-admin-status";
import { initialGrowthRunState } from "../lib/growth-runtime-state";
import type { GrowthQualityReport } from "../lib/growth-data-quality";
const clean: GrowthQualityReport = { status: "valid", errors: [], warnings: [],
  observedCounters: 11, reviewedAt: "2026-10-30T00:00:00Z" };
const runtime = { ...initialGrowthRunState(), stale: false, elapsedMinutes: 0, completedAt: "2026-10-30T00:00:00Z" };
describe("Sprint 09: truthful admin growth status", () => {
  it("makes the deliberate pause visible", () => {
    expect(growthAdminStatus(clean, runtime, false).label).toBe("Pausiert");
  });
  it("shows quality failures before operational green", () => {
    expect(growthAdminStatus({ ...clean, status: "blocked", errors: ["negative views"] },
      runtime, true).label).toBe("Messfehler");
  });
  it("does not mark a stale or never-seen worker healthy", () => {
    expect(growthAdminStatus(clean, { ...runtime, completedAt: null }, true).label).toBe("Noch kein Lauf");
    expect(growthAdminStatus(clean, { ...runtime, stale: true }, true).label).toBe("Signal veraltet");
  });
  it("signals repeated errors and uncertain source metrics", () => {
    expect(growthAdminStatus(clean, { ...runtime, consecutiveFailures: 2 }, true).label).toBe("Lauffehler");
    expect(growthAdminStatus({ ...clean, status: "review", warnings: ["reconcile"] },
      runtime, true).label).toBe("Daten pruefen");
  });
  it("only reports analysis running, never guaranteed profit", () => {
    const status = growthAdminStatus(clean, runtime, true);
    expect(status.label).toBe("Analyse aktiv");
    expect(status.detail).toContain("Belege");
  });
  it("shows a stopped revenue growth cycle even when it technically returned HTTP 200", () => {
    expect(growthAdminStatus(clean, { ...runtime, lastOutcome: "blocked",
      lastReason: "approval-backpressure" }, true).label).toBe("Autopilot blockiert");
  });
  it("remembers the last paused run even if the environment is re-enabled", () => {
    expect(growthAdminStatus(clean, { ...runtime, lastOutcome: "paused" }, true).label).toBe("Letzter Lauf pausiert");
  });

});
