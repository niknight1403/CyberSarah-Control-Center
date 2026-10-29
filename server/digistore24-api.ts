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
import {
  boundedPageCount, boundedSyncDays, commissionCents, commissionProductSlug,
  hashedBuyerEmail, ledgerOrderKey, minimalCommissionPayload, normalizeApiFailure,
  parseCommissionDate, safeProductUrl, shouldPollCommissions, transactionIdentity,
  type D24EventKind,
} from "../lib/digistore24-ledger-logic";
import { resolveDigistore24IpnSecret } from "../lib/digistore24-ipn-config";

const API_BASE = "https://www.digistore24.com/api/call";

export type D24SyncResult = {
  ok: boolean;
  detail?: string;
  paymentsFetched: number;
  refundsFetched: number;
  inserted: number;
  duplicates: number;
  pages: number;
  rejected: number;
  mode: "polling" | "ipn_primary" | "unavailable";
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
  transaction_type?: string;
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
    // Never echo arbitrary upstream messages; they may contain customer data.
    throw new Error(`D24_API_${normalizeApiFailure(body, res.status)}`);
  }
  return (body.data ?? ({} as T));
}

async function fetchAllCommissions(transactionType: string, sinceDays: number): Promise<{items:CommissionItem[];pages:number}> {
  const all: CommissionItem[] = [];
  let page = 1;
  let fetchedPages = 0;
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
    const items = Array.isArray(data.items) ? data.items : [];
    all.push(...items);
    fetchedPages++;
    const pageCount = boundedPageCount(data.page_count);
    if (page >= pageCount || items.length === 0) break;
    page++;
  }
  return { items: all, pages: fetchedPages };
}

async function recordCommission(item: CommissionItem, kind: D24EventKind): Promise<"inserted" | "duplicate"> {
  const db = await getDb();
  if (!db) throw new Error("D24_DATABASE_UNAVAILABLE");
  const identity = transactionIdentity(item);
  const orderKey = ledgerOrderKey("api", identity, kind);
  const amountCents = commissionCents(item.amount, kind);
  const commissionAmount = amountCents;
  const currency = typeof item.currency === "string" && /^[A-Z]{3}$/.test(item.currency) ? item.currency : "EUR";
  const title = typeof item.product_name === "string" ? item.product_name.slice(0, 300) : String(item.product_id ?? "").slice(0, 300);
  const productSlug = commissionProductSlug(item);
  const buyerEmailHash = hashedBuyerEmail(item.buyer_email, process.env.D24_CUSTOMER_HASH_SECRET || process.env.JWT_SECRET);
  const occurredAt = parseCommissionDate(item.created_at, new Date());
  const day = occurredAt.toISOString().slice(0, 10);
  // Atomic insert + aggregates: a retry cannot silently double-count or lose totals.
  return db.transaction(async (tx) => {
    if (productSlug) {
      await tx.insert(affiliateProducts).values({
        slug: productSlug, title: title || productSlug, url: safeProductUrl(item),
        platform: "digistore24", conversionCount: 0, revenueCents: 0,
      }).onConflictDoNothing({target:affiliateProducts.slug});
    }
    const rows = await tx.insert(conversionEvents).values({
      orderKey, productSlug, eventType: kind, amountCents, commissionCents: commissionAmount, currency,
      buyerEmailHash, rawPayload: minimalCommissionPayload(item), occurredAt,
    }).onConflictDoNothing({target:conversionEvents.orderKey}).returning({id:conversionEvents.id});
    if (rows.length === 0) return "duplicate" as const;
    if (productSlug) await tx.execute(sql`
      UPDATE affiliate_products SET "conversionCount"="conversionCount"+1,
        "revenueCents"="revenueCents"+${commissionAmount}, "updatedAt"=now()
      WHERE slug=${productSlug}`);
    await tx.execute(sql`
      INSERT INTO revenue_daily_stats ("day","conversions","revenueCents")
      VALUES (${day},1,${commissionAmount}) ON CONFLICT ("day") DO UPDATE SET
      "conversions"=revenue_daily_stats."conversions"+1,
      "revenueCents"=revenue_daily_stats."revenueCents"+${commissionAmount}, "updatedAt"=now()`);
    return "inserted" as const;
  });
}
/** Zieht Commissionen der letzten N Tage (Default 30) idempotent in die DB. */
let syncActive = false;
export async function syncDigistore24Commissions(sinceDays = 30): Promise<D24SyncResult> {
  const result: D24SyncResult = {ok:true,paymentsFetched:0,refundsFetched:0,inserted:0,duplicates:0,pages:0,rejected:0,mode:"unavailable"};
  if (syncActive) return {...result,ok:false,detail:"D24_SYNC_ALREADY_RUNNING"};
  const apiKey = process.env.DIGISTORE24_API_KEY;
  if (!apiKey?.trim()) return {...result,ok:false,detail:"D24_API_NOT_CONFIGURED"};
  if (!shouldPollCommissions({apiKey,ipnSecret:resolveDigistore24IpnSecret()}))
    return {...result,mode:"ipn_primary",detail:"D24_IPN_PRIMARY_POLLING_SKIPPED"};
  syncActive = true;
  result.mode = "polling";
  try {
    const days = boundedSyncDays(sinceDays);
    for (const [type,kind] of [["payment","sale"],["refund","refund"],["chargeback","chargeback"]] as const) {
      const batch = await fetchAllCommissions(type,days);
      result.pages += batch.pages;
      if (kind === "sale") result.paymentsFetched += batch.items.length;
      else result.refundsFetched += batch.items.length;
      for (const item of batch.items) {
        try {
          const outcome = await recordCommission(item,kind);
          if (outcome === "inserted") result.inserted++;
          else result.duplicates++;
        } catch (error) {
          const code = error instanceof Error ? error.message : "D24_RECORD_ERROR";
          if (code.startsWith("D24_MISSING_") || code.startsWith("D24_INVALID_") || code.startsWith("D24_AMOUNT_")) {
            result.rejected++;
            continue;
          }
          throw error;
        }
      }
    }
    if (result.rejected) {result.ok=false;result.detail="D24_INVALID_RECORDS_REJECTED";}
  } catch (error) {
    result.ok=false;
    const message = error instanceof Error ? error.message : "";
    result.detail = /^D24_[A-Z_]+$/.test(message) ? message : "D24_UPSTREAM_OR_DB_ERROR";
  } finally {syncActive=false;}
  return result;
}
