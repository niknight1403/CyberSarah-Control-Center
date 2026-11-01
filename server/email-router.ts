/**
 * Sprint 266 — E-Mail-Router: geschützter Versand, niemals öffentlich.
 */
import { z } from "zod";

import { dispatchTransactionalEmail } from "./email-service";
import { protectedProcedure, router } from "./_core/trpc";

const emailDispatchSchema = z.object({
  kind: z.enum(["receipt", "onboarding_welcome", "quota_warning", "plan_change"]),
  to: z.string().min(3).max(200),
  subject: z.string().min(5).max(120),
  body: z.string().min(10).max(8000),
  optIn: z.object({ documented: z.boolean(), source: z.string().min(1).max(200) }).nullable(),
  idempotencyKey: z.string().min(3).max(200),
});

export const emailRouter = router({
  send: protectedProcedure.input(emailDispatchSchema).mutation(async ({ input }) => {
    return dispatchTransactionalEmail(input);
  }),
});
