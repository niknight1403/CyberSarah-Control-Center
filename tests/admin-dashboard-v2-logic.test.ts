import { describe, it, expect } from "vitest";
import {
  evaluateSystemHealth,
  computeMetricTrends,
  formatDashboardViewModel,
  SystemMetrics,
} from "../lib/admin-dashboard-v2-logic";

describe("Sprint 354 - Admin-Dashboard v2 Logic", () => {
  it("evaluates a healthy system metrics payload correctly", () => {
    const metrics: SystemMetrics = {
      cpuUsagePct: 35.0,
      memoryUsedMb: 4096,
      memoryTotalMb: 16384,
      latencyP50Ms: 45,
      latencyP95Ms: 120,
      latencyP99Ms: 250,
      requestRatePerSec: 150,
      errorRatePct: 0.05,
      dbActiveConnections: 12,
      dbIdleConnections: 20,
      dbMaxConnections: 100,
      storageUsedGb: 40,
      storageTotalGb: 500,
      activeSessionsCount: 320,
      timestamp: Date.now(),
    };

    const evalResult = evaluateSystemHealth(metrics);

    expect(evalResult.status).toBe("healthy");
    expect(evalResult.overallScore).toBe(100);
    expect(evalResult.alerts.length).toBe(0);
    expect(evalResult.missingMetrics.length).toBe(0);
    expect(evalResult.subsystems.length).toBe(5);
  });

  it("evaluates degraded system metrics correctly when thresholds are exceeded", () => {
    const metrics: Partial<SystemMetrics> = {
      cpuUsagePct: 78.0, // warning threshold >= 75
      memoryUsedMb: 6000,
      memoryTotalMb: 8000, // 75%
      latencyP95Ms: 450, // warning threshold >= 400
      errorRatePct: 1.5, // warning threshold >= 1.0
      dbActiveConnections: 80,
      dbMaxConnections: 100, // 80% (warning threshold >= 75)
    };

    const evalResult = evaluateSystemHealth(metrics);

    expect(evalResult.status).toBe("degraded");
    expect(evalResult.overallScore).toBeLessThan(80);
    expect(evalResult.alerts.length).toBeGreaterThan(0);
  });

  it("evaluates critical system metrics correctly", () => {
    const metrics: Partial<SystemMetrics> = {
      cpuUsagePct: 95.0, // critical threshold >= 90
      memoryUsedMb: 7800,
      memoryTotalMb: 8000, // 97.5% critical
      latencyP95Ms: 1200, // critical threshold >= 1000
      errorRatePct: 6.2, // critical threshold >= 5.0
      dbActiveConnections: 95,
      dbMaxConnections: 100, // 95% critical
    };

    const evalResult = evaluateSystemHealth(metrics);

    expect(evalResult.status).toBe("critical");
    expect(evalResult.overallScore).toBeLessThan(50);
    expect(evalResult.alerts.some((a) => a.severity === "critical")).toBe(true);
  });

  it("handles empty or missing metrics honestly", () => {
    const evalResult = evaluateSystemHealth(null);

    expect(evalResult.status).toBe("unknown");
    expect(evalResult.overallScore).toBe(0);
    expect(evalResult.missingMetrics.length).toBeGreaterThan(0);
  });

  it("computes metric trends between previous and current metric readings", () => {
    const previous: Partial<SystemMetrics> = {
      cpuUsagePct: 40,
      memoryUsedMb: 4000,
      latencyP95Ms: 200,
      errorRatePct: 1.0,
      dbActiveConnections: 50,
    };

    const current: Partial<SystemMetrics> = {
      cpuUsagePct: 60, // degraded (+50%)
      memoryUsedMb: 3000, // improved (-25%)
      latencyP95Ms: 202, // stable
      errorRatePct: 0.2, // improved
      dbActiveConnections: 52, // stable (within 5%)
    };

    const trends = computeMetricTrends(current, previous);

    expect(trends.cpuTrend).toBe("degrading");
    expect(trends.memoryTrend).toBe("improving");
    expect(trends.latencyTrend).toBe("stable");
    expect(trends.errorRateTrend).toBe("improving");
  });

  it("formats the dashboard view model properly", () => {
    const metrics: Partial<SystemMetrics> = {
      cpuUsagePct: 30,
      memoryUsedMb: 2000,
      memoryTotalMb: 8000,
      latencyP95Ms: 100,
      errorRatePct: 0.1,
      dbActiveConnections: 10,
      dbMaxConnections: 100,
    };

    const evalResult = evaluateSystemHealth(metrics);
    const trends = computeMetricTrends(metrics, metrics);
    const vm = formatDashboardViewModel(evalResult, trends);

    expect(vm.score).toBe(100);
    expect(vm.statusBadge.variant).toBe("success");
    expect(vm.subsystemCards.length).toBe(5);
    expect(vm.summaryText).toContain("Gesund");
  });
});
