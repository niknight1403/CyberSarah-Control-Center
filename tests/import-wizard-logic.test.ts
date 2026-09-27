import { describe, it, expect } from "vitest";
import {
  validateRow,
  planImport,
  describeImportPlan,
  canWrite,
} from "@/lib/import-wizard-logic";

const schema = {
  name: { type: "string" as const, required: true },
  age: { type: "number" as const, required: false },
  active: { type: "boolean" as const, required: true },
};
const row = (lineNumber: number, data: Record<string, unknown>) => ({ lineNumber, data });

describe("Sprint 338 — Import-Wizard", () => {
  it("validiert Pflichtfelder und Typen je Zeile", () => {
    expect(validateRow(schema, row(1, { name: "Ada", active: true, age: 3 }))).toEqual([]);
    expect(validateRow(schema, row(1, { active: true })).map((i) => i.issue)).toContain("pflichtfeld fehlt");
    expect(validateRow(schema, row(1, { name: "A", active: "ja" })).map((i) => i.issue)).toContain("falscher typ");
    expect(validateRow(schema, row(1, { name: "  ", active: true })).map((i) => i.issue)).toContain("pflichtfeld fehlt");
  });

  it("plannt Import: valide rein, invalide raus — mit Zeilennummern", () => {
    const plan = planImport(schema, [
      row(1, { name: "Ada", active: true }),
      row(2, { name: "", active: true }),
      row(3, { name: "Bob", active: "nein" }),
    ]);
    expect(plan.accepted.map((a) => a.lineNumber)).toEqual([1]);
    expect(plan.rejected.map((r) => r.lineNumber)).toEqual([2, 3]);
    const text = describeImportPlan(plan);
    expect(text).toContain("1 Datens");
    expect(text).toContain("NICHT geschrieben");
    expect(text).toContain("Zeile 2: pflichtfeld fehlt");
  });

  it("Schreiben nur mit Bestaetigung UND akzeptierten Zeilen", () => {
    const empty = { accepted: [], rejected: [] };
    expect(canWrite(empty, true)).toBe(false);
    const plan = planImport(schema, [row(1, { name: "A", active: true })]);
    expect(canWrite(plan, false)).toBe(false);
    expect(canWrite(plan, true)).toBe(true);
  });
});
