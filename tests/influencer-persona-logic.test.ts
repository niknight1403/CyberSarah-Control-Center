import { describe, expect, it } from "vitest";

import {
  INFLUENCER_PERSONAS,
  buildInfluencerPrompt,
  getInfluencerPersona,
  validateInfluencerInput,
} from "@/lib/influencer-persona-logic";

describe("influencer persona logic", () => {
  it("contains ten unique selectable personas (Sprint 364)", () => {
    expect(INFLUENCER_PERSONAS).toHaveLength(10);
    expect(new Set(INFLUENCER_PERSONAS.map((persona) => persona.id)).size).toBe(10);
    expect(INFLUENCER_PERSONAS.map((persona) => persona.name)).toEqual([
      "Nova", "Mira", "Juno", "Lina", "Kaya", "Zara", "Orion", "Ava", "Rio", "Nala",
    ]);
  });

  it("builds a persona-specific prompt for every persona", () => {
    for (const persona of INFLUENCER_PERSONAS) {
      const prompt = buildInfluencerPrompt(persona, "KI für kleine Teams", "linkedin");
      expect(prompt).toContain(`Du bist ${persona.name}`);
      expect(prompt).toContain(persona.niche);
      expect(prompt).toContain("KI für kleine Teams");
      expect(prompt).toContain("LinkedIn");
    }
  });

  it("validates topics and resolves personas", () => {
    expect(getInfluencerPersona("kaya")?.niche).toBe("Finance Education");
    expect(validateInfluencerInput("  Testthema  ")).toBe("Testthema");
    expect(() => validateInfluencerInput("x")).toThrow();
  });
});
