/**
 * Sprint 364 — Reichweiten- & Revenue-Engine fuer die 10 KI-Influencer-
 * Personas (rein, deterministisch, keine Netzwerk- oder LLM-Calls).
 *
 * Datenfluss:
 *   Ein Produkt/ein Kampagnenziel wird gegen die Persona-Nischen und
 *   die Plattform-Effektivitaetsmatrix bewertet. Daraus entstehen eine
 *   priorisierte Persona-Auswahl und ein deterministischer Posting-Plan
 *   (Slots pro Tag, Kanalmix, Prognose-Heuristik).
 *
 * Ehrlichkeits-Grenzen:
 *   - Die Projektion ist eine transparente Heuristik aus Match-Score und
 *     Plattform-Faktoren — KEINE Garantie fuer Reichweite oder Umsatz.
 *   - Pro Persona maximal MAX_POSTS_PER_PERSONA_PER_DAY Slots; Einnahme-
 *     versprechen werden als Guardrail abgelehnt, nicht generiert.
 */

import {
  INFLUENCER_PERSONAS,
  type InfluencerPersonaId,
  type InfluencerPlatform,
} from "./influencer-persona-logic";

export type InfluencerGoal = "aufmerksamkeit" | "wachstum" | "umsatz";

export const MAX_POSTS_PER_PERSONA_PER_DAY = 3;
export const MAX_CAMPAIGN_DAYS = 30;
export const MAX_SUPPORTING_PERSONAS = 3;

/** Plattform-Faktor: 10 = sehr wirksam in der Nische, 1 = schwach. */
export const PLATFORM_EFFECTIVENESS: Record<InfluencerPersonaId, Record<InfluencerPlatform, number>> = {
  nova: { instagram: 8, tiktok: 7, linkedin: 9, x: 9, threads: 7 },
  mira: { instagram: 9, tiktok: 8, linkedin: 6, x: 5, threads: 8 },
  juno: { instagram: 6, tiktok: 5, linkedin: 10, x: 8, threads: 5 },
  lina: { instagram: 10, tiktok: 9, linkedin: 4, x: 4, threads: 7 },
  kaya: { instagram: 7, tiktok: 8, linkedin: 9, x: 8, threads: 5 },
  zara: { instagram: 9, tiktok: 10, linkedin: 5, x: 7, threads: 8 },
  orion: { instagram: 7, tiktok: 9, linkedin: 8, x: 9, threads: 6 },
  ava: { instagram: 10, tiktok: 9, linkedin: 4, x: 4, threads: 6 },
  rio: { instagram: 10, tiktok: 8, linkedin: 3, x: 4, threads: 7 },
  nala: { instagram: 9, tiktok: 9, linkedin: 5, x: 5, threads: 8 },
};

/** Zielgewichte je Kanalziel (Aufmerksamkeit vs. Umsatz). */
const GOAL_WEIGHTS: Record<InfluencerGoal, { conversion: number; audience: number }> = {
  aufmerksamkeit: { conversion: 0.2, audience: 0.8 },
  wachstum: { conversion: 0.5, audience: 0.5 },
  umsatz: { conversion: 0.8, audience: 0.2 },
};

/** Nischen-Schluesselwoerter fuer das Produkt-Matching (kleingeschrieben). */
const NICHE_KEYWORDS: Record<InfluencerPersonaId, string[]> = {
  nova: ["ki", "künstliche intelligenz", "ki-", "tech", "zukunft", "automation", "ki-tool", "ki-app"],
  mira: ["coaching", "mindset", "selbsthilfe", "psychologie", "gewohnheit", "motivation"],
  juno: ["saas", "b2b", "business", "start-up", "startup", "unternehmer", "crm", "software", "plattform"],
  lina: ["produktivität", "organisation", "alltag", "lifestyle", "planer", "routine"],
  kaya: ["finanz", "investier", "geld", "sparen", "etf", "budget", "wirtschaft"],
  zara: ["creator", "content", "publikum", "community", "monetarisier", "aufmerksamkeit", "social media"],
  orion: ["gadget", "hardware", "smartphone", "app", "tool", "review", "technik", "gerät", "iot"],
  ava: ["gesundheit", "fitness", "sport", "ernaehrung", "ernaehrung", "wellness", "workout", "schlaf"],
  rio: ["food", "rezept", "koch", "kulinarisch", "restaurant", "essen", "genuss", "café"],
  nala: ["reise", "travel", "nomade", "urlaub", "destination", "remote work", "auswandern", "abenteuer"],
};

/** Zielnischen mit besonderer Kauafkafft (Conversion-Vorsprung). */
const CONVERSION_NICHES: Partial<Record<InfluencerPersonaId, boolean>> = {
  juno: true,
  kaya: true,
  zara: true,
  orion: true,
};

/** Match-Score einer Persona fuer ein Produkt (0..100, deterministisch). */
export function scorePersonaForProduct(personaId: InfluencerPersonaId, product: string): number {
  const haystack = product.toLowerCase();
  const keywords = NICHE_KEYWORDS[personaId] ?? [];
  let hits = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) hits += 1;
  }
  const persona = INFLUENCER_PERSONAS.find((entry) => entry.id === personaId);
  if (!persona) return 0;
  const base = hits * 25;
  const nicheBonus = haystack.includes(persona.niche.toLowerCase().split(" ")[0]) ? 15 : 0;
  return Math.min(100, base + nicheBonus);
}

/** Kombiniertern Kampagnen-Score: Match x Plattform x Zielgewicht (0..100). */
export function scoreCampaignFit(
  personaId: InfluencerPersonaId,
  platform: InfluencerPlatform,
  product: string,
  goal: InfluencerGoal
): number {
  const match = scorePersonaForProduct(personaId, product);
  const effectiveness = PLATFORM_EFFECTIVENESS[personaId][platform];
  const weights = GOAL_WEIGHTS[goal];
  const conversionBonus = CONVERSION_NICHES[personaId] ? weights.conversion : 0;
  const audiencePull = (effectiveness / 10) * weights.audience * 100;
  return Math.round(match * 0.5 + (audiencePull * 0.3 + match * weights.conversion * 0.2 + conversionBonus * 10) / 2.5);
}

export type CampaignSlot = {
  day: number;
  persona: InfluencerPersonaId;
  platform: InfluencerPlatform;
  score: number;
};

export type CampaignPlan = {
  product: string;
  goal: InfluencerGoal;
  focusPersona: InfluencerPersonaId;
  supportingPersonas: InfluencerPersonaId[];
  platformMix: InfluencerPlatform[];
  slots: CampaignSlot[];
  projectedReachIndex: number;
  guardrails: string[];
};

/**
 * Plant eine deterministische Kampagne: beste Fokus-Persona, bis zu drei
 * unterstuetzende Personas, Kanalmix und Posting-Slots fuer `days` Tage.
 */
export type PersonaPerformance = {
  livePosts: number;
  failedPosts: number;
  reach: number;
  impressions: number;
};

/**
 * Sprint 368 (Conversion-Loop): Aggregiert Publishing-Ergebnisse je Persona —
 * reine Logik, Sandbox-Jobs liefern bewusst kein Signal (keine echten Daten).
 */
export function computePersonaPerformance(
  jobs: Array<{ persona: string; status: string; mode: string | null; insights: Record<string, number> }>
): Record<string, PersonaPerformance> {
  const result: Record<string, PersonaPerformance> = {};
  for (const job of jobs) {
    const entry = (result[job.persona] ??= { livePosts: 0, failedPosts: 0, reach: 0, impressions: 0 });
    if (job.status === "veroeffentlicht" && job.mode === "live") {
      entry.livePosts += 1;
      entry.reach += Number(job.insights?.reach ?? 0);
      entry.impressions += Number(job.insights?.impressions ?? 0);
    } else if (job.status === "fehlgeschlagen" || job.status === "abgebrochen") {
      entry.failedPosts += 1;
    }
  }
  return result;
}

/**
 * Sprint 368: Performance-Bonus aus nachgewiesener Reichweite (gekoppelt,
 * ehrlich bleibt die Heuristik): bis +15 Punkte fuer Reichweite pro Live-Post,
 * bis -10 Punkte fuer eine hohe Fehlerquote. Ohne Live-Daten: 0 (kein Nachteil
 * fuer neue Personas).
 */
export function performanceBonus(perf?: PersonaPerformance): number {
  if (!perf || perf.livePosts === 0) return 0;
  const avgReach = perf.reach / perf.livePosts;
  const failureRate = perf.failedPosts / Math.max(perf.failedPosts + perf.livePosts, 1);
  const reachBonus = Math.min(Math.round(avgReach / 400), 15);
  const failurePenalty = Math.min(Math.round(failureRate * 20), 10);
  return reachBonus - failurePenalty;
}

export function planInfluencerCampaign(
  product: string,
  goal: InfluencerGoal,
  options: { days?: number; personasPerDay?: number; performance?: Record<string, PersonaPerformance> } = {}
): CampaignPlan {
  const trimmed = product.trim();
  if (trimmed.length < 3) throw new Error("Das Produkt muss mindestens 3 Zeichen enthalten.");
  if (trimmed.length > 500) throw new Error("Das Produkt darf hoechstens 500 Zeichen enthalten.");
  const days = Math.min(Math.max(options.days ?? 7, 1), MAX_CAMPAIGN_DAYS);
  const personasPerDay = Math.min(Math.max(options.personasPerDay ?? 2, 1), MAX_SUPPORTING_PERSONAS + 1);

  const ranked = INFLUENCER_PERSONAS.map((persona) => {
    let best: { platform: InfluencerPlatform; score: number } = { platform: "instagram", score: -1 };
    for (const platform of Object.keys(PLATFORM_EFFECTIVENESS[persona.id]) as InfluencerPlatform[]) {
      const score = scoreCampaignFit(persona.id, platform, trimmed, goal);
      if (score > best.score) best = { platform, score };
    }
    // Sprint 368: nachgewiesene Reichweite hebt bewaehrte Personas im Ranking
    // (Conversion-Loop aus den gespeicherten Insights der letzten Kampagnen).
    const bonus = performanceBonus(options.performance?.[persona.id]);
    return { persona: persona.id, ...best, score: best.score + bonus, match: scorePersonaForProduct(persona.id, trimmed) };
  }).sort((a, b) => b.score - a.score || a.persona.localeCompare(b.persona));

  const focusPersona = ranked[0].persona;
  const cast = ranked.slice(0, personasPerDay).map((entry) => entry.persona);
  const supportingPersonas = cast.filter((id) => id !== focusPersona);
  const platformMix = ranked.slice(0, personasPerDay).map((entry) => entry.platform);

  const slots: CampaignSlot[] = [];
  const perPersonaCounter = new Map<InfluencerPersonaId, number>();
  for (let day = 1; day <= days; day += 1) {
    for (const entry of ranked.slice(0, personasPerDay)) {
      const used = perPersonaCounter.get(entry.persona) ?? 0;
      if (used >= MAX_POSTS_PER_PERSONA_PER_DAY) continue;
      perPersonaCounter.set(entry.persona, used + 1);
      slots.push({ day, persona: entry.persona, platform: entry.platform, score: entry.score });
    }
  }
  slots.sort((a, b) => a.day - b.day || b.score - a.score);

  const projectedReachIndex = Math.round(
    (slots.reduce((sum, slot) => sum + slot.score, 0) / Math.max(slots.length, 1)) * (days / 7)
  );

  return {
    product: trimmed,
    goal,
    focusPersona,
    supportingPersonas,
    platformMix,
    slots,
    projectedReachIndex,
    guardrails: [
      `Maximal ${MAX_POSTS_PER_PERSONA_PER_DAY} Posts pro Persona und Tag.`,
      "Keine Einnahme- oder Renditeversprechen; KI-Transparenz bleibt Pflicht.",
      "ProjectedReachIndex ist eine Heuristik (0..100+) — keine Garantie.",
      "Performance-Bonus (max. +15) nur mit nachgewiesenen Live-Insights — Sandbox zaehlt nicht.",
    ],
  };
}
