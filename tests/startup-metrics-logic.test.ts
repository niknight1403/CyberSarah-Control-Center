/**
 * Sprint 300 — Tests fuer Startzeit-Messung.
 */
import { describe, it, expect } from "vitest";
import {
  summarizeStartup,
  formatStartupLine,
  STARTUP_BUDGET_MS,
} from "@/lib/startup-metrics-logic";

describe("Sprint 300 — Startup Metrics Logic", () => {
  it("summiert gueltige Phasen und klassifiziert 'fast'", () => {
    const s = summarizeStartup([
      { name: "bundle", durationMs: 400 },
      { name: "trpc", durationMs: 300 },
    ]);
    expect(s.totalMs).toBe(700);
    expect(s.classification).toBe("fast");
    expect(s.withinBudget).toBe(true);
  });

  it("kennt 'slow' jenseits des Budgets und meldet breaches", () => {
    const s = summarizeStartup([
      { name: "bundle", durationMs: 500 },
      { name: "boot", durationMs: STARTUP_BUDGET_MS },
    ]);
    expect(s.classification).toBe("slow");
    expect(s.withinBudget).toBe(false);
    expect(s.breaches.some((b) => b.name === "boot")).toBe(true);
  });

  it("markiert fehlende Messwerte als 'unbekannt' (kein beschoenigtes Urteil)", () => {
    const s = summarizeStartup([]);
    expect(s.classification).toBe("unbekannt");
    expect(s.withinBudget).toBe(false);
  });

  it("ignoriert ungueltige Phasen (<= 0 ms)", () => {
    const s = summarizeStartup([
      { name: "a", durationMs: 100 },
      { name: "b", durationMs: -5 },
      { name: "c", durationMs: 0 },
    ]);
    expect(s.totalMs).toBe(100);
  });

  it("findet die langsamste Phase", () => {
    const s = summarizeStartup([
      { name: "a", durationMs: 100 },
      { name: "b", durationMs: 900 },
    ]);
    expect(s.slowestPhase?.name).toBe("b");
  });

  it("formatiert einen ehrlichen Log-Einzeiler", () => {
    const s = summarizeStartup([{ name: "bundle", durationMs: 2200 }]);
    expect(formatStartupLine(s)).toContain("2200ms");
    expect(formatStartupLine(summarizeStartup([]))).toContain("unbekannt");
  });
});
