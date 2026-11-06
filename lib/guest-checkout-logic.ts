/**
 * Gast-Kauf: bezahlen ohne Konto, Konto danach.
 *
 * Das Problem, das dieser Baustein loest: Vor dem Kauf ein Konto zu verlangen,
 * kostet genau die Kunden, die noch nicht ueberzeugt sind. Von 17 gestarteten
 * Checkouts wurde keiner bezahlt — die Registrierung war die erste Huerde, nicht
 * der Preis.
 *
 * Ablauf:
 * 1. Checkout startet ohne Login, Stripe erfasst die E-Mail selbst.
 * 2. `checkout.session.completed` liefert uns die Adresse.
 * 3. Konto wird angelegt (oder gefunden) und der Kunde bekommt einen
 *    Anmeldelink per Mail — kein Passwort, keine zweite Registrierung.
 *
 * Diese Datei ist rein: keine Stripe-Aufrufe, keine Datenbank, keine Uhr.
 */

import { isValidEmail } from "./email-logic";

/** Ein Anmeldelink gilt sieben Tage — lang genug fuer ein Wochenende. */
export const MAGIC_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type GuestPurchase = {
  email: string;
  packageId: string;
  orderId: string | null;
  customerId: string | null;
  isGuest: boolean;
};

/** Kurzer Fingerabdruck, damit derselbe Kaeufer dasselbe Konto behaelt. */
export function guestOpenIdForEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  let hash = 5381;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(index)) >>> 0;
  }
  return `guest-${hash.toString(16).padStart(8, "0")}`;
}

/** Anzeigename, wenn der Kaeufer keinen genannt hat: der lokale Teil der Adresse. */
export function guestDisplayName(email: string): string {
  const local = email.trim().split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Kundin oder Kunde";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type CheckoutSessionLike = {
  metadata?: Record<string, string | null | undefined> | null;
  customer_details?: { email?: string | null } | null;
  customer_email?: string | null;
  customer?: string | { id?: string } | null;
  client_reference_id?: string | null;
  mode?: string | null;
};

/**
 * Liest aus einer bezahlten Session, ob es ein Gast-Kauf war und wer der Kaeufer
 * ist. Gibt `null` zurueck, wenn kein Gastfall vorliegt (dann greift der
 * bestehende Konto-Weg).
 */
export function readGuestPurchase(session: CheckoutSessionLike): GuestPurchase | null {
  const metadata = session.metadata ?? {};
  const isGuest = metadata.guest === "1" || metadata.guest === "true";
  const email =
    (session.customer_details?.email ?? session.customer_email ?? metadata.guestEmail ?? "").trim().toLowerCase();
  const packageId = (metadata.packageId ?? "").trim();
  const orderId = (metadata.orderId ?? session.client_reference_id ?? "").trim() || null;
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  if (!isGuest) return null;
  if (!packageId) return null;
  // Ohne Adresse kein Konto und keine Mail: dann ist der Fall nicht aufloesbar.
  if (!isValidEmail(email)) return null;

  return { email, packageId, orderId, customerId, isGuest };
}

/** Gast-Kauf ist nur fuer eine wiederkehrende Zahlung sinnvoll. */
export function guestCheckoutModeAllowed(mode: string | null | undefined): boolean {
  return mode === "subscription" || mode === "payment";
}

/** Metadaten, die der Webhook spaeter wiederfinden muss. */
export function buildGuestCheckoutMetadata(input: {
  packageId: string;
  orderId: string;
  email?: string | null;
}): Record<string, string> {
  const metadata: Record<string, string> = {
    source: "cybersarah-control-center",
    businessUnit: "ai-influenza-team",
    packageId: input.packageId,
    orderId: input.orderId,
    guest: "1",
  };
  const email = (input.email ?? "").trim().toLowerCase();
  if (email && isValidEmail(email)) metadata.guestEmail = email;
  return metadata;
}

/** Anmeldelink fuer eine bezahlte Bestellung. */
export function buildMagicLinkUrl(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/api/auth/magic?token=${encodeURIComponent(token)}`;
}

/** Ziel nach dem Login: der Kunde soll sein Paket sehen, nicht die Startseite. */
export function magicLinkRedirectTarget(orderId: string | null): string {
  const base = "/ai-influenza-team?checkout=success";
  return orderId ? `${base}&order=${encodeURIComponent(orderId)}` : base;
}

/**
 * Prueft einen Anmeldelink-Vorgang. `issuedAt` kommt aus dem Token, `now` aus
 * der Anfrage — so bleibt die Entscheidung nachvollziehbar und testbar.
 */
export function evaluateMagicLink(input: {
  tokenPresent: boolean;
  sessionOpenId: string | null;
  issuedAt: number | null;
  now: number;
  alreadyUsed: boolean;
}): { ok: true; openId: string } | { ok: false; reason: string } {
  if (!input.tokenPresent || !input.sessionOpenId) {
    return { ok: false, reason: "Kein gültiger Anmeldelink." };
  }
  if (input.issuedAt === null) {
    return { ok: false, reason: "Dem Link fehlt ein Ausstellungszeitpunkt." };
  }
  if (input.alreadyUsed) {
    return { ok: false, reason: "Dieser Link wurde bereits verwendet. Fordere einen neuen an." };
  }
  if (input.now - input.issuedAt > MAGIC_LINK_TTL_MS) {
    return { ok: false, reason: "Dieser Link ist abgelaufen. Fordere einen neuen an." };
  }
  return { ok: true, openId: input.sessionOpenId };
}
