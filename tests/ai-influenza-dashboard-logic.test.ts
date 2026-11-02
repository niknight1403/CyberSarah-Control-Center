import { describe, expect, it } from "vitest";
import {
  AI_INFLUENZA_DASHBOARD_VIEWS,
  buildAiInfluenzaHealthVerdict,
  formatEuroCents,
  formatPercent,
  readNumber,
  resolveAiInfluenzaDashboardView,
  stepAiInfluenzaDashboardView,
} from "../lib/ai-influenza-dashboard-logic";

describe("AI Influenza Dashboard-Ansichten", () => {
  it("definiert genau die zehn geforderten Ansichten mit eindeutigen IDs", () => {
    expect(AI_INFLUENZA_DASHBOARD_VIEWS).toHaveLength(10);
    const ids = AI_INFLUENZA_DASHBOARD_VIEWS.map((view) => view.id);
    expect(new Set(ids).size).toBe(10);
    expect(ids).toContain("health");
    expect(ids).toContain("profit");
  });

  it("faellt bei unbekannter ID auf das Revenue Dashboard zurueck", () => {
    expect(resolveAiInfluenzaDashboardView("gibt-es-nicht").id).toBe("revenue");
    expect(resolveAiInfluenzaDashboardView(null).id).toBe("revenue");
    expect(resolveAiInfluenzaDashboardView("profit").title).toBe("Profit Analytics");
  });

  it("blaettert zyklisch in beide Richtungen", () => {
    expect(stepAiInfluenzaDashboardView("revenue", -1).id).toBe("health");
    expect(stepAiInfluenzaDashboardView("health", 1).id).toBe("revenue");
    expect(stepAiInfluenzaDashboardView("revenue", 1).id).toBe("agents");
  });

  it("zeigt unbekannte Betraege als Strich statt als Null", () => {
    expect(formatEuroCents(null)).toBe("—");
    expect(formatEuroCents(undefined)).toBe("—");
    expect(formatEuroCents(Number.NaN)).toBe("—");
    expect(formatEuroCents(29900)).toContain("299");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(41.5)).toContain("41,5");
  });

  it("liest Zahlen nur aus echten Zahlenfeldern", () => {
    expect(readNumber({ openOrders: 3 }, "openOrders")).toBe(3);
    expect(readNumber({ openOrders: "3" }, "openOrders")).toBeNull();
    expect(readNumber(null, "openOrders")).toBeNull();
  });

  it("bewertet eine fehlende Datenbank als kritisch", () => {
    const verdict = buildAiInfluenzaHealthVerdict({ databaseAvailable: false, openOrders: null, waitingApprovals: null });
    expect(verdict.level).toBe("critical");
  });

  it("warnt bei offenen Freigaben und fehlgeschlagenen Aufgaben", () => {
    const waiting = buildAiInfluenzaHealthVerdict({ databaseAvailable: true, openOrders: 2, waitingApprovals: 1 });
    expect(waiting.level).toBe("warn");
    expect(waiting.notes.join(" ")).toContain("Freigabe");
    const failed = buildAiInfluenzaHealthVerdict({ databaseAvailable: true, openOrders: 0, waitingApprovals: 0, failedTasks: 2 });
    expect(failed.level).toBe("warn");
  });

  it("meldet Betriebsbereitschaft ohne Freigaben und Fehler", () => {
    const verdict = buildAiInfluenzaHealthVerdict({ databaseAvailable: true, openOrders: 0, waitingApprovals: 0 });
    expect(verdict.level).toBe("ok");
    expect(verdict.notes.length).toBeGreaterThan(0);
  });
});
