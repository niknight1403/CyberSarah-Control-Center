import { describe, it, expect } from "vitest";
import {
  buildManifest,
  escapeCsvCell,
  exportEntityAsCsv,
  buildExportPackage,
  describeExport,
} from "@/lib/export-center-logic";

describe("Sprint 337 — Export-Center", () => {
  it("Manifest zaehlt je Entitaet ehrlich, auch 0", () => {
    const m = buildManifest(
      [
        { name: "Projects", records: [{ id: 1 }, { id: 2 }] },
        { name: "Notes", records: [] },
      ],
      "json",
      0,
    );
    expect(m.entityCounts).toEqual({ Projects: 2, Notes: 0 });
    expect(m.totalRecords).toBe(2);
    expect(describeExport(m)).toContain("Notes: 0");
  });

  it("CSV-Escaping entschärft Formel-Injektion (=, +, -, @)", () => {
    expect(escapeCsvCell("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(escapeCsvCell("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsvCell("normal")).toBe("normal");
    expect(escapeCsvCell('mit "quote"; semikolon')).toBe('"mit ""quote""; semikolon"');
    expect(escapeCsvCell(null)).toBe("");
  });

  it("CSV je Entitaet: Header-Union, stabile Ordnung", () => {
    const csv = exportEntityAsCsv({ name: "T", records: [{ b: 2, a: "x" }, { a: "y", b: 3 }] });
    expect(csv.split("\n")[0]).toBe("a,b");
    expect(csv.split("\n")[1]).toBe("x,2");
  });

  it("Paket: JSON eine Datei, CSV je Entitaet eine Datei", () => {
    const json = buildExportPackage([{ name: "A", records: [{ x: 1 }] }, { name: "B", records: [] }], "json", 5);
    expect(json.files).toHaveLength(1);
    expect(json.files[0].filename).toBe("export.json");
    const csv = buildExportPackage([{ name: "A", records: [{ x: 1 }] }, { name: "B", records: [] }], "csv", 5);
    expect(csv.files.map((f) => f.filename)).toEqual(["A.csv", "B.csv"]);
  });
});
