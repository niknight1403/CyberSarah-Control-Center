/**
 * Administrator-only, read-only Stripe catalogue. Does NOT import offers,
 * change live checkout prices, charge customers, or publish content.
 */
import Stripe from "stripe";
import { stripeAdminSettings } from "../lib/stripe-admin-status-logic";
import { projectStripeCatalog } from "../lib/stripe-catalog-projection";

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
type CatalogResult = ReturnType<typeof projectStripeCatalog> & {
  mode: "live" | "test";
  fetchedAt: string;
  readOnly: true;
};
let cache: { key: string; expiresAt: number; data: CatalogResult } | null = null;

export async function collectPages<T extends { id: string }>(
  list: (args: { limit: number; starting_after?: string }) => Promise<{ data: T[]; has_more: boolean }>,
): Promise<{ rows: T[]; complete: boolean }> {
  const rows: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await list({ limit: PAGE_SIZE, ...(cursor ? { starting_after: cursor } : {}) });
    if (!Array.isArray(response.data)) throw new Error("Stripe Katalogantwort unvollstaendig.");
    rows.push(...response.data);
    if (!response.has_more) return { rows, complete: true };
    const last = response.data.at(-1)?.id;
    if (!last || last === cursor || page === MAX_PAGES - 1) {
      return { rows, complete: false };
    }
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
  if (cache && cache.key === key && cache.expiresAt > Date.now()) return cache.data;
  const client = new Stripe(key, { timeout: 10_000, maxNetworkRetries: 1 });
  // Explicitly read inactive products/prices too. Do not silently omit
  // variants that are retired and might still be referenced in billing.
  const [products, prices] = await Promise.all([
    collectPages(args => client.products.list(args)),
    collectPages(args => client.prices.list(args)),
  ]);
  const data: CatalogResult = {
    ...projectStripeCatalog(products.rows, prices.rows, products.complete, prices.complete),
    mode: settings.mode, readOnly: true,
    fetchedAt: new Date().toISOString(),
  };
  cache = { key, expiresAt: Date.now() + 2 * 60_000, data };
  return data;
}
