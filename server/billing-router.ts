import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as db from "./db";
import {
  cancelUserSubscription,
  createLiveBillingPortalSession,
  createTierCheckoutSession,
  evaluateRequestedTierChange,
  getBillingOverview,
  listUserInvoices,
} from "./billing";
import { SUBSCRIPTION_TIERS } from "../lib/subscription-tiers-logic";
import { protectedProcedure, router } from "./_core/trpc";

export const billingRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getBillingOverview({
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        stripeCustomerId: ctx.user.stripeCustomerId,
        role: ctx.user.role,
      });
    } catch (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Der Abrechnungsstatus konnte nicht geladen werden." });
    }
  }),

  /** Sprint 70 — Checkout fuer eine konkrete Stufe (lite | pro | expert). */
  checkoutTier: protectedProcedure
    .input(z.object({ tier: z.enum(SUBSCRIPTION_TIERS) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await createTierCheckoutSession(
          {
            id: ctx.user.id,
            email: ctx.user.email,
            name: ctx.user.name,
            stripeCustomerId: ctx.user.stripeCustomerId,
            role: ctx.user.role,
          },
          input.tier,
        );
      } catch (error) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Der Checkout konnte nicht vorbereitet werden." });
      }
    }),

  /** Sprint 70 — Kuendung zum Periodenende (widerrufbar bis Periodenende). */
  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await cancelUserSubscription({
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        stripeCustomerId: ctx.user.stripeCustomerId,
        role: ctx.user.role,
      });
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Die Kündigung konnte nicht durchgeführt werden." });
    }
  }),

  /** Sprint 70 — Rechnungshistorie (Stripe-Invoices als Nachweis). */
  invoices: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await listUserInvoices({
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        stripeCustomerId: ctx.user.stripeCustomerId,
        role: ctx.user.role,
      });
    } catch (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Die Rechnungen konnten nicht geladen werden." });
    }
  }),

  /** Sprint 70 — Upgrade-/Downgrade-Entscheidung fuer die UI. */
  evaluateTierChange: protectedProcedure
    .input(z.object({ current: z.enum(SUBSCRIPTION_TIERS), requested: z.string() }))
    .query(({ input }) => evaluateRequestedTierChange(input.current, input.requested)),

  portal: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await createLiveBillingPortalSession({ stripeCustomerId: ctx.user.stripeCustomerId });
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Das Stripe-Kundenportal konnte nicht geöffnet werden." });
    }
  }),
});
