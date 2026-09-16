import { describe, expect, it } from "vitest";

import {
  defaultSeedProjects,
  isProjectStatus,
  normalizeProjectInput,
  normalizeProjectPatch,
  PROJECT_STATUS_LABELS,
  sortProjectsByActivity,
} from "@/lib/projects-logic";

describe("isProjectStatus", () => {
  it("erkennt gueltige und ungueltige Werte", () => {
    expect(isProjectStatus("live")).toBe(true);
    expect(isProjectStatus("unbekannt")).toBe(false);
  });
});

describe("normalizeProjectInput", () => {
  it("trimmt Felder und faellt auf 'in-arbeit' zurueck", () => {
    const result = normalizeProjectInput({ name: "  Mein Projekt  ", description: " Text " });
    expect(result).toEqual({ name: "Mein Projekt", description: "Text", repositoryUrl: "", status: "in-arbeit" });
  });

  it("wirft bei leerem Namen", () => {
    expect(() => normalizeProjectInput({ name: "   " })).toThrow(/Projektname/);
  });

  it("uebernimmt einen gueltigen Status", () => {
    expect(normalizeProjectInput({ name: "X", status: "live" }).status).toBe("live");
  });
});

describe("normalizeProjectPatch", () => {
  it("laesst nicht uebergebene Felder unangetastet", () => {
    expect(normalizeProjectPatch({})).toEqual({});
    expect(normalizeProjectPatch({ status: "pausiert" })).toEqual({ status: "pausiert" });
  });

  it("wirft bei leerem Namen im Patch", () => {
    expect(() => normalizeProjectPatch({ name: "   " })).toThrow(/Projektname/);
  });

  it("wirft bei ungueltigem Status", () => {
    expect(() => normalizeProjectPatch({ status: "erledigt" as never })).toThrow(/Status/);
  });
});

describe("defaultSeedProjects", () => {
  it("liefert die bekannten Vorhaben mit gueltigem Status", () => {
    const seeds = defaultSeedProjects();
    expect(seeds.length).toBeGreaterThanOrEqual(2);
    expect(seeds.every((seed) => isProjectStatus(seed.status))).toBe(true);
    expect(seeds.map((s) => s.name)).toContain("CyberSarah Control Center");
  });
});

describe("sortProjectsByActivity", () => {
  it("sortiert neueste Aktivitaet zuerst, Gleichstand nach Name", () => {
    const list = [
      { name: "B", lastActivityAt: "2026-01-01T00:00:00.000Z" },
      { name: "A", lastActivityAt: "2026-01-01T00:00:00.000Z" },
      { name: "C", lastActivityAt: "2026-06-01T00:00:00.000Z" },
    ];
    expect(sortProjectsByActivity(list).map((p) => p.name)).toEqual(["C", "A", "B"]);
  });
});

describe("PROJECT_STATUS_LABELS", () => {
  it("hat fuer jeden Status ein Label", () => {
    expect(PROJECT_STATUS_LABELS.idee).toBe("Idee");
    expect(PROJECT_STATUS_LABELS["in-arbeit"]).toBe("In Arbeit");
    expect(PROJECT_STATUS_LABELS.archiviert).toBe("Archiviert");
  });
});
