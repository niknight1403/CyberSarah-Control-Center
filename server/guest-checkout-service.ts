/**
 * Konto nach dem Gast-Kauf.
 *
 * Der Webhook ist der einzige Moment, in dem wir die Kaeufer-Adresse sicher
 * kennen (Stripe hat sie beim Bezahlen erhoben). Hier wird daraus ein Konto und
 * ein Anmeldelink — in dieser Reihenfolge, damit niemand eine Mail ohne Konto
 * bekommt und niemand ein Konto ohne Zugang.
 *
 * Fehlertoleranz: Scheitert der Mailversand, bleibt das Konto bestehen und der
 * Fehler wird protokolliert. Der Kunde kann sich die Mail erneut anfordern;
 * ein verlorenes Konto waere teurer als eine verlorene Mail.
 */
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { dispatchTransactionalEmail } from "./email-service";
import { ensureAiInfluenzaCustomerNode } from "./ai-influenza-team-service";
import {
  MAGIC_LINK_TTL_MS,
  buildMagicLinkUrl,
  guestDisplayName,
  guestOpenIdForEmail,
  readGuestPurchase,
  type CheckoutSessionLike,
} from "../lib/guest-checkout-logic";
import { buildMagicLinkEmail, toDispatchInput } from "../lib/transactional-email-templates";

export type GuestProvisionResult =
  | { handled: false; reason: string }
  | {
      handled: true;
      openId: string;
      userId: number | null;
      createdAccount: boolean;
      mail: { status: string; detail: string };
    };

function appBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim();
  return (configured || "https://app.cybersarah-ki.com").replace(/\/+$/, "");
}

/**
 * Legt fuer eine bezahlte Gast-Session ein Konto an (oder findet es) und sendet
 * den Anmeldelink. Gibt `handled: false` zurueck, wenn es kein Gast-Kauf ist —
 * dann laeuft der bestehende Konto-Weg unveraendert weiter.
 */
export async function provisionGuestAccountAfterPurchase(
  session: CheckoutSessionLike,
): Promise<GuestProvisionResult> {
  const purchase = readGuestPurchase(session);
  if (!purchase) return { handled: false, reason: "Keine Gast-Session (Konto vorhanden oder Adresse fehlt)." };

  const existing = await db.getUserByEmail(purchase.email);
  const openId = existing?.openId ?? guestOpenIdForEmail(purchase.email);
  let createdAccount = false;

  if (!existing) {
    await db.upsertUser({
      openId,
      email: purchase.email,
      name: guestDisplayName(purchase.email),
      loginMethod: "magic_link",
      lastSignedIn: new Date(),
    });
    createdAccount = true;
  }

  // Konto erneut lesen: erst jetzt gibt es eine ID fuer die Stripe-Zuordnung.
  const account = existing ?? (await db.getUserByEmail(purchase.email));
  if (account && purchase.customerId && !account.stripeCustomerId) {
    await db.setStripeCustomerId(account.id, purchase.customerId);
  }

  // Kundenknoten anlegen, damit Paket und Auftrag am Konto haengen.
  try {
    await ensureAiInfluenzaCustomerNode({
      openId,
      name: account?.name ?? guestDisplayName(purchase.email),
      email: purchase.email,
      packageId: purchase.packageId as never,
    });
  } catch (error) {
    console.error(
      `[guest-checkout] Kundenknoten fehlgeschlagen für ${purchase.orderId ?? "unbekannt"}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const token = await sdk.signSession(
    { openId, appId: ENV.appId, name: account?.name ?? guestDisplayName(purchase.email) },
    { expiresInMs: MAGIC_LINK_TTL_MS },
  );
  const magicUrl = buildMagicLinkUrl(appBaseUrl(), token);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString();

  const draft = buildMagicLinkEmail({
    magicUrl,
    packageLabel: purchase.packageId,
    orderId: purchase.orderId ?? "ohne Referenz",
    expiresAt,
  });
  const outcome = await dispatchTransactionalEmail(
    toDispatchInput(draft, purchase.email, {
      documented: true,
      source: `Kauf via Stripe (Vertragserfüllung), Session ${purchase.orderId ?? "ohne Referenz"}`,
    }),
  ).catch((error: unknown) => ({
    status: "rejected" as const,
    reason: `Versand warf: ${error instanceof Error ? error.message : String(error)}`,
    configured: false,
  }));

  const detail = outcome.status === "rejected" ? outcome.reason : outcome.status;
  console.log(
    `[guest-checkout] Konto ${createdAccount ? "angelegt" : "gefunden"} für ${purchase.email} · Login-Mail ${outcome.status}${outcome.status === "rejected" ? ` (${detail})` : ""}`,
  );

  return {
    handled: true,
    openId,
    userId: account?.id ?? null,
    createdAccount,
    mail: { status: outcome.status, detail },
  };
}
