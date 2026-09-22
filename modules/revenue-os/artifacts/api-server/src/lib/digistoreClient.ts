/**
 * Digistore24 Integration
 * - Echte API-Anbindung für Produkte, Bestellungen und Affiliate-Daten
 * - Webhook-Verarbeitung für Verkäufe & Affiliate-Provisionen
 * - IPN (Instant Payment Notification) Validierung
 * - Echtzeit-Verbuchung in transactions-Tabelle
 */
import crypto from "crypto";
import { logger } from "./logger";
import { db } from "@workspace/db";
import { transactionsTable } from "@workspace/db";

const DS24_API_KEY = process.env["DIGISTORE24_API_KEY"];
const DS24_IPN_SECRET = process.env["DIGISTORE24_IPN_SECRET"];
const DS24_AFFILIATE_ID = process.env["DIGISTORE24_AFFILIATE_ID"];

export const digistoreVerfuegbar = !!DS24_API_KEY;

if (DS24_API_KEY) {
  logger.info({ affiliateId: DS24_AFFILIATE_ID }, "✅ Digistore24 aktiv");
} else {
  logger.warn("⚠️ Kein DIGISTORE24_API_KEY — Digistore24 deaktiviert");
}

// ─── IPN-Signatur validieren ─────────────────────────────────────────────────

export function validiereDigistoreSignatur(
  payload: Record<string, string>,
  signatur: string
): boolean {
  if (!DS24_IPN_SECRET) {
    logger.warn("DIGISTORE24_IPN_SECRET fehlt — Signatur-Prüfung übersprungen");
    return false;
  }

  // Digistore24 IPN-Signatur: SHA-512 HMAC über sorted key=value pairs
  const sortiertParams = Object.keys(payload)
    .filter(k => k !== "sha_sign")
    .sort()
    .map(k => `${k}=${payload[k]}`)
    .join("&");

  const erwartet = crypto
    .createHmac("sha512", DS24_IPN_SECRET)
    .update(sortiertParams)
    .digest("hex");

  const gueltig = erwartet === signatur;

  if (!gueltig) {
    logger.warn({ erwartet: erwartet.substring(0, 16) + "...", empfangen: signatur.substring(0, 16) + "..." },
      "Digistore24 IPN-Signatur ungültig");
  }

  return gueltig;
}

// ─── IPN-Payload verarbeiten ──────────────────────────────────────────────────

export interface DS24IpnPayload {
  event: string;
  order_id: string;
  product_id: string;
  product_name: string;
  order_gross: string;
  currency_code: string;
  affiliate_id?: string;
  affiliate_commission?: string;
  buyer_email?: string;
  sha_sign?: string;
}

export async function verarbeiteDigistoreIPN(payload: DS24IpnPayload): Promise<void> {
  const betragEuro = parseFloat(payload.order_gross ?? "0") / 100;
  const provision = parseFloat(payload.affiliate_commission ?? "0") / 100;

  logger.info({
    event: payload.event,
    orderId: payload.order_id,
    betrag: betragEuro,
    provision,
  }, "Digistore24 IPN empfangen");

  // DB-Null-Check: Wenn keine DB vorhanden, nur loggen
  if (!db) {
    logger.warn("⚠️ Keine DB — DS24-IPN wird protokolliert aber nicht verbucht");
    return;
  }

  try {
    switch (payload.event) {
      case "ipn_purchase": {
        await db.insert(transactionsTable).values({
          transaktionsId: `ds24_${payload.order_id}`,
          quelle: "digistore24",
          typ: "verkauf",
          betrag: betragEuro.toFixed(2),
          waehrung: payload.currency_code ?? "EUR",
          beschreibung: payload.product_name,
          metadaten: JSON.stringify({
            productId: payload.product_id,
            buyerEmail: payload.buyer_email,
          }),
        }).onConflictDoNothing();

        logger.info({ orderId: payload.order_id, betrag: betragEuro },
          "✅ DS24 Verkauf verbucht");
        break;
      }

      case "ipn_affiliate": {
        if (provision > 0) {
          await db.insert(transactionsTable).values({
            transaktionsId: `ds24_aff_${payload.order_id}`,
            quelle: "digistore24_affiliate",
            typ: "provision",
            betrag: provision.toFixed(2),
            waehrung: payload.currency_code ?? "EUR",
            beschreibung: `Affiliate-Provision: ${payload.product_name}`,
            metadaten: JSON.stringify({
              affiliateId: payload.affiliate_id,
              originalOrderId: payload.order_id,
            }),
          }).onConflictDoNothing();

          logger.info({ provision }, "✅ DS24 Affiliate-Provision verbucht");
        }
        break;
      }

      case "ipn_refund": {
        await db.insert(transactionsTable).values({
          transaktionsId: `ds24_refund_${payload.order_id}`,
          quelle: "digistore24",
          typ: "rueckerstattung",
          betrag: (-betragEuro).toFixed(2),
          waehrung: payload.currency_code ?? "EUR",
          beschreibung: `Rückerstattung: ${payload.product_name}`,
          metadaten: JSON.stringify({ originalOrderId: payload.order_id }),
        }).onConflictDoNothing();

        logger.warn({ orderId: payload.order_id, betrag: betragEuro },
          "⚠️ DS24 Rückerstattung verbucht");
        break;
      }

      default:
        logger.info({ event: payload.event }, "Unbekanntes DS24-Event ignoriert");
    }
  } catch (err) {
    logger.error({ err, orderId: payload.order_id },
      "❌ DS24 IPN Verarbeitungsfehler — Transaktion nicht verbucht");
    throw err;
  }
}

// ─── Produkt-Liste via API holen ─────────────────────────────────────────────

export async function holeDigistoreProdukte(): Promise<unknown[]> {
  if (!DS24_API_KEY) return [];

  try {
    const res = await fetch("https://www.digistore24.com/api/call/listMyProducts", {
      headers: { "X-DS24-API-KEY": DS24_API_KEY },
    });

    if (!res.ok) throw new Error(`DS24 API ${res.status}`);
    const data = await res.json() as { data?: { products?: unknown[] } };
    return data?.data?.products ?? [];
  } catch (err) {
    logger.error({ err }, "Digistore24 Produkte konnten nicht geladen werden");
    return [];
  }
}

// ─── Verkäufe via API abrufen ────────────────────────────────────────────────

export async function holeDigistoreVerkaeufe(): Promise<unknown[]> {
  if (!DS24_API_KEY) return [];

  try {
    const res = await fetch("https://www.digistore24.com/api/call/listTransactions", {
      headers: { "X-DS24-API-KEY": DS24_API_KEY },
    });

    if (!res.ok) throw new Error(`DS24 API ${res.status}`);
    const data = await res.json() as { data?: { transactions?: unknown[] } };
    return data?.data?.transactions ?? [];
  } catch (err) {
    logger.error({ err }, "Digistore24 Verkäufe konnten nicht geladen werden");
    return [];
  }
}

// ─── Verbindungsprüfung ─────────────────────────────────────────────────────

export async function pruefeDigistoreVerbindung(): Promise<{
  verbunden: boolean;
  affiliateId: string | null;
  fehler?: string;
}> {
  if (!DS24_API_KEY) {
    return { verbunden: false, affiliateId: null, fehler: "DIGISTORE24_API_KEY fehlt" };
  }

  try {
    const res = await fetch("https://www.digistore24.com/api/call/listMyProducts", {
      headers: { "X-DS24-API-KEY": DS24_API_KEY },
    });
    return {
      verbunden: res.ok,
      affiliateId: DS24_AFFILIATE_ID ?? null,
      fehler: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      verbunden: false,
      affiliateId: DS24_AFFILIATE_ID ?? null,
      fehler: err instanceof Error ? err.message : "Verbindungsfehler",
    };
  }
}
