import { describe, expect, it } from "vitest";

import {
  CORE_TABLES,
  evaluateSchemaHealth,
  readinessSchemaBlock,
  startupVerdict,
} from "../lib/schema-health-logic";

const ALLE = CORE_TABLES.map((table) => table.name);

describe("evaluateSchemaHealth", () => {
  it("meldet vollstaendig, wenn alle Kerntabellen da sind", () => {
    const health = evaluateSchemaHealth(ALLE);
    expect(health.ok).toBe(true);
    expect(health.missing).toEqual([]);
    expect(health.summary).toContain("vollstaendig");
  });

  it("benennt jede fehlende Tabelle mit Wirkung und Migration", () => {
    const health = evaluateSchemaHealth(["users"]);
    expect(health.ok).toBe(false);
    expect(health.missing).toHaveLength(3);
    const namen = health.missing.map((entry) => entry.name);
    expect(namen).toContain("b2b_network_nodes");
    expect(namen).toContain("revenue_jobs");
    expect(namen).toContain("conversion_events");
    expect(health.missing[0].impact.length).toBeGreaterThan(10);
    expect(health.missing[0].migration).toMatch(/\.sql$/);
  });

  it("ist unabhaengig von Gross- und Kleinschreibung", () => {
    expect(evaluateSchemaHealth(ALLE.map((name) => name.toUpperCase())).ok).toBe(true);
  });

  it("nennt den naechsten Schritt nur bei Luecken", () => {
    expect(evaluateSchemaHealth(ALLE).summary).not.toContain("Migrationen ausfuehren");
    expect(evaluateSchemaHealth([]).summary).toContain("Migrationen ausfuehren");
  });
});

describe("startupVerdict", () => {
  it("ist still, wenn alles da ist", () => {
    const verdict = startupVerdict(evaluateSchemaHealth(ALLE), true);
    expect(verdict.level).toBe("ok");
  });

  it("warnt im Normalbetrieb, statt den Start zu verhindern", () => {
    const verdict = startupVerdict(evaluateSchemaHealth([]), false);
    expect(verdict.level).toBe("warn");
    expect(verdict.message).toContain("Migrationen");
  });

  it("bricht nur bei ausdruecklicher Strengpruefung ab", () => {
    const verdict = startupVerdict(evaluateSchemaHealth([]), true);
    expect(verdict.level).toBe("fatal");
    expect(verdict.message).toContain("STRICT_SCHEMA_CHECK");
  });
});

describe("readinessSchemaBlock", () => {
  it("gibt keine Zugangsdaten und keine Dateninhalte aus", () => {
    const block = readinessSchemaBlock(evaluateSchemaHealth(["users"]));
    expect(block.ok).toBe(false);
    expect(block.missing).toEqual(["b2b_network_nodes", "revenue_jobs", "conversion_events"]);
    expect(block.hint).toContain("db:audit");
    expect(JSON.stringify(block)).not.toContain("password");
  });

  it("hat keinen Hinweis, wenn das Schema steht", () => {
    expect(readinessSchemaBlock(evaluateSchemaHealth(ALLE)).hint).toBeNull();
  });
});
