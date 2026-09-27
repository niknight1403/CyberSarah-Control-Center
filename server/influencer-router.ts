import { z } from "zod";

import {
  INFLUENCER_PERSONAS,
  buildInfluencerPrompt,
  getInfluencerPersona,
  validateInfluencerInput,
  type InfluencerPersonaId,
  type InfluencerPlatform,
} from "../lib/influencer-persona-logic";
import { buildCampaignPlan } from "../lib/influencer-engine/campaign-orchestrator";
import { analyzeContentMetrics } from "../lib/influencer-engine/analytics-feedback";
import { invokeLLM } from "./_core/llm";
import { protectedProcedure, router } from "./_core/trpc";

const personaIdSchema = z.enum(["nova", "mira", "juno", "lina", "kaya", "zara"]);
const platformSchema = z.enum(["instagram", "tiktok", "linkedin", "x", "threads"]);
const shortPlatformSchema = z.enum(["instagram", "tiktok", "facebook"]);

const trendSchema = z.object({
  topic: z.string().trim().min(3).max(200),
  velocity: z.number(),
  engagement: z.number(),
  saturation: z.number(),
  euRelevance: z.number(),
});

const affiliateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(120),
  commissionPercent: z.number().min(0).max(100),
  evidenceFit: z.number().min(0).max(100),
  audienceFit: z.number().min(0).max(100),
});

export const influencerRouter = router({
  personas: protectedProcedure.query(() => INFLUENCER_PERSONAS),

  generate: protectedProcedure
    .input(z.object({ personaId: personaIdSchema, topic: z.string().trim().min(3).max(500), platform: platformSchema }))
    .mutation(async ({ input }) => {
      const persona = getInfluencerPersona(input.personaId as InfluencerPersonaId);
      if (!persona) throw new Error("Unbekannte Influencer-Persona.");
      const topic = validateInfluencerInput(input.topic);
      const result = await invokeLLM({
        model: "gpt-4o-mini",
        maxTokens: 600,
        messages: [
          { role: "system", content: buildInfluencerPrompt(persona, topic, input.platform as InfluencerPlatform) },
          { role: "user", content: topic },
        ],
      });
      const content = result.choices[0]?.message?.content;
      const text = typeof content === "string" ? content.trim() : "";
      if (!text) throw new Error("Die KI hat keinen Content zurückgegeben.");
      return {
        id: `${persona.id}-${Date.now()}`,
        persona,
        topic,
        platform: input.platform,
        content: text,
        status: "entwurf" as const,
        generatedAt: new Date().toISOString(),
      };
    }),

  campaignPlan: protectedProcedure
    .input(z.object({
      personaId: personaIdSchema,
      topic: z.string().trim().min(3).max(500),
      audience: z.string().trim().min(3).max(300),
      platforms: z.array(shortPlatformSchema).min(1).max(3),
      trends: z.array(trendSchema).max(20).default([]),
      affiliateOffers: z.array(affiliateSchema).max(20).default([]),
    }))
    .mutation(({ input }) => {
      const persona = getInfluencerPersona(input.personaId as InfluencerPersonaId);
      if (!persona) throw new Error("Unbekannte Influencer-Persona.");
      return buildCampaignPlan({
        topic: input.topic,
        audience: input.audience,
        persona: {
          referenceId: `cybersarah-${persona.id}`,
          age: 45,
          presentation: persona.tonality,
          signatureLook: `${persona.niche}, konsistentes CyberSarah-Branding`,
        },
        platforms: input.platforms,
        trends: input.trends,
        affiliateOffers: input.affiliateOffers,
      });
    }),

  analyzeMetrics: protectedProcedure
    .input(z.object({
      views: z.number().min(0),
      averageWatchSeconds: z.number().min(0),
      durationSeconds: z.number().min(0),
      saves: z.number().min(0),
      shares: z.number().min(0),
      clicks: z.number().min(0),
    }))
    .mutation(({ input }) => analyzeContentMetrics(input)),
});
