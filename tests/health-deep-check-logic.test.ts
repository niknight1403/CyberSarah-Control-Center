import { describe, it, expect } from "vitest";
import {
  evaluateCheck,
  aggregateReadiness,
  readinessHttpStatus,
} from "@/lib/health-deep-check-logic";
import type { HealthCheckSpec, HealthCheckOutcome } from "@/lib/health-deep-check-logic";

const spec = (over: Partial<HealthCheckSpec> = {}): HealthCheckSpec => ({
  name: "db",
  kind: "db",
  timeoutMs: 1000,
  critical: true,
  ...over,
});
const outcome = (over: Partial<HealthCheckOutcome> = {}): HealthCheckOutcome => ({
  name: "db",
  ok: true,
  latencyMs: 50,
  detail: "",
  ...over,
});

describe("Sprint 332 — Health-Deep-Check", () => {
  it("Timeout ist ein eigener Zustand, kein Erfolg", () => {
    expect(evaluateCheck(spec(), outcome({ latencyMs: 1500 })).status).toBe("timeout");
    expect(evaluateCheck(spec(), outcome({ ok: null, latencyMs: null })).status).toBe("timeout");
    expect(evaluateCheck(spec(), outcome()).status).toBe("ok");
    expect(evaluateCheck(spec(), outcome({ ok: false, detail: "refused" })).status).toBe("fehler");
  });

  it("warnend-langsam wird als 'langsam' gemeldet", () => {
    expect(evaluateCheck(spec(), outcome({ latencyMs: 900 })).status).toBe("langsam");
  });

  it("kritischer Check entscheidet: nicht-bereit + HTTP 503, kein gelogenes 200", () => {
    const r = aggregateReadiness(
      [spec(), spec({ name: "cache", kind: "cache", critical: false })],
      [outcome(), outcome({ name: "cache", ok: false, detail: "down" })],
    );
    expect(r.state).toBe("degraded");
    expect(readinessHttpStatus("degraded")).toBe(200);

    const down = aggregateReadiness(
      [spec()],
      [outcome({ ok: false, detail: "no connection" })],
    );
    expect(down.state).toBe("nicht-bereit");
    expect(readinessHttpStatus("nicht-bereit")).toBe(503);
  });

  it("fehlendes Check-Ergebnis wird als Timeout gewertet, nicht als ok", () => {
    const r = aggregateReadiness([spec({ name: "db" })], []);
    expect(r.state).toBe("nicht-bereit");
    expect(r.perCheck.join(" ")).toContain("timeout");
  });

  it("alles gruen => bereit", () => {
    const r = aggregateReadiness(
      [spec(), spec({ name: "api", kind: "external-api", critical: true })],
      [outcome(), outcome({ name: "api" })],
    );
    expect(r.state).toBe("bereit");
  });
});
