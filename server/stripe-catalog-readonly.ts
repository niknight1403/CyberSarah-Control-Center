/**
 * Administrator-only, read-only Stripe catalogue. Does NOT import offers,
 * change live checkout prices, charge customers, or publish content.
 */
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { revenueOffers } from "../drizzle/schema";
import { reconcileStripeOfferRefs } from "../lib/stripe-offer-reconciliation";
import { stripeAdminSettings } from "../lib/stripe-admin-status-logic";
import { projectStripeCatalog } from "../lib/stripe-catalog-projection";
import {
  applySyncAttempt,
  classifySyncError,
  providerSyncReport,
  type ProviderSyncState,
} from "../lib/provider-sync-recovery-logic";

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
type CatalogResult = ReturnType<typeof projectStripeCatalog> & {
  mode: "live" | "test";
  fetchedAt: string;
  readOnly: true;
  localOfferReconciliation: ReturnType<typeof reconcileStripeOfferRefs> | null;
  localOfferStatus: "checked" | "unavailable";
  providerSync: ReturnType<typeof providerSyncReport>;
};
let cache: { key: string; expiresAt: number; data: Omit<CatalogResult, "providerSync"> } | null = null;

/**
 * Sprint 29 - Sync-Zustand je Stripe-Provider (produkte/preise). Entsteht nur
 * aus echten Versuchen dieser Instanz; nie aus Annahmen.
 */
const providerSyncStates = new Map<string, ProviderSyncState>();

export function readStripeProviderSyncReport(now = Date.now()) {
  return providerSyncReport([...providerSyncStates.values()], now);
}

async function trackProvider<T>(provider: string, run: () => Promise<T>): Promise<T> {
  const at = Date.now();
  try {
    const result = await run();
    providerSyncStates.set(provider, applySyncAttempt(providerSyncStates.get(provider), { provider, at, ok: true }));
    return result;
  } catch (error) {
    const { errorClass, message } = classifySyncError(error);
    const state = applySyncAttempt(providerSyncStates.get(provider), {
      provider,
      at,
      ok: false,
      errorClass,
      errorMessage: message,
    });
    providerSyncStates.set(provider, state);
    const enriched = new Error(`${provider}: ${state.lastErrorMessage ?? message}`) as Error & {
      providerSync?: ProviderSyncState;
    };
    enriched.providerSync = state;
    throw enriched;
  }
}

export async function collectPages<T extends { id: string }>(
  list: (args: { limit: number; starting_after?: string }) => Promise<{ data: T[]; has_more: boolean }>,
): Promise<{ rows: T[]; complete: boolean }> {
  const rows: T[] = [];
  const visitedCursors = new Set<string>();
  const seenIds = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await list({ limit: PAGE_SIZE, ...(cursor ? { starting_after: cursor } : {}) });
    if (!response || !Array.isArray(response.data) || typeof response.has_more !== "boolean") {
      throw new Error("Stripe Katalogantwort unvollstaendig oder Pagination ungueltig.");
    }
    if (response.data.length > PAGE_SIZE || response.data.some(item => !item || typeof item.id !== "string" || !item.id)) {
      throw new Error("Stripe lieferte ungueltige Katalogeintraege.");
    }
    // The cursor must advance. Duplicate page boundaries can be stale snapshots;
    // never claim that the entire catalog has been read.
    const last = response.data.at(-1)?.id;
    if (cursor && response.data[0]?.id === cursor) return { rows, complete: false };
    for (const entry of response.data) {
      if (seenIds.has(entry.id)) return { rows, complete: false };
      seenIds.add(entry.id);
      rows.push(entry);
    }
    if (!response.has_more) return { rows, complete: true };
    if (!last || last === cursor || visitedCursors.has(last) || page === MAX_PAGES - 1) {
      return { rows, complete: false };
    }
    visitedCursors.add(last);
    cursor = last;
  }
  return { rows, complete: false };
}
export async function readStripeAdminCatalog(): Promise<CatalogResult> {
  const settings = stripeAdminSettings(process.env);
  if (settings.phase !== "configured" || !settings.mode) {
    throw new Error("Stripe ist nicht korrekt serverseitig konfiguriert.");
  }
  const key = process.env.STRIPE_SECRET_KEY!.trim();
  if (cache && cache.key === key && cache.expiresAt > Date.now()) {
    return { ...cache.data, providerSync: readStripeProviderSyncReport() };
  }
  const client = new Stripe(key, { timeout: 10_000, maxNetworkRetries: 1 });
  // Explicitly read inactive products/prices too. Do not silently omit
  // variants that are retired and might still be referenced in billing.
  const [products, prices] = await Promise.all([
    trackProvider("stripe.products", () => collectPages(args => client.products.list(args))),
    trackProvider("stripe.prices", () => collectPages(args => client.prices.list(args))),
  ]);
  const projected = projectStripeCatalog(products.rows, prices.rows, products.complete, prices.complete);
  let localOfferReconciliation: ReturnType<typeof reconcileStripeOfferRefs> | null = null;
  try {
    const db = await getDb();
    if (db) {
      const rows = await db.select({ id: revenueOffers.id, metadata: revenueOffers.metadata })
        .from(revenueOffers)
        .where(sql`${revenueOffers.metadata}->>'source' = 'stripe'`)
        .limit(1001);
      localOfferReconciliation = reconcileStripeOfferRefs(
        rows, new Set(projected.products.map(p => p.id)), projected.complete, rows.length <= 1000,
      );
    }
  } catch {
    // Database unavailable must never become a false "0 orphan offers" result.
  }
  const data: CatalogResult = {
    ...projected, mode: settings.mode, readOnly: true,
    localOfferStatus: localOfferReconciliation ? "checked" : "unavailable",
    localOfferReconciliation,
    providerSync: readStripeProviderSyncReport(),
    fetchedAt: new Date().toISOString(),
  };
  const { providerSync: _liveSync, ...cacheable } = data;
  cache = { key, expiresAt: Date.now() + 2 * 60_000, data: cacheable };
  return data;
}
