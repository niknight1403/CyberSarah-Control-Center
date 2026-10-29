/**
 * CyberSarah Control Center — Digistore24 IPN-Webhook (Block 2, 2026-10-21).
 *
 * POST /api/v1/webhooks/digistore24
 *   - Validiert den SHA512-Signatur-Parameter sha_sign (timing-safe gegen
 *     die konfigurierte Passphrase). Ohne DIGISTORE24_IPN_PASSPHRASE wird
 *     ehrlich 503 geliefert — keine unsichere Akzeptanz von Events.
 *   - Idempotent: orderKey (order_id + event) ist UNIQUE; Doppel-IPNs
 *     werden mit 200 "duplicate" quittiert, nie doppelt gezaehlt.
 *   - Auto-Discovery: Unbekannte Produkte (product_id/slug) werden als
 *     Affiliate-Produkt angelegt.
 *   - Aggregation: commission/amount fliessen in affiliate_products und
 *     revenue_daily_stats ein (Echtzeit-Umsatzpanel, Block 4).
 *
 * Ehrlichkeit: Keine erfundenen Conversions. DB nicht verfuegbar -> 503.
 */

import crypto from "node:crypto";
import type { Request, Response } from "express";
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { affiliateProducts, conversionEvents } from "../drizzle/schema";
import { resolveDigistore24IpnSecret } from "../lib/digistore24-ipn-config";
import {
  commissionCents, hashedBuyerEmail, ledgerOrderKey,
  minimalIpnPayload, validSha512Hex,
  netConversionDelta, type D24EventKind,
} from "../lib/digistore24-ledger-logic";

function sha512(text: string): string {
  return crypto.createHash("sha512").update(text, "utf8").digest("hex");
}

/** Digistore24-Signatur: SHA512 ueber alle Parameter-Schluessel (sortiert). */
export function buildIpnSignature(fields: Record<string, string>, passphrase: string): string {
  const keys = Object.keys(fields).filter((k) => k !== "sha_sign").sort();
  const material = keys.map((k) => fields[k]).join("") + passphrase;
  return sha512(material);
}

export async function handleDigistore24Ipn(req: Request, res: Response): Promise<void> {
  const passphrase = resolveDigistore24IpnSecret();
  if (!passphrase) {
    res.status(503).json({ ok: false, detail: "IPN-Secret nicht konfiguriert (DIGISTORE24_IPN_SECRET / DIGISTORE24_IPN_PASSPHRASE)." });
    return;
  }
  const fields: Record<string, string> = {};
  const source = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(source)) {
    if (v !== null && v !== undefined) fields[k] = String(v);
  }
  const expected = buildIpnSignature(fields, passphrase);
  const received = fields.sha_sign ?? "";
  const valid = validSha512Hex(received) &&
    crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  if (!valid) {
    res.status(401).json({ ok: false, detail: "Ungültige Signatur." });
    return;
  }
  const orderId = String(fields.order_id ?? fields.order ?? "").trim();
  const eventType = String(fields.event ?? fields.status ?? fields.sale_status ?? "sale").slice(0,64);
  if (!orderId) {res.status(400).json({ok:false,detail:"order_id fehlt."});return;}
  const eventLower = eventType.toLowerCase();
  const kind: D24EventKind = eventLower.includes("chargeback") ? "chargeback" :
    eventLower.includes("refund") || eventLower.includes("return") ? "refund" : "sale";
  const productSlug = String(fields.product_id ?? fields.product_name ?? "")
    .toLowerCase().replace(/[^a-z0-9-]+/g,"-").slice(0,200);
  const orderKey = ledgerOrderKey("ipn", `${orderId}:${eventType}`,kind);
  const conversionsDelta = netConversionDelta(kind);
  let amountCents: number;
  let commissionAmount: number;
  try {
    amountCents = commissionCents(fields.amount ?? fields.gross_amount ?? "0",kind);
    commissionAmount = commissionCents(fields.commission ?? fields.net_amount ?? fields.amount ?? "0",kind);
  } catch {res.status(400).json({ok:false,detail:"Ungültiger Betrag."});return;}
  const currency = /^[A-Z]{3}$/.test(fields.currency ?? "EUR") ? (fields.currency ?? "EUR") : "EUR";
  const buyerEmailHash = hashedBuyerEmail(fields.buyer_email, process.env.D24_CUSTOMER_HASH_SECRET || process.env.JWT_SECRET);
  const occurredAt = new Date();
  const day = occurredAt.toISOString().slice(0,10);
  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch {
    res.status(503).json({ ok: false, detail: "Datenbank nicht verfügbar." });
    return;
  }
  if (!db) {
    res.status(503).json({ ok: false, detail: "Datenbank nicht verfügbar." });
    return;
  }

  try {
    const status = await db.transaction(async (tx) => {
      if (productSlug) await tx.insert(affiliateProducts).values({
        slug:productSlug,title:String(fields.product_name ?? productSlug).slice(0,300),
        url:"https://www.digistore24.com/marketplace/",platform:"digistore24",conversionCount:0,revenueCents:0,
      }).onConflictDoNothing({target:affiliateProducts.slug});
      const inserted = await tx.insert(conversionEvents).values({
        orderKey,productSlug:productSlug || null,eventType,amountCents,commissionCents:commissionAmount,
        currency,buyerEmailHash,rawPayload:minimalIpnPayload(fields),occurredAt,
      }).onConflictDoNothing({target:conversionEvents.orderKey}).returning({id:conversionEvents.id});
      if (!inserted.length) return "duplicate" as const;
      if (productSlug) await tx.execute(sql`
        UPDATE affiliate_products SET "conversionCount"=GREATEST(0,"conversionCount"+${conversionsDelta}),
          "revenueCents"="revenueCents"+${commissionAmount},"updatedAt"=now() WHERE slug=${productSlug}`);
      await tx.execute(sql`
        INSERT INTO revenue_daily_stats ("day","conversions","revenueCents") VALUES (${day},${conversionsDelta},${commissionAmount})
        ON CONFLICT ("day") DO UPDATE SET
        "conversions"=revenue_daily_stats."conversions"+${conversionsDelta},
        "revenueCents"=revenue_daily_stats."revenueCents"+${commissionAmount},"updatedAt"=now()`);
      return "recorded" as const;
    });
    res.status(200).type("text/plain").send(status === "duplicate" ? "OK duplicate" : "OK recorded");
  } catch {
    // Never expose SQL, credentials or provider payloads to public callers.
    res.status(503).json({ok:false,detail:"Conversion vorübergehend nicht speicherbar."});
  }
}
