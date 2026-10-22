import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { hashPassword, normalizeAccountEmail, validateAccountPassword, verifyPassword } from "./local-auth";
import { DESIGN_THEMES } from "../lib/design-theme-logic";
import { isGoogleLoginConfigured, verifyGoogleIdTokenClaims, type GoogleIdTokenClaims } from "../lib/google-login-logic";
import { isAdministratorEmail } from "./db";

const registerSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(256),
  name: z.string().trim().min(1).max(160).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
});

const googleLoginSchema = z.object({
  idToken: z.string().min(20).max(8192),
});

const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

function toAccountUser(user: { id: number; openId: string; name: string | null; email: string | null; loginMethod: string | null; role: "user" | "admin"; lastSignedIn: Date; designTheme?: string | null }) {
  return { id: user.id, openId: user.openId, name: user.name, email: user.email, loginMethod: user.loginMethod, role: user.role, lastSignedIn: user.lastSignedIn, designTheme: user.designTheme ?? null };
}

async function createAccountSession(openId: string, name: string | null) {
  return sdk.createSessionToken(openId, { name: name || "CyberSarah Nutzer" });
}

function persistSessionCookie(ctx: { req: Parameters<typeof getSessionCookieOptions>[0]; res: { cookie: (name: string, value: string, options: Record<string, unknown>) => unknown } }, token: string) {
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 1000 * 60 * 60 * 24 * 30 });
}

const designThemeSchema = z.object({
  designTheme: z.enum(DESIGN_THEMES as unknown as [string, ...string[]]),
});

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
      const isConflict = error instanceof Error && error.message.includes("existiert bereits");
      console.error("[Account] Registration failed:", error);
      throw new TRPCError({ code: isConflict ? "CONFLICT" : "INTERNAL_SERVER_ERROR", message: isConflict ? "Diese E-Mail-Adresse ist bereits registriert." : "Registrierung derzeit nicht möglich. Bitte später erneut versuchen." });
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
      console.error("[Account] Login database/service failure:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Anmeldung derzeit nicht möglich. Bitte später erneut versuchen." });
    }
  }),
  /**
   * Sprint 374 — Google-Login-Konfiguration (oeffentlich).
   * Der Button in der App rendert nur, wenn eine Web-Client-ID hinterlegt ist —
   * kein toter UI-Code, wenn Google noch nicht eingerichtet ist. Die Client-ID
   * wird zur Laufzeit geliefert, damit ein Nachtragen (Render-Env) KEINEN
   * APK-Neubau erfordert.
   */
  googleLoginConfig: publicProcedure.query(() => {
    const clientId = process.env.GOOGLE_WEB_CLIENT_ID?.trim() ?? "";
    return { enabled: isGoogleLoginConfigured(clientId), clientId };
  }),

  /**
   * Sprint 374 — Anmeldung mit Google-ID-Token.
   * Verifikation ueber den Google-tokeninfo-Endpunkt (Google prueft die
   * Signatur, wir pruefen aud/iss/exp/email_verified deterministisch).
   * Existierende Konten werden per E-Mail verknuepft (z. B. Admin-Konto),
   * neue Konten werden angelegt — die Admin-E-Mail erhaelt automatisch die
   * Admin-Rolle (ADMIN_EMAIL-Bindung bleibt damit auch bei Google-Login wirksam).
   */
  loginWithGoogle: publicProcedure.input(googleLoginSchema).mutation(async ({ ctx, input }) => {
    const expectedAudience = process.env.GOOGLE_WEB_CLIENT_ID?.trim() ?? "";
    if (!isGoogleLoginConfigured(expectedAudience)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Google-Login ist nicht konfiguriert (GOOGLE_WEB_CLIENT_ID fehlt)." });
    }
    try {
      const response = await fetch(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(input.idToken)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Das Google-Token konnte nicht verifiziert werden." });
      }
      const claims = (await response.json()) as GoogleIdTokenClaims;
      const verified = verifyGoogleIdTokenClaims(claims, expectedAudience);
      if (!verified.ok || !verified.email) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: verified.reason ?? "Google-Token abgelehnt." });
      }
      const email = normalizeAccountEmail(verified.email);
      const existing = await db.getUserByEmail(email);
      if (existing) {
        await db.touchUserSession(existing.openId);
        const refreshed = (await db.getUserByOpenId(existing.openId)) ?? existing;
        const sessionToken = await createAccountSession(refreshed.openId, refreshed.name);
        persistSessionCookie(ctx, sessionToken);
        return { user: toAccountUser(refreshed), sessionToken };
      }
      await db.upsertUser({
        openId: `google_${verified.sub}`,
        email,
        name: verified.name,
        loginMethod: "google",
        role: isAdministratorEmail(email) ? "admin" : "user",
        lastSignedIn: new Date(),
      });
      const created = await db.getUserByOpenId(`google_${verified.sub}`);
      if (!created) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Das Google-Konto konnte nicht angelegt werden." });
      }
      const sessionToken = await createAccountSession(created.openId, created.name);
      persistSessionCookie(ctx, sessionToken);
      return { user: toAccountUser(created), sessionToken };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error("[Account] Google login service failure:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Google-Anmeldung derzeit nicht möglich. Bitte später erneut versuchen." });
    }
  }),

  me: protectedProcedure.query(({ ctx }) => toAccountUser(ctx.user)),
  // Sprint 160 — Design-Theme-Auswahl dauerhaft im Benutzerprofil speichern.
  // Prioritaet beim Laden: Profil > lokaler Speicher > Default (siehe
  // lib/theme-provider.tsx). Client bleibt auch ohne Login voll funktional.
  setDesignTheme: protectedProcedure.input(designThemeSchema).mutation(async ({ ctx, input }) => {
    await db.setUserDesignTheme(ctx.user.openId, input.designTheme);
    return { designTheme: input.designTheme };
  }),
});
