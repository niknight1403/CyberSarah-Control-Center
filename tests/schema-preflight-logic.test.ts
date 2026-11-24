import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-ignore Runtime deploy logic is intentionally plain ESM.
import {
  classifyRepairStatement,
  evaluatePreflight,
  isOwnershipError,
  planSchemaRepair,
  splitRepairStatements,
} from "../lib/schema-preflight-logic.mjs";

describe("schema-preflight-logic: splitRepairStatements", () => {
  it("zerlegt Anweisungen an den Drizzle-Markern", () => {
    const sql = "CREATE TABLE a (id int);\n--> statement-breakpoint\nCREATE INDEX i ON a (id);";
    expect(splitRepairStatements(sql)).toEqual([
      "CREATE TABLE a (id int);",
      "CREATE INDEX i ON a (id);",
    ]);
  });

  it("ignoriert leere Abschnitte und Nicht-Strings", () => {
    expect(splitRepairStatements("  --> statement-breakpoint  --> statement-breakpoint ")).toEqual([]);
    // @ts-expect-error absichtlich falscher Typ
    expect(splitRepairStatements(null)).toEqual([]);
    // @ts-expect-error absichtlich falscher Typ
    expect(splitRepairStatements(42)).toEqual([]);
  });
});

describe("schema-preflight-logic: classifyRepairStatement", () => {
  it("erkennt CREATE TABLE IF NOT EXISTS", () => {
    expect(classifyRepairStatement('CREATE TABLE IF NOT EXISTS "revenue_jobs" (id serial);')).toEqual({
      kind: "table",
      object: "revenue_jobs",
      table: null,
    });
  });

  it("erkennt Indizes (auch UNIQUE) samt Zieltabelle", () => {
    expect(
      classifyRepairStatement(
        'CREATE INDEX IF NOT EXISTS "revenue_jobs_status_idx" ON "revenue_jobs" USING btree ("status");',
      ),
    ).toEqual({ kind: "index", object: "revenue_jobs_status_idx", table: "revenue_jobs" });
    expect(
      classifyRepairStatement(
        'create unique index if not exists draftQueue_dedupe_idx on "draftQueue" (dedupeKey);',
      ),
    ).toEqual({ kind: "index", object: "draftQueue_dedupe_idx", table: "draftQueue" });
  });

  it("erkennt ALTER TABLE … ADD COLUMN IF NOT EXISTS", () => {
    expect(
      classifyRepairStatement('ALTER TABLE "draftQueue" ADD COLUMN IF NOT EXISTS "dedupeKey" varchar(220);'),
    ).toEqual({ kind: "column", object: "dedupeKey", table: "draftQueue" });
  });

  it("entfernt Schema-Qualifizierer und markiert Unbekanntes", () => {
    expect(classifyRepairStatement('CREATE TABLE IF NOT EXISTS "public"."x" (id int);')).toEqual({
      kind: "table",
      object: "x",
      table: null,
    });
    expect(classifyRepairStatement("SELECT 1;")).toEqual({ kind: "unknown", object: null, table: null });
    // @ts-expect-error absichtlich falscher Typ
    expect(classifyRepairStatement(undefined)).toEqual({ kind: "unknown", object: null, table: null });
  });
});

describe("schema-preflight-logic: planSchemaRepair", () => {
  const tableStatement = 'CREATE TABLE IF NOT EXISTS "revenue_jobs" (id serial);';
  const indexStatement = 'CREATE INDEX IF NOT EXISTS "revenue_jobs_status_idx" ON "revenue_jobs" ("status");';
  const columnStatement = 'ALTER TABLE "draftQueue" ADD COLUMN IF NOT EXISTS "dedupeKey" varchar(220);';

  it("ueberspringt bereits vorhandene Tabellen und Indizes", () => {
    const plan = planSchemaRepair({
      statements: [tableStatement, indexStatement],
      existingTables: ["revenue_jobs"],
      existingIndexes: ["revenue_jobs_status_idx"],
    });
    expect(plan.run).toEqual([]);
    expect(plan.skipped.map((entry) => entry.reason)).toEqual([
      "Tabelle existiert bereits",
      "Index existiert bereits",
    ]);
  });

  it("fuehrt nur fehlende Objekte aus", () => {
    const plan = planSchemaRepair({
      statements: [tableStatement, indexStatement],
      existingTables: ["revenue_jobs"],
      existingIndexes: [],
    });
    expect(plan.run).toEqual([indexStatement]);
    expect(plan.skipped).toHaveLength(1);
  });

  it("schiebt Indizes und Spalten ohne Tabelle auf", () => {
    const plan = planSchemaRepair({
      statements: [indexStatement, columnStatement],
      existingTables: [],
      existingIndexes: [],
    });
    expect(plan.run).toEqual([]);
    expect(plan.skipped.map((entry) => entry.reason)).toEqual([
      "Tabelle revenue_jobs fehlt (aufgeschoben)",
      "Tabelle draftQueue fehlt (aufgeschoben)",
    ]);
  });

  it("prueft Spalten nur bei vorhandener Tabelle", () => {
    const existing = planSchemaRepair({
      statements: [columnStatement],
      existingTables: new Set(["draftQueue"]),
      existingColumns: { draftQueue: ["dedupeKey"] },
    });
    expect(existing.run).toEqual([]);
    expect(existing.skipped[0].reason).toBe("Spalte existiert bereits");

    const missing = planSchemaRepair({
      statements: [columnStatement],
      existingTables: new Set(["draftQueue"]),
      existingColumns: { draftQueue: ["id"] },
    });
    expect(missing.run).toEqual([columnStatement]);
  });

  it("fuehrt unbekannte Anweisungen im Zweifel aus und toleriert leere Eingaben", () => {
    expect(planSchemaRepair({ statements: ["SELECT 1;"] }).run).toEqual(["SELECT 1;"]);
    expect(planSchemaRepair({ statements: [] })).toEqual({ run: [], skipped: [] });
    // @ts-expect-error absichtlich falscher Typ
    expect(planSchemaRepair({ statements: null })).toEqual({ run: [], skipped: [] });
  });
});

describe("schema-preflight-logic: isOwnershipError", () => {
  it("erkennt 42501 direkt und im cause", () => {
    expect(isOwnershipError(Object.assign(new Error("boom"), { code: "42501" }))).toBe(true);
    expect(
      isOwnershipError(Object.assign(new Error("boom"), { cause: { code: "42501", message: "x" } })),
    ).toBe(true);
  });

  it("erkennt die echte PostgreSQL-Meldung", () => {
    expect(isOwnershipError(new Error("must be owner of table revenue_jobs"))).toBe(true);
    expect(isOwnershipError(new Error("permission denied for table revenue_jobs"))).toBe(true);
  });

  it("ignoriert andere Fehler", () => {
    expect(isOwnershipError(Object.assign(new Error("boom"), { code: "42P01" }))).toBe(false);
    expect(isOwnershipError(new Error("connection refused"))).toBe(false);
    expect(isOwnershipError(null)).toBe(false);
    expect(isOwnershipError("must be owner of table x")).toBe(false);
  });
});

describe("schema-preflight-logic: evaluatePreflight", () => {
  const required = ["revenue_jobs", "revenue_offers"];

  it("ist gruen, wenn alle Pflicht-Tabellen vorhanden sind", () => {
    expect(
      evaluatePreflight({
        requiredTables: required,
        presentTables: ["revenue_jobs", "revenue_offers", "revenue_cost_events"],
        draftQueueExists: false,
        dedupeKeyPresent: false,
      }),
    ).toEqual({ ok: true, missing: [], reasons: [] });
  });

  it("meldet fehlende Pflicht-Tabellen", () => {
    const verdict = evaluatePreflight({
      requiredTables: required,
      presentTables: new Set(["revenue_jobs"]),
      draftQueueExists: false,
      dedupeKeyPresent: false,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.missing).toEqual(["revenue_offers"]);
    expect(verdict.reasons[0]).toContain("revenue_offers");
  });

  it("verlangt dedupeKey nur bei vorhandener draftQueue", () => {
    const verdict = evaluatePreflight({
      requiredTables: required,
      presentTables: required,
      draftQueueExists: true,
      dedupeKeyPresent: false,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("draftQueue.dedupeKey");
  });

  it("toleriert fehlende Pflicht-Angaben ohne Absturz", () => {
    // @ts-expect-error absichtlich unvollstaendig
    expect(evaluatePreflight({}).ok).toBe(true);
  });
});

describe("production-schema-preflight: Verdrahtung", () => {
  const preflight = readFileSync("scripts/production-schema-preflight.mjs", "utf8");

  it("nutzt den Planner statt blindem Replay der Repair-SQL", () => {
    expect(preflight).toContain("planSchemaRepair");
    expect(preflight).toContain("splitRepairStatements");
    expect(preflight).toContain("applyStatements");
  });

  it("bricht bei fehlenden Eigentuemer-Rechten nicht mehr ab", () => {
    expect(preflight).toContain("isOwnershipError(error)");
    expect(preflight).toContain("blocked.push");
    expect(preflight).not.toContain('await pool.query(growthRepair.replaceAll');
  });

  it("verifiziert weiterhin die kritischen Tabellen", () => {
    expect(preflight).toContain("evaluatePreflight");
    expect(preflight).toContain("process.exitCode = 1");
    expect(preflight).toContain("0019_repair_growth_schema.sql");
    expect(preflight).toContain("0020_draft_queue_dedupe.sql");
  });
});
