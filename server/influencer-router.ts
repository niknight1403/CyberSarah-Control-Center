import { z } from "zod";

import {
  INFLUENCER_PERSONAS,
  buildInfluencerPrompt,
  getInfluencerPersona,
  validateInfluencerInput,
  type InfluencerPersonaId,
  type InfluencerPlatform,
} from "../lib/influencer-persona-logic";
import { invokeLLM } from "./_core/llm";
import { protectedProcedure, router } from "./_core/trpc";

const personaIdSchema = z.enum(
  INFLUENCER_PERSONAS.map((persona) => persona.id) as [InfluencerPersonaId, ...InfluencerPersonaId[]]
);
const platformSchema = z.enum(["instagram", "tiktok", "linkedin", "x", "threads"]);

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
});
