import { describe, expect, it } from "vitest";
import { evaluateHealth } from "../lib/health-check-logic";

describe("health check logic", () => {
  it("reports healthy when all core checks pass", () => {
    expect(evaluateHealth({ storageUsedPercent: 69, apiReachable: true, providerConfigured: true }).state).toBe("healthy");
  });

  it("reports degraded when one non-API check fails", () => {
    const result = evaluateHealth({ storageUsedPercent: 92, apiReachable: true, providerConfigured: true });
    expect(result.state).toBe("degraded");
    expect(result.checks.storage).toBe(false);
  });

  it("reports unavailable when the API is unreachable", () => {
    expect(evaluateHealth({ storageUsedPercent: 30, apiReachable: false, providerConfigured: true }).state).toBe("unavailable");
  });

  it("does not leak endpoint or credential values", () => {
    const result = evaluateHealth({ storageUsedPercent: 30, apiReachable: true, providerConfigured: false });
    expect(JSON.stringify(result)).not.toMatch(/https?:|token|key/i);
  });
});
