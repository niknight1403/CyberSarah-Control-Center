import { describe, expect, it } from "vitest";
import { aggregatePillarStatus, getPillar, PILLARS, routePillarTask, selfTestPillarRegistry } from "../core/router/pillar-router-logic";
import { assessFleetHealth, type InferenceProbe } from "../lib/ollama-fleet-logic";

const probe = (over: Partial<InferenceProbe>): InferenceProbe => ({ model: "qwen2.5:0.5b", latencyMs: 800, tokensPerSecond: 50, ok: true, ...over });
const greenFleet = assessFleetHealth([probe({}), probe({ model: "qwen2.5:1.5b" })]);
const redFleet = assessFleetHealth([probe({ ok: false })]);

describe("Kern-Router (Agenten-Rotator & Tool-Integrator)", () => {
  it("Registry enthaelt alle drei Geschaefstsaeulen", () => {
    expect(PILLARS.map((pillar) => pillar.id)).toEqual(["saas-factory", "content-engine", "outreach-agent"]);
    expect(getPillar("outreach-agent").module).toBe("modules/outreach-agent");
  });

  it("Selbstpruefung (Green Rule) erkennt fehlende und Schatten-Saeulen", () => {
    expect(selfTestPillarRegistry().ok).toBe(true);
    expect(selfTestPillarRegistry(["saas-factory", "content-engine", "outreach-agent", "missing"]).ok).toBe(false);
  });

  it("routet Saeulen-Aufgaben auf Fleet-Modell bei gruenem Fleet", () => {
    const decision = routePillarTask("saas-factory", greenFleet, 1_200, ["qwen2.5:0.5b", "qwen2.5:3b", "qwen2.5:7b"]);
    expect(decision.primaryRoute).toBe("ollama");
    expect(decision.model).toBe("qwen2.5:3b");
    expect(decision.rationale).toContain("reasoning");
  });

  it("weicht bei rotem Fleet ehrlich auf die Cloud-Gratis-Kette aus", () => {
    const decision = routePillarTask("content-engine", redFleet, 200, []);
    expect(decision.primaryRoute).toBe("cloud");
    expect(decision.rationale).toContain("Cloud-Gratis-Kette");
  });

  it("aggregiert den Gesamtstatus aller Saeulen (gruen erst wenn alle gruen)", () => {
    expect(aggregatePillarStatus([{ id: "saas-factory", status: "green" }, { id: "content-engine", status: "green" }, { id: "outreach-agent", status: "green" }])).toBe("green");
    expect(aggregatePillarStatus([{ id: "saas-factory", status: "green" }, { id: "content-engine", status: "yellow" }, { id: "outreach-agent", status: "green" }])).toBe("yellow");
    expect(aggregatePillarStatus([{ id: "saas-factory", status: "red" }, { id: "content-engine", status: "green" }, { id: "outreach-agent", status: "green" }])).toBe("red");
    expect(aggregatePillarStatus([])).toBe("red");
  });
});
