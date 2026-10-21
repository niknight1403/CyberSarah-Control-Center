/**
 * CyberSarah Control Center — Digistore24 REST-API-Sync (Polling-Fallback).
 *
 * Der Nutzer hat einen Digistore24-API-Key bereitgestellt (2026-10-21), damit
 * Conversions auch ohne IPN-Portal-Konfiguration zuverlaessig ins CCC fliessen.
 *
 * Auth (offizielle Doku "API basics"): X-DS-API-KEY-Header gegen
 * https://www.digistore24.com/api/call/<funktion>
 *
 * Sync-Strategie:
 *   - listCommissions mit transaction_type=payment       -> eventType "sale"
 *   - listCommissions mit transaction_type=refund,chargeback -> "refund" (negativ)
 *   - Idempotent via orderKey "d24:<commission-id>:<typ>" (onConflictDoNothing)
 *   - Aggregation identisch zum IPN-Pfad (affiliate_products + revenue_daily_stats)
 */

import axios from "axios";
import { sql } from "drizzle-orm";
import { affiliateProducts, conversionEvents } from "../drizzle/schema";
import { getDb } from "./db";
import { createHash } from "crypto";

function sha512(text: string): string {
  return createHash("sha512").update(text, "utf8").digest("hex");
}

const API_BASE = "https://www.digistore24.com/api/call";

export type D24SyncResult = {
  ok: boolean;
  detail?: string;
  paymentsFetched: number;
  refundsFetched: number;
  inserted: number;
  duplicates: number;
  pages: number;
};

type CommissionItem = {
  id?: number | string;
  created_at?: string;
  amount?: number | string;
  currency?: string;
  purchase_id?: string;
  transaction_id?: number | string;
  product_name?: string;
  product_id?: string | number;
  buyer_email?: string;
  [k: string]: unknown;
};

async function d24Call<T>(fn: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.DIGISTORE24_API_KEY?.trim();
  if (!apiKey) throw new Error("DIGISTORE24_API_KEY nicht konfiguriert.");
  const res = await axios.get<{ result?: string; message?: string; data?: T }>(`${API_BASE}/${fn}`, {
    params,
    headers: { "X-DS-API-KEY": apiKey, Accept: "application/json" },
    timeout: 25_000,
  });
  const body = res.data ?? {};
  if (body.result !== "success") {
    throw new Error(`Digistore24-API-Fehler bei ${fn}: ${body.message ?? "unbekannt"}`);
  }
  return (body.data ?? ({} as T));
}

function cents(n: number | string | undefined): number {
  const v = typeof n === "string" ? Number.parseFloat(n) : (n ?? 0);
  return Math.round((Number.isFinite(v) ? v : 0) * 100);
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function fetchAllCommissions(transactionType: string, sinceDays: number): Promise<CommissionItem[]> {
  const all: CommissionItem[] = [];
  let page = 1;
  // Sicherheitslimit: 20 Seiten a 100 Eintraege = 2000 Commissionen pro Typ und Lauf.
  for (let i = 0; i < 20; i++) {
    const data = await d24Call<{
      items?: CommissionItem[];
      page_count?: number;
      item_count?: number;
    }>("listCommissions", {
      from: `-${sinceDays}d`,
      to: "now",
      page_no: String(page),
      page_size: "100",
      transaction_type: transactionType,
    });
    const items = data.items ?? [];
    all.push(...items);
    const pageCount = Number(data.page_count ?? 1);
    if (page >= pageCount || items.length === 0) break;
    page++;
  }
  return all;
}

async function recordCommission(
  item: CommissionItem,
  eventType: "sale" | "refund",
  commissionSign: 1 | -1,
): Promise<"inserted" | "duplicate"> {
  const db = await getDb();
  const id = item.id ?? item.transaction_id ?? item.purchase_id ?? "unknown";
  const orderKey = `d24:${id}:${eventType}`;
  const amountCents = cents(item.amount as number) * commissionSign;
  const commissionCents = amountCents;
  const currency = (item.currency ?? "EUR").slice(0, 8);
  const productTitle = (item.product_name as string) ?? (item.product_id != null ? String(item.product_id) : null);
  const productSlug = productTitle ? slugify(productTitle) : null;
  const buyerEmailHash = item.buyer_email ? sha512(String(item.buyer_email)).slice(0, 128) : null;
  let occurredAt = new Date();
  if (item.created_at) {
    const raw = String(item.created_at);
    const t = raw.includes("T") ? raw : raw.replace(" ", "T");
    const parsed = new Date(t.includes("Z") || /\+\d/.test(t) ? t : t + "Z");
    if (!Number.isNaN(parsed.getTime())) occurredAt = parsed;
  }
  if (Number.isNaN(occurredAt.getTime())) occurredAt.setTime(Date.now());
  const day = occurredAt.toISOString().slice(0, 10);

  if (productSlug) {
    try {
      await db.insert(affiliateProducts).values({
        slug: productSlug,
        title: (productTitle ?? productSlug).slice(0, 300),
        url: item.purchase_id ? `https://www.digistore24.com/product/${item.purchase_id}/` : "https://www.digistore24.com/marketplace/",
        platform: "digistore24",
        conversionCount: 0,
        revenueCents: 0,
      }).onConflictDoNothing({ target: affiliateProducts.slug });
    } catch {
      // Nicht fatal.
    }
  }

  const inserted = await db.insert(conversionEvents).values({
    orderKey,
    productSlug,
    eventType,
    amountCents,
    commissionCents,
    currency,
    buyerEmailHash,
    rawPayload: item as unknown as Record<string, unknown>,
    occurredAt,
  }).onConflictDoNothing({ target: conversionEvents.orderKey }).returning({ id: conversionEvents.id });

  if (inserted.length === 0) return "duplicate";

  if (productSlug) {
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
  return "inserted";
}

/** Zieht Commissionen der letzten N Tage (Default 30) idempotent in die DB. */
export async function syncDigistore24Commissions(sinceDays = 30): Promise<D24SyncResult> {
  const result: D24SyncResult = { ok: true, paymentsFetched: 0, refundsFetched: 0, inserted: 0, duplicates: 0, pages: 0 };
  try {
    const payments = await fetchAllCommissions("payment", sinceDays);
    const refunds = await fetchAllCommissions("refund,chargeback", sinceDays);
    result.paymentsFetched = payments.length;
    result.refundsFetched = refunds.length;
    for (const item of payments) {
      const r = await recordCommission(item, "sale", 1);
      r === "inserted" ? result.inserted++ : result.duplicates++;
    }
    for (const item of refunds) {
      const r = await recordCommission(item, "refund", -1);
      r === "inserted" ? result.inserted++ : result.duplicates++;
    }
  } catch (error) {
    result.ok = false;
    result.detail = error instanceof Error ? error.message : String(error);
  }
  return result;
}
