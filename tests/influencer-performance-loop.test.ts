import { describe, expect, it } from "vitest";
import {
  computePersonaPerformance,
  performanceBonus,
  planInfluencerCampaign,
  type PersonaPerformance,
} from "../lib/influencer-reach-logic";

describe("Sprint 368 — Conversion-Loop: Performance fliesst ins Ranking", () => {
  const job = (persona: string, status: string, mode: string | null, insights: Record<string, number> = {}) => ({
    persona, status, mode, insights,
  });

  it("aggregiert nur Live-Publishes und ehrliche Fehler — Sandbox liefert kein Signal", () => {
    const perf = computePersonaPerformance([
      job("nova", "veroeffentlicht", "live", { reach: 1000, impressions: 2000 }),
      job("nova", "veroeffentlicht", "live", { reach: 500, impressions: 900 }),
      job("nova", "sandbox_veroeffentlicht", "sandbox", { reach: 9999, impressions: 9999 }),
      job("mira", "fehlgeschlagen", "live"),
      job("mira", "abgebrochen", "live"),
    ]);
    expect(perf.nova).toEqual({ livePosts: 2, failedPosts: 0, reach: 1500, impressions: 2900 });
    expect(perf.mira).toEqual({ livePosts: 0, failedPosts: 2, reach: 0, impressions: 0 });
  });

  it("berechnet den Bonus gekappt und ehrlich", () => {
    expect(performanceBonus()).toBe(0);
    expect(performanceBonus({ livePosts: 0, failedPosts: 5, reach: 0, impressions: 0 })).toBe(0);
    // 2000 Reichweite / 5 Posts = 400 im Schnitt -> +1
    expect(performanceBonus({ livePosts: 5, failedPosts: 0, reach: 2000, impressions: 4000 })).toBe(1);
    // Riesige Reichweite bleibt bei +15 gekappt
    expect(performanceBonus({ livePosts: 2, failedPosts: 0, reach: 10_000_000, impressions: 20_000_000 })).toBe(15);
    // 50 % Fehlerquote: -10
    expect(performanceBonus({ livePosts: 1, failedPosts: 1, reach: 0, impressions: 0 })).toBe(-10);
  });

  it("hebt bewaehrte Personas ins Fokus-Ranking (deterministisch)", () => {
    const product = "AI-Produktivitaets-Tool";
    const ohne = planInfluencerCampaign(product, "wachstum");
    // Gezielte Boost-Persona nehmen, die ohne Daten nicht vorn liegt.
    // Runner-up boosten: die Luecke zum Fokus liegt im gekappten Bonusfenster.
    const other = ohne.supportingPersonas[0];
    expect(other).not.toBe(ohne.focusPersona);
    const boosted: PersonaPerformance = { livePosts: 20, failedPosts: 0, reach: 20 * 6000, impressions: 0 };
    const mit = planInfluencerCampaign(product, "wachstum", {
      performance: { [other]: boosted },
    });
    expect(mit.focusPersona).toBe(other);
    // Determinismus: gleiche Eingaben, gleiches Ergebnis
    expect(planInfluencerCampaign(product, "wachstum", { performance: { [other]: boosted } }).focusPersona).toBe(other);
  });

  it("veraendert das Ranking ohne Performance-Daten nicht (Abwaertskompatibilitaet)", () => {
    const product = "KI-Coaching-Programm";
    expect(planInfluencerCampaign(product, "umsatz").focusPersona).toBe(
      planInfluencerCampaign(product, "umsatz", { performance: {} }).focusPersona
    );
  });
});
