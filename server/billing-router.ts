import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { createLiveBillingPortalSession, createLiveCheckoutSession } from "./billing";
import { protectedProcedure, router } from "./_core/trpc";

export const billingRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    try {
      const subscription = await db.getBillingSubscriptionForUser(ctx.user.id);
      return { subscription: subscription ?? null, customerConfigured: Boolean(ctx.user.stripeCustomerId) };
    } catch (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Der Abrechnungsstatus konnte nicht geladen werden." });
    }
  }),
  checkout: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await createLiveCheckoutSession(ctx.user);
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Der Live-Checkout konnte nicht vorbereitet werden." });
    }
  }),
  portal: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await createLiveBillingPortalSession(ctx.user);
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Das Stripe-Kundenportal konnte nicht geöffnet werden." });
    }
  }),
});
