export type HealthState = "healthy" | "degraded" | "unavailable";

export type HealthCheckInput = {
  storageUsedPercent: number;
  apiReachable: boolean;
  providerConfigured: boolean;
};

export type HealthCheckResult = {
  state: HealthState;
  summary: string;
  checks: { storage: boolean; api: boolean; provider: boolean };
};

export function evaluateHealth(input: HealthCheckInput): HealthCheckResult {
  const storage = Number.isFinite(input.storageUsedPercent) && input.storageUsedPercent < 90;
  const api = input.apiReachable;
  const provider = input.providerConfigured;
  const passed = [storage, api, provider].filter(Boolean).length;
  const state: HealthState = passed === 3 ? "healthy" : passed === 0 || !api ? "unavailable" : "degraded";
  return {
    state,
    summary: state === "healthy" ? "Alle Kernprüfungen sind erfolgreich." : state === "degraded" ? `${3 - passed} Kernprüfung${3 - passed === 1 ? "" : "en"} benötigt Aufmerksamkeit.` : "Der Workspace-Service ist nicht verfügbar.",
    checks: { storage, api, provider },
  };
}
