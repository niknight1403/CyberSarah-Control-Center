import { describe, it, expect, beforeEach } from "vitest";
import {
  deploymentStatusManager,
  formatDeploymentSummary,
  HealthCheckComponent,
} from "../lib/deployment-status-logic";

describe("Sprint 359 — Deployment-Status-Screen Logic", () => {
  beforeEach(() => {
    deploymentStatusManager.resetToDefault();
  });

  it("liefert Standard-Uebersicht für Production", () => {
    const overview = deploymentStatusManager.getDeploymentOverview("production");

    expect(overview.environment).toBe("production");
    expect(overview.activeDeployment).not.toBeNull();
    expect(overview.activeDeployment?.commitShortSha).toBe("9fe3a02");
    expect(overview.overallHealth).toBe("healthy");
    expect(overview.components.length).toBeGreaterThan(0);
  });

  it("registriert ein neues Deployment korrekt", () => {
    const newDep = deploymentStatusManager.recordDeployment({
      environment: "production",
      commitSha: "a1b2c3d4e5f6789012345678901234567890abcd",
      branch: "main",
      author: "Test Dev <dev@example.com>",
      message: "Sprint 359 Feature Release",
      timestamp: Date.now(),
      durationMs: 25000,
      status: "successful",
      healthStatus: "healthy",
      targetUrl: "https://control-center.cybersarah.internal",
      rollbackAvailable: true,
    });

    expect(newDep.id).toBeDefined();
    expect(newDep.commitShortSha).toBe("a1b2c3d");

    const overview = deploymentStatusManager.getDeploymentOverview("production");
    expect(overview.activeDeployment?.id).toBe(newDep.id);
    expect(overview.history.length).toBeGreaterThan(1);
  });

  it("berechnet den Gesamtzustand (overallHealth) basierend auf Komponenten", () => {
    const healthyComponents: HealthCheckComponent[] = [
      { name: "API", status: "healthy", latencyMs: 10 },
      { name: "DB", status: "healthy", latencyMs: 5 },
    ];
    expect(deploymentStatusManager.computeOverallHealth(healthyComponents)).toBe("healthy");

    const degradedComponents: HealthCheckComponent[] = [
      { name: "API", status: "healthy", latencyMs: 10 },
      { name: "Cache", status: "degraded", latencyMs: 300 },
    ];
    expect(deploymentStatusManager.computeOverallHealth(degradedComponents)).toBe("degraded");

    const unhealthyComponents: HealthCheckComponent[] = [
      { name: "API", status: "healthy", latencyMs: 10 },
      { name: "DB", status: "unhealthy", latencyMs: 0 },
    ];
    expect(deploymentStatusManager.computeOverallHealth(unhealthyComponents)).toBe("unhealthy");

    expect(deploymentStatusManager.computeOverallHealth([])).toBe("unknown");
  });

  it("aktualisiert den Health-Status einer Umgebung", () => {
    const newComponents: HealthCheckComponent[] = [
      { name: "API", status: "healthy", latencyMs: 15 },
      { name: "DB", status: "degraded", latencyMs: 250, details: "High replication delay" },
    ];

    const overall = deploymentStatusManager.updateEnvironmentHealth("production", newComponents);
    expect(overall).toBe("degraded");

    const overview = deploymentStatusManager.getDeploymentOverview("production");
    expect(overview.overallHealth).toBe("degraded");
    expect(overview.components).toEqual(newComponents);
  });

  it("fuehrt ein Rollback auf ein vorheriges erfolgreiches Deployment durch", () => {
    // Record second deployment
    const dep2 = deploymentStatusManager.recordDeployment({
      environment: "production",
      commitSha: "ffffffffffffffffffffffffffffffffffffffff",
      branch: "main",
      author: "Buggy Bot <bot@example.com>",
      message: "Broken feature",
      timestamp: Date.now(),
      durationMs: 12000,
      status: "successful",
      healthStatus: "unhealthy",
      targetUrl: "https://control-center.cybersarah.internal",
      rollbackAvailable: true,
    });

    const rollbackResult = deploymentStatusManager.triggerRollback(dep2.id, "High error rate detected");
    expect(rollbackResult.success).toBe(true);
    expect(rollbackResult.rollbackRecord).toBeDefined();
    expect(rollbackResult.rollbackRecord?.commitShortSha).toBe("9fe3a02");

    const updatedOverview = deploymentStatusManager.getDeploymentOverview("production");
    expect(updatedOverview.activeDeployment?.commitShortSha).toBe("9fe3a02");
  });

  it("formatiert die Zusammenfassung als verstaendlichen Text", () => {
    const overview = deploymentStatusManager.getDeploymentOverview("production");
    const summary = formatDeploymentSummary(overview);

    expect(summary).toContain("[Deployment Status - PRODUCTION]");
    expect(summary).toContain("Commit: 9fe3a02");
    expect(summary).toContain("Health: HEALTHY");
  });
});
