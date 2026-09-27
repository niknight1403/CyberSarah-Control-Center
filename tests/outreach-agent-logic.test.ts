import { describe, expect, it } from "vitest";
import { buildOutreachSequence, buildOutreachScript, rankLeads, scoreLead, type Lead } from "../modules/outreach-agent/outreach-agent-logic";

const lead = (over: Partial<Lead>): Lead => ({ company: "Maler Mueller", industry: "Handwerk", employees: 12, channel: "email", painPoint: "Angebote brauchen immer 3 Stunden Handarbeit", ...over });

describe("Outreach-Agent", () => {
  it("scoreLead gewichtet Branche, Kanal und Pain Point", () => {
    const strong = scoreLead(lead({}));
    const weak = scoreLead(lead({ industry: "unklar", channel: "webform", employees: 50_000, painPoint: "" }));
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(["A", "B", "C"]).toContain(strong.tier);
  });

  it("rankLeads sortiert absteigend nach Score", () => {
    const ranked = rankLeads([lead({ industry: "unklar", painPoint: "" }), lead({})]);
    expect(ranked[0].lead.company).toBe("Maler Mueller");
  });

  it("Script: Betreff, Firmenname, Produkt, Hoeflichkeits-Ausstieg", () => {
    const script = buildOutreachScript(lead({}), "CyberSarah Autopilot");
    expect(script).toContain("Betreff:");
    expect(script).toContain("Maler Mueller");
    expect(script).toContain("CyberSarah Autopilot");
    expect(script).toContain("guten Fliess");
  });

  it("Sequenz Tag 0/3/7 mit erzwungener Regisseur-Freigabe", () => {
    const sequence = buildOutreachSequence(lead({}), "Tool");
    expect(sequence.steps.map((step) => step.day)).toEqual([0, 3, 7]);
    expect(sequence.approvalRequired).toBe(true);
    expect(sequence.steps[2].script).toContain("Letzter Kontakt");
  });
});
