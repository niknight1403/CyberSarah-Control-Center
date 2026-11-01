import { describe, it, expect } from "vitest";
import {
  recordToolInvocation,
  analyzeToolUsage,
  generatePruningPlan,
  pruneUnusedTools,
  ToolDefinition,
  ToolUsageRecord,
} from "../lib/tool-usage-stats-logic";

describe("Sprint 366 — Werkzeug-Auswahlstatistik", () => {
  const tools: ToolDefinition[] = [
    { id: "bash", name: "Bash-Befehl", isCore: true, enabled: true, tokenCostEstimate: 200 },
    { id: "read_file", name: "Datei lesen", isCore: true, enabled: true, tokenCostEstimate: 150 },
    { id: "legacy_xml_parser", name: "Legacy XML Parser", isCore: false, enabled: true, tokenCostEstimate: 300 },
    { id: "deprecated_v1_api", name: "Alte API v1", isCore: false, enabled: true, tokenCostEstimate: 250 },
  ];

  it("erfasst Werkzeug-Aufrufe korrekt", () => {
    let records: ToolUsageRecord[] = [];
    records = recordToolInvocation(records, "bash", true, 120);
    records = recordToolInvocation(records, "bash", false, 80);

    expect(records.length).toBe(1);
    expect(records[0].invocationCount).toBe(2);
    expect(records[0].successCount).toBe(1);
    expect(records[0].failureCount).toBe(1);
    expect(records[0].totalExecutionTimeMs).toBe(200);
  });

  it("identifiziert ungenutzte Nicht-Kern-Werkzeuge als Deprecation-Kandidaten", () => {
    const records: ToolUsageRecord[] = [
      {
        toolId: "bash",
        invocationCount: 10,
        successCount: 10,
        failureCount: 0,
        lastUsedAt: new Date().toISOString(),
        totalExecutionTimeMs: 1000,
      },
    ];

    const stats = analyzeToolUsage(tools, records, 30);
    const legacyStats = stats.find((s) => s.toolId === "legacy_xml_parser");
    const bashStats = stats.find((s) => s.toolId === "bash");

    expect(legacyStats?.deprecationCandidate).toBe(true);
    expect(bashStats?.deprecationCandidate).toBe(false); // Core tool -> non-prunable
  });

  it("generiert einen präzisen Bereinigungsplan mit Token-Ersparnis", () => {
    const records: ToolUsageRecord[] = []; // Keine Aufrufe
    const plan = generatePruningPlan(tools, records, 30);

    expect(plan.prunableToolIds).toContain("legacy_xml_parser");
    expect(plan.prunableToolIds).toContain("deprecated_v1_api");
    expect(plan.prunableToolIds).not.toContain("bash"); // Core protected
    expect(plan.estimatedTokenSavings).toBe(550); // 300 + 250
  });

  it("deaktiviert ungenutzte Werkzeuge sicher und schützt Kern-Werkzeuge", () => {
    const records: ToolUsageRecord[] = [];
    const plan = generatePruningPlan(tools, records, 30);
    const { updatedTools, prunedCount } = pruneUnusedTools(tools, plan);

    expect(prunedCount).toBe(2);
    expect(updatedTools.find((t) => t.id === "bash")?.enabled).toBe(true);
    expect(updatedTools.find((t) => t.id === "legacy_xml_parser")?.enabled).toBe(false);
  });
});
