import { describe, expect, it } from "vitest";
import {
  classifyToolError,
  evaluateRetryAttempt,
  formatToolErrorForAgent,
  DEFAULT_RETRY_POLICY,
} from "../lib/tool-error-classification-logic";

describe("Sprint 289 — Werkzeug-Fehlerklassen & Retry-Semantik", () => {
  it("klassifiziert Dateifehler (ENOENT) als fatal und not_found", () => {
    const err = { code: "ENOENT", message: "no such file or directory, open 'missing.ts'" };
    const res = classifyToolError("read_repo_file", err);

    expect(res.category).toBe("fatal");
    expect(res.kind).toBe("not_found");
    expect(res.isRetryable).toBe(false);
    expect(res.maxRetries).toBe(0);
  });

  it("klassifiziert Berechtigungsfehler (EACCES) als fatal", () => {
    const err = { code: "EACCES", message: "permission denied" };
    const res = classifyToolError("write_repo_file", err);

    expect(res.category).toBe("fatal");
    expect(res.kind).toBe("permission_denied");
    expect(res.isRetryable).toBe(false);
  });

  it("klassifiziert Timeout als wiederholbar (retryable)", () => {
    const err = { code: "ETIMEDOUT", message: "connect ETIMEDOUT 127.0.0.1:8080" };
    const res = classifyToolError("run_tests", err);

    expect(res.category).toBe("retryable");
    expect(res.kind).toBe("timeout");
    expect(res.isRetryable).toBe(true);
    expect(res.maxRetries).toBe(DEFAULT_RETRY_POLICY.maxRetries);
  });

  it("klassifiziert Rate Limits (429) als wiederholbar", () => {
    const err = "HTTP 429 Too Many Requests";
    const res = classifyToolError("open_pull_request", err);

    expect(res.category).toBe("retryable");
    expect(res.kind).toBe("rate_limit");
    expect(res.isRetryable).toBe(true);
  });

  it("berechnet Retry-Decisions und Backoff korrekt", () => {
    const classification = classifyToolError("run_tests", { code: "ETIMEDOUT", message: "timeout" });

    // 1. Versuch (1/3)
    const decision1 = evaluateRetryAttempt(classification, 0);
    expect(decision1.shouldRetry).toBe(true);
    expect(decision1.nextAttempt).toBe(1);
    expect(decision1.remainingRetries).toBe(3);
    expect(decision1.delayMs).toBe(500);

    // 2. Versuch (2/3)
    const decision2 = evaluateRetryAttempt(classification, 1);
    expect(decision2.shouldRetry).toBe(true);
    expect(decision2.delayMs).toBe(500);

    // 3. Versuch (3/3)
    const decision3 = evaluateRetryAttempt(classification, 2);
    expect(decision3.shouldRetry).toBe(true);
    expect(decision3.delayMs).toBe(1000); // 500 * 2^1

    // 4. Versuch (Limit erschöpft)
    const decision4 = evaluateRetryAttempt(classification, 3);
    expect(decision4.shouldRetry).toBe(false);
    expect(decision4.remainingRetries).toBe(0);
    expect(decision4.reason).toContain("erschöpft");
  });

  it("sperrt Retry bei fatalen Fehlern sofort", () => {
    const classification = classifyToolError("write_repo_file", { code: "EACCES", message: "denied" });
    const decision = evaluateRetryAttempt(classification, 0);

    expect(decision.shouldRetry).toBe(false);
    expect(decision.delayMs).toBe(0);
    expect(decision.reason).toContain("Keine Wiederholung erlaubt");
  });

  it("formatiert Fehlermeldungen transparent fuer den Agenten", () => {
    const classification = classifyToolError("run_tests", { code: "ETIMEDOUT", message: "timeout" });
    const decision = evaluateRetryAttempt(classification, 0);
    const formatted = formatToolErrorForAgent(classification, decision);

    expect(formatted).toContain("FEHLER [run_tests]");
    expect(formatted).toContain("RETRYABLE - timeout");
    expect(formatted).toContain("Retry-Status: Wiederholung erlaubt");
  });
});
