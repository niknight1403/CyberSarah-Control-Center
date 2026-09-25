import { describe, expect, it } from "vitest";

import { createIdeaItem, type IdeaItem } from "@/lib/idea-inbox-logic";
import {
  BRIDGE_MAX_BRIEFS_PER_CALL,
  BRIDGE_MAX_PER_CYCLE,
  buildCampaignTopic,
  inferCampaignGoal,
  planCampaignBridges,
} from "@/lib/campaign-bridge-logic";
import { INFLUENCER_PERSONAS } from "@/lib/influencer-persona-logic";
import { DRAFT_MAX_PENDING_PER_KIND } from "@/lib/draft-engine-logic";

function idea(overrides: Partial<IdeaItem> = {}): IdeaItem {
  const base = createIdeaItem({ title: "KI-App für Alltag", note: "", source: "test" });
  return { ...base, ...overrides };
}

describe("Sprint 373: Kampagnen-Brücke — Ziel-Inferenz", () => {
  it("leitet Umsatz-, Wachstums- und Aufmerksamkeits-Ziele ehrlich ab", () => {
    expect(inferCampaignGoal("Neues SaaS-Abo verkaufen")).toBe("umsatz");
    expect(inferCampaignGoal("Mehr Follower auf Instagram")).toBe("wachstum");
    expect(inferCampaignGoal("KI-Tool für den Alltag")).toBe("aufmerksamkeit");
  });

  it("trifft keine Erfindungen bei unklarem Text", () => {
    expect(inferCampaignGoal("")).toBe("aufmerksamkeit");
  });
});

describe("Sprint 373: Kampagnen-Brücke — Thema aus Idee", () => {
  it("baut Titel + Notiz zum Thema zusammen", () => {
    const result = buildCampaignTopic({ title: "KI-Koch-Assistent", note: "Rezepte automatisieren" });
    expect(result).toEqual({ topic: "KI-Koch-Assistent: Rezepte automatisieren" });
  });

  it("nutzt nur den Titel, wenn keine Notiz existiert", () => {
    const result = buildCampaignTopic({ title: "KI-Koch-Assistent", note: "   " });
    expect(result).toEqual({ topic: "KI-Koch-Assistent" });
  });

  it("lehnt zu kurze Themen ehrlich ab — kein Fake-Thema", () => {
    const result = buildCampaignTopic({ title: "ab", note: "" });
    expect("error" in result).toBe(true);
  });
});

describe("Sprint 373: Kampagnen-Brücke — Planung", () => {
  const noBridges = new Set<string>();

  it("plant die älteste offene Idee zuerst — nacheinander, nicht als Batch", () => {
    const older = idea({ id: "idea-old", capturedAt: 1_000 });
    const newer = idea({ id: "idea-new", capturedAt: 2_000, title: "Zweite Idee fürs Marketing" });
    const plan = planCampaignBridges({ ideas: [newer, older], bridgedIdeaIds: noBridges, pendingContentCount: 0 });
    expect(plan.briefs).toHaveLength(2);
    expect(plan.briefs[0]?.ideaId).toBe("idea-old");
    expect(plan.briefs[1]?.ideaId).toBe("idea-new");
  });

  it("begrenzt pro Zyklus auf BRIDGE_MAX_PER_CYCLE Briefs", () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      idea({ id: `idea-${index}`, capturedAt: index, title: `Idee ${index} fürs Marketing` }),
    );
    const plan = planCampaignBridges({ ideas: many, bridgedIdeaIds: noBridges, pendingContentCount: 0 });
    expect(plan.briefs).toHaveLength(BRIDGE_MAX_PER_CYCLE);
    expect(plan.remaining).toBe(4);
  });

  it("überspringt bereits verbrückte Ideen — kein Doppel-Brief", () => {
    const first = idea({ id: "idea-1", capturedAt: 1 });
    const second = idea({ id: "idea-2", capturedAt: 2, title: "Zweite Idee fürs Marketing" });
    const plan = planCampaignBridges({ ideas: [first, second], bridgedIdeaIds: new Set(["idea-1"]), pendingContentCount: 0 });
    expect(plan.briefs).toHaveLength(1);
    expect(plan.briefs[0]?.ideaId).toBe("idea-2");
  });

  it("ignoriert gefallene und gepflanzte Ideen — entschiedene Geschichte wird nicht vermarktet", () => {
    const dropped = idea({ id: "idea-drop", status: "dropped" });
    const planted = idea({ id: "idea-plant", status: "planted" });
    const kept = idea({ id: "idea-kept", status: "kept" });
    const plan = planCampaignBridges({ ideas: [dropped, planted, kept], bridgedIdeaIds: noBridges, pendingContentCount: 0 });
    expect(plan.briefs.map((brief) => brief.ideaId)).toEqual(["idea-kept"]);
  });

  it("respektiert das pending-Budget der Freigabe-Queue", () => {
    const many = Array.from({ length: 4 }, (_, index) =>
      idea({ id: `idea-${index}`, capturedAt: index, title: `Idee ${index} fürs Marketing` }),
    );
    const budget = 1;
    const plan = planCampaignBridges({
      ideas: many,
      bridgedIdeaIds: noBridges,
      pendingContentCount: DRAFT_MAX_PENDING_PER_KIND - budget,
    });
    expect(plan.briefs).toHaveLength(budget);
  });

  it("überspringt unbrauchbare Themen ehrlich mit Grund statt sie zu erfinden", () => {
    const broken = idea({ id: "idea-broken", title: "ab" });
    const plan = planCampaignBridges({ ideas: [broken], bridgedIdeaIds: noBridges, pendingContentCount: 0 });
    expect(plan.briefs).toHaveLength(0);
    expect(plan.skipped[0]?.ideaId).toBe("idea-broken");
    expect(plan.skipped[0]?.reason).toContain("3 Zeichen");
  });

  it("wählt eine echte Persona und Plattform — keine Platzhalter", () => {
    const plan = planCampaignBridges({
      ideas: [idea({ title: "SaaS-Plattform für kleine Teams" })],
      bridgedIdeaIds: noBridges,
      pendingContentCount: 0,
    });
    const brief = plan.briefs[0];
    expect(brief).toBeDefined();
    expect(INFLUENCER_PERSONAS.some((persona) => persona.id === brief?.personaId)).toBe(true);
    expect(["instagram", "tiktok", "linkedin", "x", "threads"]).toContain(brief?.platform);
    expect(brief?.draftTitle).toContain("Kampagne:");
  });

  it("liefert einen leeren ehrlichen Plan, wenn nichts offen ist", () => {
    const plan = planCampaignBridges({ ideas: [], bridgedIdeaIds: noBridges, pendingContentCount: 0 });
    expect(plan.briefs).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
    expect(plan.remaining).toBe(0);
  });

  it("erlaubt pro tRPC-Aufruf hoechstens BRIDGE_MAX_BRIEFS_PER_CALL Briefs", () => {
    expect(BRIDGE_MAX_BRIEFS_PER_CALL).toBeLessThanOrEqual(3);
  });
});
