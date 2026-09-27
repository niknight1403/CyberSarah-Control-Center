import { describe, expect, it } from "vitest";

import {
  MAXIMAL_AUTONOMY_PROFILE,
  PROJECT_KINDS,
  createProjectSuperagentBlueprint,
  normalizeProjectName,
} from "@/lib/project-superagent-factory-logic";
import { MAX_VILLA_WORKERS, validateVillaBlueprint } from "@/lib/bot-villa-logic";

describe("project superagent factory (Sprint 364)", () => {
  it("erstellt einen deterministischen Blueprint je Projekt", () => {
    const blueprint = createProjectSuperagentBlueprint({
      name: "Zahlungs-Flow",
      kind: "web-app",
      goal: "Checkout in 3 Tagen",
    });
    expect(blueprint.superagent.name).toBe("Projekt-Assistent Zahlungs-Flow");
    expect(blueprint.superagent.status).toBe("aktiv");
    expect(blueprint.superagent.color).toMatch(/^#[0-9A-F]{6}$/i);
    expect(blueprint.toolGrants).toContain("repo.searchCode");
    expect(validateVillaBlueprint(blueprint.villa)).toEqual([]);

    const same = createProjectSuperagentBlueprint({ name: "Zahlungs-Flow", kind: "web-app", goal: "Checkout in 3 Tagen" });
    expect(same).toEqual(blueprint);
  });

  it("begrenzt den Pool auf 5000 und bleibt ehrlich zur Live-Aktivitaet", () => {
    const blueprint = createProjectSuperagentBlueprint({
      name: "Mega-Villa",
      kind: "saas",
      goal: "Alles automatisieren",
      poolSize: 9999,
    });
    expect(blueprint.villa.coreTeam.length + blueprint.villa.pool.length).toBeLessThanOrEqual(MAX_VILLA_WORKERS);
    expect(blueprint.villa.liveWorkerCap).toBeLessThan(MAX_VILLA_WORKERS);
    expect(blueprint.superagent.purpose).toContain("max.");
  });

  it("verdrahtet maximale Autonomie mit HITL-Schienen fuer Geld und Sends", () => {
    const blueprint = createProjectSuperagentBlueprint({ name: "Growth-Engine", kind: "content", goal: "Reichweite aufbauen" });
    expect(blueprint.autonomy).toBe(MAXIMAL_AUTONOMY_PROFILE);
    expect(blueprint.autonomy.hitlRequired.join(" ")).toContain("Zahlungen");
    expect(blueprint.autonomy.hitlRequired.join(" ")).toContain("Externe Sends");
  });

  it("lehnt ungueltige Eingaben praediktabel ab", () => {
    expect(() => normalizeProjectName(" x ")).toThrow();
    expect(() =>
      createProjectSuperagentBlueprint({ name: "Test", kind: "keine-art" as never, goal: "Ziel" })
    ).toThrow(/Unbekannte Projektart/);
    expect(() => createProjectSuperagentBlueprint({ name: "Test", kind: "saas", goal: "  " })).toThrow();
  });

  it("kennt alle Projektarten", () => {
    expect(PROJECT_KINDS).toContain("saas");
    expect(PROJECT_KINDS).toHaveLength(6);
  });
});
