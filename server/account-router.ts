import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { hashPassword, normalizeAccountEmail, validateAccountPassword, verifyPassword } from "./local-auth";

const registerSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(256),
  name: z.string().trim().min(1).max(160).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
});

function toAccountUser(user: { id: number; openId: string; name: string | null; email: string | null; loginMethod: string | null; role: "user" | "admin"; lastSignedIn: Date }) {
  return { id: user.id, openId: user.openId, name: user.name, email: user.email, loginMethod: user.loginMethod, role: user.role, lastSignedIn: user.lastSignedIn };
}

async function createAccountSession(openId: string, name: string | null) {
  return sdk.createSessionToken(openId, { name: name || "CyberSarah Nutzer" });
}

function persistSessionCookie(ctx: { req: Parameters<typeof getSessionCookieOptions>[0]; res: { cookie: (name: string, value: string, options: Record<string, unknown>) => unknown } }, token: string) {
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 1000 * 60 * 60 * 24 * 30 });
}

export const accountRouter = router({
  register: publicProcedure.input(registerSchema).mutation(async ({ ctx, input }) => {
    const invalidPassword = validateAccountPassword(input.password);
    if (invalidPassword) throw new TRPCError({ code: "BAD_REQUEST", message: invalidPassword });
    try {
      const email = normalizeAccountEmail(input.email);
      const user = await db.createLocalUser({
        openId: `local_${crypto.randomUUID()}`,
        email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
      });
      const sessionToken = await createAccountSession(user.openId, user.name);
      persistSessionCookie(ctx, sessionToken);
      return { user: toAccountUser(user), sessionToken };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      const message = error instanceof Error ? error.message : "Das Konto konnte nicht erstellt werden.";
      throw new TRPCError({ code: message.includes("existiert bereits") ? "CONFLICT" : "INTERNAL_SERVER_ERROR", message });
    }
  }),
  login: publicProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    try {
      const user = await db.getUserByEmail(normalizeAccountEmail(input.email));
      if (!user || !await verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "E-Mail-Adresse oder Passwort sind nicht korrekt." });
      }
      await db.touchUserSession(user.openId);
      const refreshed = await db.getUserByOpenId(user.openId) ?? user;
      const sessionToken = await createAccountSession(refreshed.openId, refreshed.name);
      persistSessionCookie(ctx, sessionToken);
      return { user: toAccountUser(refreshed), sessionToken };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Die Anmeldung konnte nicht abgeschlossen werden." });
    }
  }),
  me: protectedProcedure.query(({ ctx }) => toAccountUser(ctx.user)),
});
