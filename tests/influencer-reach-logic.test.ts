import { describe, expect, it } from "vitest";

import {
  INFLUENCER_PERSONAS,
  type InfluencerPersonaId,
} from "@/lib/influencer-persona-logic";
import {
  MAX_CAMPAIGN_DAYS,
  MAX_POSTS_PER_PERSONA_PER_DAY,
  planInfluencerCampaign,
  scoreCampaignFit,
  scorePersonaForProduct,
} from "@/lib/influencer-reach-logic";

describe("influencer reach engine (Sprint 364)", () => {
  it("bewertet jede Persona gegen ein Produkt deterministisch", () => {
    expect(scorePersonaForProduct("juno", "B2B-SaaS-Plattform fuer Start-ups")).toBeGreaterThan(0);
    expect(scorePersonaForProduct("rio", "B2B-SaaS-Plattform fuer Start-ups")).toBe(0);
    expect(scorePersonaForProduct("juno", "B2B-SaaS-Plattform fuer Start-ups")).toBe(
      scorePersonaForProduct("juno", "B2B-SaaS-Plattform fuer Start-ups")
    );
  });

  it("kombiniert Match, Plattform und Ziel im Kampagnen-Score", () => {
    const saasScore = scoreCampaignFit("juno", "linkedin", "CRM-Software fuer B2B-SaaS", "umsatz");
    const lowScore = scoreCampaignFit("rio", "linkedin", "CRM-Software fuer B2B-SaaS", "umsatz");
    expect(saasScore).toBeGreaterThan(lowScore);
    expect(saasScore).toBeLessThanOrEqual(100);
  });

  it("plant eine Kampagne mit Fokus-Persona, Slots und Guardrails", () => {
    const plan = planInfluencerCampaign("KI-Coaching-App fuer Mindset", "aufmerksamkeit", { days: 3 });
    expect(plan.focusPersona).toBe("mira");
    expect(plan.slots.length).toBeGreaterThan(0);
    expect(plan.slots.every((slot) => slot.day >= 1 && slot.day <= 3)).toBe(true);
    expect(plan.guardrails.join(" ")).toContain("Keine Einnahme");
    expect(plan.projectedReachIndex).toBeGreaterThan(0);
  });

  it("respektiert Tages-Limits und Deckel", () => {
    const plan = planInfluencerCampaign("Fitness-App", "wachstum", { days: MAX_CAMPAIGN_DAYS });
    const perPersonaDay = new Map<string, number>();
    for (const slot of plan.slots) {
      const key = `${slot.persona}:${slot.day}`;
      perPersonaDay.set(key, (perPersonaDay.get(key) ?? 0) + 1);
    }
    expect([...perPersonaDay.values()].every((count) => count <= MAX_POSTS_PER_PERSONA_PER_DAY)).toBe(true);
    expect(plan.supportingPersonas.length).toBeLessThanOrEqual(3);
  });

  it("lehnt ungueltige Produkte ehrlich ab", () => {
    expect(() => planInfluencerCampaign("  a  ", "umsatz")).toThrow();
    expect(() => planInfluencerCampaign("x".repeat(501), "umsatz")).toThrow();
  });

  it("kennt Plattform-Faktoren fuer alle 10 Personas", () => {
    for (const persona of INFLUENCER_PERSONAS) {
      const id = persona.id as InfluencerPersonaId;
      expect(scoreCampaignFit(id, "instagram", "Produkt", "aufmerksamkeit")).toBeGreaterThanOrEqual(0);
    }
  });
});
