import { describe, expect, it } from "vitest";
import {
  SPECIALIST_AGENT_SEEDS,
  buildSpecialistAgentContext,
  missingSpecialistAgentSeeds,
} from "../lib/specialist-agents-logic";

describe("specialist agent profiles", () => {
  it("ships the requested autonomous specialist team without duplicate names", () => {
    expect(SPECIALIST_AGENT_SEEDS.map((agent) => agent.name)).toEqual([
      "Autopilot",
      "Security Agent",
      "Programming Agent",
      "Money Expert",
      "Multi Talent",
      "Ultra Orchestrator",
    ]);
    expect(new Set(SPECIALIST_AGENT_SEEDS.map((agent) => agent.name)).size).toBe(SPECIALIST_AGENT_SEEDS.length);
    expect(SPECIALIST_AGENT_SEEDS.every((agent) => agent.purpose.length <= 400)).toBe(true);
  });

  it("seeds only missing specialists case-insensitively", () => {
    const missing = missingSpecialistAgentSeeds(["Elara", "AUTOPILOT", "money expert"]);
    expect(missing.map((agent) => agent.name)).not.toContain("Autopilot");
    expect(missing.map((agent) => agent.name)).not.toContain("Money Expert");
    expect(missing.map((agent) => agent.name)).toContain("Ultra Orchestrator");
  });

  it("injects specialization while explicitly preserving permission boundaries", () => {
    const context = buildSpecialistAgentContext({
      name: "Programming Agent",
      purpose: "Implementiert und verifiziert Produktionscode.",
    });
    expect(context).toContain("Programming Agent");
    expect(context).toContain("Implementiert und verifiziert Produktionscode.");
    expect(context).toContain("erweitert aber niemals Tool-Rechte");
  });

  it("does not inject an empty profile", () => {
    expect(buildSpecialistAgentContext(null)).toBe("");
    expect(buildSpecialistAgentContext({ name: " ", purpose: " " })).toBe("");
  });
});
