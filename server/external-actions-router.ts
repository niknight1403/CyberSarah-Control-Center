import { z } from "zod";

import { completeExternalAction, createExternalActionDraft, decideExternalAction, listAudit } from "./external-actions-service";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";

export const externalActionsRouter = router({
  createDraft: protectedProcedure
    .input(z.object({ id: z.string().min(3).max(60), kind: z.enum(["email_send", "social_post_draft", "payment_link", "api_webhook"]), payloadPreview: z.string().min(5).max(2000), idempotencyKey: z.string().min(3).max(200) }))
    .mutation(async ({ input }) => createExternalActionDraft({ ...input, createdAt: Date.now() })),
  decide: adminProcedure
    .input(z.object({ id: z.string(), decision: z.enum(["approve", "reject", "revoke"]), reason: z.string().max(500).optional() }))
    .mutation(async ({ input }) => decideExternalAction(input.id, input.decision === "reject" ? { decision: "reject", reason: input.reason ?? "Ohne Begründung abgelehnt." } : { decision: input.decision })),
  complete: adminProcedure
    .input(z.object({ id: z.string(), outcome: z.string().max(500), ok: z.boolean() }))
    .mutation(async ({ input }) => completeExternalAction(input.id, input.outcome, input.ok)),
  audit: protectedProcedure.query(async () => listAudit()),
});
