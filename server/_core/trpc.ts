import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const.js";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

/**
 * Sprint 159 — Rate-Limit-Ablehnung ALS TRPCError statt rohem Express-JSON.
 * server/_core/security.ts reicht ein Ueberschreiten des Limits fuer
 * /api/trpc-Pfade ueber `res.locals.rateLimitExceeded` durch (statt direkt
 * mit res.status(429).json(...) zu antworten) — dieses Flag wird hier
 * geprueft und korrekt tRPC-foermig abgelehnt, damit der Client eine
 * lesbare Meldung bekommt statt "Unable to transform response from server".
 */
const rateLimitGuard = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  const locals = (ctx.res as unknown as { locals?: Record<string, unknown> })?.locals;
  const limited = locals?.rateLimitExceeded as { retryAfterSeconds?: number } | undefined;
  if (limited) {
    const seconds = typeof limited.retryAfterSeconds === "number" ? limited.retryAfterSeconds : 60;
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Zu viele Anfragen. Bitte in ${seconds} Sekunde${seconds === 1 ? "" : "n"} erneut versuchen.`,
    });
  }
  return next();
});

export const publicProcedure = t.procedure.use(rateLimitGuard);

const requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireUser);

export const adminProcedure = publicProcedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
