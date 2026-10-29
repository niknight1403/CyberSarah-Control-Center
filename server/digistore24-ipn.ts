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

function cents(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

function sha512(text: string): string {
  return crypto.createHash("sha512").update(text, "utf8").digest("hex");
}

/** Digistore24-Signatur: SHA512 ueber alle Parameter-Schluessel (sortiert). */
export function buildIpnSignature(fields: Record<string, string>, passphrase: string): string {
  const keys = Object.keys(fields).filter((k) => k !== "sha_sign").sort();
  const material = keys.map((k) => fields[k]).join("") + passphrase;
  return sha512(material);
}

type IpnResult = { status: number; body: Record<string, unknown> };

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
  const valid = received.length === 128 && crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received.padEnd(128, "0").slice(0, 128), "hex"));
  if (!valid) {
    res.status(401).json({ ok: false, detail: "Ungültige Signatur." });
    return;
  }
  const orderId = fields.order_id ?? fields.order ?? "";
  const eventType = (fields.event ?? fields.status ?? fields.sale_status ?? "sale").toString().slice(0, 64);
  if (!orderId) {
    res.status(400).json({ ok: false, detail: "order_id fehlt." });
    return;
  }
  const productSlug = (fields.product_id ?? fields.product_name ?? "").toString().toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 200);
  const orderKey = `${orderId}:${eventType}`.slice(0, 200);
  const amountCents = cents(fields.amount ?? fields.gross_amount);
  const commissionCents = cents(fields.commission ?? fields.net_amount ?? fields.amount);
  const currency = (fields.currency ?? "EUR").toString().slice(0, 8);
  const buyerEmailHash = fields.buyer_email ? sha512(fields.buyer_email).slice(0, 128) : null;
  const occurredAt = new Date();
  const day = occurredAt.toISOString().slice(0, 10);

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

  // Auto-Discovery: unbekanntes Produkt ehrlich anlegen (kein Fake-Titel).
  if (productSlug) {
    try {
      await db.insert(affiliateProducts).values({
        slug: productSlug,
        title: (fields.product_name ?? productSlug).toString().slice(0, 300),
        url: `https://www.digistore24.com/product/${productSlug}/`,
        platform: "digistore24",
        conversionCount: 0,
        revenueCents: 0,
      }).onConflictDoNothing({ target: affiliateProducts.slug });
    } catch {
      // Nicht fatal: Conversion zaehlt trotzdem.
    }
  }

  try {
    const inserted = await db.insert(conversionEvents).values({
      orderKey,
      productSlug: productSlug || null,
      eventType,
      amountCents,
      commissionCents,
      currency,
      buyerEmailHash,
      rawPayload: fields,
      occurredAt,
    }).onConflictDoNothing({ target: conversionEvents.orderKey }).returning({ id: conversionEvents.id });

    if (inserted.length === 0) {
      res.status(200).type("text/plain").send(`OK duplicate_orderKey:${orderKey}`);
      return;
    }
    if (productSlug) {
      // Aggregation per SQL-Ausdruck (atomar, keine Race-Conditions, parameterisiert).
      await db.execute(sql`
        UPDATE affiliate_products
        SET "conversionCount" = "conversionCount" + 1,
            "revenueCents" = "revenueCents" + ${commissionCents},
            "updatedAt" = now()
        WHERE slug = ${productSlug}`);
    }
    await db.execute(sql`
      INSERT INTO revenue_daily_stats ("day", "conversions", "revenueCents")
      VALUES (${day}, 1, ${commissionCents})
      ON CONFLICT ("day") DO UPDATE
      SET "conversions" = revenue_daily_stats."conversions" + 1,
          "revenueCents" = revenue_daily_stats."revenueCents" + ${commissionCents},
          "updatedAt" = now()`);
    res.status(200).type("text/plain").send(`OK recorded_orderKey:${orderKey}`);
  } catch (error) {
    res.status(503).json({ ok: false, detail: `Conversion nicht speicherbar: ${error instanceof Error ? error.message : String(error)}` });
  }
}
