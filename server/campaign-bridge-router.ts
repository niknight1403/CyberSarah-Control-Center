/**
 * Sprint 373 — tRPC-Router der Kampagnen-Bruecke.
 *
 * queueFromIdeas (admin-only): nimmt die vom Client geplanten Briefs an,
 * laesst die Server-Bruecke daraus echte Persona-Content-Entwuerfe bauen
 * und in der Freigabe-Queue ablegen (pending, HITL). Nur Administratoren —
 * die Bruecke ist Teil der Admin-Autonomie nach dem Login.
 */
import { z } from "zod";

import { campaignBriefSchema, queueCampaignBriefs } from "./campaign-bridge";
import { protectedProcedure, router } from "./_core/trpc";
import { BRIDGE_MAX_BRIEFS_PER_CALL } from "../lib/campaign-bridge-logic";

export const campaignBridgeRouter = router({
  queueFromIdeas: protectedProcedure
    .input(z.object({ briefs: z.array(campaignBriefSchema).min(1).max(BRIDGE_MAX_BRIEFS_PER_CALL) }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Nur Administratoren dürfen die Kampagnen-Brücke starten.");
      }
      const result = await queueCampaignBriefs(input.briefs);
      return { ok: true, result };
    }),
});
