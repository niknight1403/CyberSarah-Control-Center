import { describe, it, expect } from "vitest";
import {
  verifyRlsCoverage,
  buildRlsTestCaseNames,
  findMissingEntities,
} from "@/lib/rls-coverage-logic";

describe("Sprint 326 — RLS-Deckung", () => {
  it("sensible Entities ohne RLS sind Luecken", () => {
    const r = verifyRlsCoverage([
      { name: "Projects", rlsEnabled: true, hasSensitiveFields: true },
      { name: "Secrets", rlsEnabled: false, hasSensitiveFields: true },
      { name: "PublicDocs", rlsEnabled: false, hasSensitiveFields: false },
    ]);
    expect(r.verdict).toBe("luecken");
    expect(r.gaps[0].entity).toBe("Secrets");
    expect(r.report).toContain("vor Deployment beheben");
    expect(r.covered).toContain("Projects");
  });

  it("alles geschuetzt => vollstaendig", () => {
    const r = verifyRlsCoverage([{ name: "A", rlsEnabled: true, hasSensitiveFields: true }]);
    expect(r.verdict).toBe("vollstaendig");
    expect(r.gaps).toHaveLength(0);
  });

  it("Testfall-Namen je Zustand (kritische Markierung bei Fehlen)", () => {
    expect(buildRlsTestCaseNames({ name: "X", rlsEnabled: true, hasSensitiveFields: true })).toContain("rls:X:fremde-ausgeschlossen");
    expect(buildRlsTestCaseNames({ name: "Y", rlsEnabled: false, hasSensitiveFields: true })).toContain("rls:Y:FEHLT-rls-kritisch");
    expect(buildRlsTestCaseNames({ name: "Z", rlsEnabled: false, hasSensitiveFields: false })).toEqual(["rls:Z:keine-sensiblen-felder"]);
  });

  it("fehlende Pflicht-Entities im Katalog werden gefunden", () => {
    expect(findMissingEntities(["A", "B"], ["A", "C", "D"])).toEqual(["C", "D"]);
    expect(findMissingEntities(["A"], ["A"])).toEqual([]);
  });
});
