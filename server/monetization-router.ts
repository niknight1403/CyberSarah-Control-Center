import { z } from "zod";
import axios from "axios";
import { SignJWT, importPKCS8 } from "jose";
import { protectedProcedure, router } from "./_core/trpc";
import {
  getMonetizationAccount,
  grantCreditPack,
  recordCloudTokenUsage,
  resolvePlanForUser,
} from "./monetization";
import { CREDIT_PACKS, PLAN_LIMITS } from "../lib/monetization-logic";

/**
 * Sprint 124 — Monetarisierungs-Router (nutzerbezogen, protected).
 *
 * Endpunkte:
 *   - account:        Echtzeit-Kontostand (Plan, Limits, Verbrauch, Guthaben)
 *   - checkQuota:     Pruefung vor einem Cloud-Aufruf (ohne Verbuchung)
 *   - recordUsage:    Token-Verbrauch verbuchen (nach dem Aufruf)
 *   - creditPacks:    Verfuegbare Consumable-Pakete fuer die Paywall-UI
 *   - redeemPlayPurchase: Google-Play-Kauf serverseitig validieren & gutschreiben
 */

const PLAY_PACKAGE = () => process.env.GOOGLE_PLAY_PACKAGE_NAME ?? "";
const PLAY_SERVICE_ACCOUNT = () => {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { client_email: string; private_key: string };
  } catch {
    return null;
  }
};

/** OAuth2-Access-Token fuer die Play Developer API (Service-Account, RS256). */
async function getPlayAccessToken(): Promise<string | null> {
  const account = PLAY_SERVICE_ACCOUNT();
  if (!account?.client_email || !account?.private_key) return null;
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(account.private_key, "RS256");
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/androidpublisher" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const response = await axios.post(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10_000 },
  );
  return response.data?.access_token ?? null;
}

export const monetizationRouter = router({
  /** Echtzeit-Kontostand des angemeldeten Nutzers. */
  account: protectedProcedure.query(async ({ ctx }) => {
    const [state, plan] = await Promise.all([
      getMonetizationAccount(ctx.user.openId),
      resolvePlanForUser(ctx.user.id),
    ]);
    const limits = PLAN_LIMITS[plan];
    return {
      plan,
      planLabel: limits.label,
      limits,
      usage: {
        todayTokens: state.dayCloudTokens,
        monthTokens: state.monthCloudTokens,
        creditBalanceTokens: state.creditBalanceTokens,
      },
      enforcement: process.env.QUOTA_ENFORCEMENT === "enforce" ? ("enforce" as const) : ("monitor" as const),
    };
  }),

  /** Quota pruefen, ohne Verbrauch zu buchen (fuer Pre-Flight-Checks der UI). */
  checkQuota: protectedProcedure
    .input(z.object({ estimatedTokens: z.number().int().min(1).max(1_000_000) }))
    .mutation(async ({ ctx, input }) => {
      const { enforceCloudQuotaForUser } = await import("./monetization");
      return enforceCloudQuotaForUser(
        { id: ctx.user.id, openId: ctx.user.openId },
        input.estimatedTokens,
      );
    }),

  /** Tatsaechlichen Cloud-Token-Verbrauch verbuchen. */
  recordUsage: protectedProcedure
    .input(
      z.object({
        tokens: z.number().int().min(0).max(1_000_000),
        source: z.string().max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const state = await recordCloudTokenUsage(ctx.user.openId, input.tokens);
      return {
        todayTokens: state.dayCloudTokens,
        monthTokens: state.monthCloudTokens,
        creditBalanceTokens: state.creditBalanceTokens,
      };
    }),

  /** Verfuegbare Credit-Pakete (Consumables) fuer Paywall/UI. */
  creditPacks: protectedProcedure.query(() => ({ packs: CREDIT_PACKS })),

  /**
   * Google-Play-Kauf serverseitig validieren und Guthaben gutschreiben.
   * Ohne konfigurierten Service-Account wird bewusst NICHT gebucht
   * (Sicherheit: Client-Bestaetigungen allein sind nie vertrauenswuerdig).
   */
  redeemPlayPurchase: protectedProcedure
    .input(
      z.object({
        productId: z.string().min(1).max(120),
        purchaseToken: z.string().min(10).max(4096),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!PLAY_PACKAGE() || !PLAY_SERVICE_ACCOUNT()) {
        return {
          success: false,
          configured: false,
          message:
            "Google-Play-Billing noch nicht konfiguriert (GOOGLE_PLAY_PACKAGE_NAME / GOOGLE_PLAY_SERVICE_ACCOUNT_JSON). Kauf kann nicht validiert werden.",
        };
      }
      try {
        const accessToken = await getPlayAccessToken();
        if (!accessToken) {
          return { success: false, configured: true, message: "Play-API-Token konnte nicht erzeugt werden." };
        }
        const response = await axios.get(
          `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE()}/purchases/products/${encodeURIComponent(input.productId)}/tokens/${encodeURIComponent(input.purchaseToken)}`,
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10_000 },
        );
        const purchaseState = response.data?.purchaseState;
        if (purchaseState !== 0) {
          return { success: false, configured: true, message: `Kauf nicht abgeschlossen (purchaseState=${purchaseState}).` };
        }
        const granted = await grantCreditPack(ctx.user.openId, input.productId);
        return granted
          ? { success: true, configured: true, message: "Credit-Pack gutgeschrieben." }
          : { success: false, configured: true, message: `Unbekanntes Produkt "${input.productId}".` };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, configured: true, message: `Play-Validierung fehlgeschlagen: ${message}` };
      }
    }),
});
