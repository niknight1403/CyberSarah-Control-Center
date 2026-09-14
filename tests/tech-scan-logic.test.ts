import { describe, expect, it } from "vitest";

import {
  formatTechScanReport,
  MIN_REPORT_RELEVANCE,
  MAX_FINDINGS_PER_AREA,
  scoreTechFinding,
  selectReportFindings,
  type TechFinding,
} from "../lib/tech-scan-logic";

function finding(overrides: Partial<TechFinding> = {}): TechFinding {
  return {
    source: "github",
    title: "mcp-server-template",
    url: "https://example.com/mcp-server-template",
    description: "Model Context Protocol Server-Vorlage fuer Agenten-Werkzeuge",
    stars: 1200,
    ...overrides,
  };
}

describe("tech-scan-logic (Sprint 95)", () => {
  it("gewichtet Stack-Signale: MCP/Expo schlagen allgemeine Treffer", () => {
    const mcp = scoreTechFinding(finding({ description: "Ein MCP Server mit tool calling", stars: 0 }));
    const generic = scoreTechFinding(finding({ title: "kitchen-sink", description: "Alles moegliche, nichts Relevantes", stars: 0 }));
    expect(mcp.relevance).toBeGreaterThanOrEqual(5);
    expect(mcp.areas).toContain("Agenten-Kern");
    expect(generic.relevance).toBe(0);
  });

  it("kappelt den Sterne-Bonus bei zwei Punkten", () => {
    const fewStars = scoreTechFinding(finding({ stars: 900, description: "" }));
    const manyStars = scoreTechFinding(finding({ stars: 50_000, description: "" }));
    expect(fewStars.relevance - scoreTechFinding(finding({ stars: 0, description: "" })).relevance).toBe(0);
    expect(manyStars.relevance - fewStars.relevance).toBe(2);
  });

  it("filtert nach Mindest-Relevanz und begrenzt je Bereich", () => {
    const pool: TechFinding[] = [
      ...Array.from({ length: 8 }, (_, index) => finding({ title: `mcp-server-${index}`, description: "Model Context Protocol agent tools", stars: 10 * index })),
      finding({ title: "expo-upgrade-helper", source: "npm", version: "3.2.0", description: "expo Expo Upgrade Assistenz", stars: undefined }),
      finding({ title: "irrelevant", description: "Ein Rezept fuer Linsen", stars: 9_000 }),
    ];
    const selected = selectReportFindings(pool);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.length).toBeLessThanOrEqual(MAX_FINDINGS_PER_AREA + 2);
    expect(selected.some((entry) => entry.title === "irrelevant")).toBe(false);
    expect(selected[0].relevance).toBeGreaterThanOrEqual(selected[selected.length - 1].relevance);
    const agentenKern = selected.filter((entry) => entry.areas.includes("Agenten-Kern"));
    expect(agentenKern.length).toBeLessThanOrEqual(MAX_FINDINGS_PER_AREA);
  });

  it("sortiert absteigend nach Relevanz und formatiert den Report", () => {
    const pool = [
      finding({ title: "z-mcp", description: "MCP agent", stars: 0 }),
      finding({ title: "a-mcp", description: "MCP agent", stars: 3000 }),
    ];
    const report = formatTechScanReport(selectReportFindings(pool), "2026-09-14");
    expect(report).toContain("# 📡 Tech-Scan 2026-09-14");
    expect(report).toContain("[a-mcp]");
    expect(report).toContain("Relevanz");
    expect(report).toContain("(3,000★");
    expect(report.indexOf("a-mcp")).toBeLessThan(report.indexOf("z-mcp"));
  });

  it("meldet klar, wenn nichts Relevantes gefunden wurde", () => {
    expect(formatTechScanReport([], "2026-09-14")).toContain("Keine relevanten Neuerungen");
    expect(selectReportFindings([finding({ title: "x", description: "nichts", stars: 0 })])).toEqual([]);
    expect(MIN_REPORT_RELEVANCE).toBeGreaterThan(0);
  });
});
