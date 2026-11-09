import { describe, expect, it } from "vitest";
import {
  AUTO_RETRYABLE_CAUSES, planFailedJobRetries, retryDelayMs,
  SYSTEM_RETRY_ATTEMPT_CAP, summarizeRetryPlan, type RetryJobInput,
} from "../lib/publishing-retry-logic";

const job = (over: Partial<RetryJobInput> = {}): RetryJobInput => ({
  id: 1,
  platform: "x",
  status: "fehlgeschlagen",
  attempts: 0,
  lastError: "X-Refresh fehlgeschlagen (400): invalid_grant token expired",
  mode: null,
  ...over,
});

describe("Kontrollierte Wiederaufnahme: Auswahl", () => {
  it("wiederholt auth-Fehler, wenn ein Token bereitsteht", () => {
    const plan = planFailedJobRetries({ jobs: [job()], limit: 10, tokenReady: () => true });
    expect(plan.retries).toHaveLength(1);
    expect(plan.retries[0].cause).toBe("auth");
    expect(plan.retries[0].needsTokenRefresh).toBe(true);
  });

  it("wiederholt auth-Fehler nicht ohne verwendbares Token", () => {
    const plan = planFailedJobRetries({ jobs: [job()], limit: 10, tokenReady: () => false });
    expect(plan.retries).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("auth_ohne_verwendbares_token");
  });

  it("wiederholt inhaltliche Ablehnungen nicht", () => {
    const plan = planFailedJobRetries({
      jobs: [job({ lastError: "Policy violation: content rejected by provider" })], limit: 10, tokenReady: () => true,
    });
    expect(plan.retries).toHaveLength(0);
    expect(plan.skipped[0].reason).toContain("nicht_wiederholbar");
  });

  it("wiederholt niemals Jobs, die den Provider schon erreicht haben", () => {
    const plan = planFailedJobRetries({
      jobs: [job({ mode: "live", lastError: "network timeout" })], limit: 10, tokenReady: () => true,
    });
    expect(plan.retries).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("provider_bereits_erreicht");
  });

  it("respektiert das Versuchslimit", () => {
    const plan = planFailedJobRetries({
      jobs: [job({ attempts: SYSTEM_RETRY_ATTEMPT_CAP })], limit: 10, tokenReady: () => true,
    });
    expect(plan.retries).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("versuchslimit_erreicht");
  });

  it("ignoriert Jobs, die nicht mehr fehlgeschlagen sind", () => {
    const plan = planFailedJobRetries({
      jobs: [job({ status: "geplant" })], limit: 10, tokenReady: () => true,
    });
    expect(plan.retries).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("status_nicht_fehlgeschlagen");
  });

  it("begrenzt die Zahl je Lauf und markiert den Rest", () => {
    const jobs = Array.from({ length: 5 }, (_, index) => job({ id: index + 1, lastError: "network timeout" }));
    const plan = planFailedJobRetries({ jobs, limit: 2, tokenReady: () => true });
    expect(plan.retries).toHaveLength(2);
    expect(plan.skipped.filter((entry) => entry.reason === "lauf_limit_erreicht")).toHaveLength(3);
  });

  it("nimmt nur die drei wiederholbaren Ursachen", () => {
    expect(AUTO_RETRYABLE_CAUSES).toEqual(["auth", "rate_limit", "network"]);
  });

  it("wiederholt Netzwerkfehler auch ohne Tokenpruefung", () => {
    const plan = planFailedJobRetries({ jobs: [job({ lastError: "ECONNRESET network" })], limit: 10 });
    expect(plan.retries).toHaveLength(1);
    expect(plan.retries[0].needsTokenRefresh).toBe(false);
  });
});

describe("Kontrollierte Wiederaufnahme: Abstaende", () => {
  it("wartet bei Ratenlimit am laengsten", () => {
    expect(retryDelayMs("rate_limit")).toBeGreaterThan(retryDelayMs("network"));
    expect(retryDelayMs("network")).toBeGreaterThan(retryDelayMs("auth"));
    expect(retryDelayMs("policy_rejected")).toBe(0);
  });

  it("fasst den Lauf in einer Zeile zusammen", () => {
    const plan = planFailedJobRetries({ jobs: [job(), job({ id: 2, lastError: "policy violation" })], limit: 5, tokenReady: () => true });
    expect(summarizeRetryPlan(plan)).toBe("1 zur Wiederholung, 1 uebersprungen");
  });
});
