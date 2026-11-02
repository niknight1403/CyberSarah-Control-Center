/**
 * AI Influenza Team — Katalog ausfuehren (Stripe live, Digistore24 nur geplant).
 *
 * Der Plan allein hilft dem Autopiloten nicht. Dieser Schritt macht daraus
 * echte Stripe-Produkte und -Preise — aber nur, wenn es ausdruecklich erlaubt
 * ist (`AI_INFLUENZA_CATALOG_AUTOCREATE=1`). Ohne diese Freigabe laeuft der
 * Schritt als Trockenlauf und meldet, was er tun wuerde.
 *
 * Digistore24 bleibt bewusst beim Plan: der Zahlungsplan braucht eine
 * menschliche Bestaetigung (Intervall-Vokabular ungeprueft) und das Produkt
 * braucht Verkaufs- und Danke-Seite. Ein Cron-Lauf soll das nicht raten.
 *
 * Fehler einzelner Pakete brechen den Lauf nicht ab: sie landen als Blocker im
 * Ergebnis, damit der naechste Cron-Lauf es erneut versucht, ohne den Rest zu
 * verlieren.
 */
import Stripe from "stripe";
import {
  planSalesCatalog,
  type ChannelPlan
} from "../lib/ai-influenza-sales-channel-logic";
import type { AiInfluenzaPackageId } from "../lib/ai-influenza-team-logic";

export type SalesCatalogReused = {
  channel: "stripe";
  packageId: AiInfluenzaPackageId;
  priceId: string;
  envTarget?: string;
};

export type SalesCatalogCreated = {
  channel: "stripe";
  packageId: AiInfluenzaPackageId;
  productId: string;
  priceId: string;
  envTarget?: string;
};

export type SalesCatalogRunResult = {
  dryRun: boolean;
  plans: number;
  executed: number;
  skipped: number;
  needsReview: number;
  created: SalesCatalogCreated[];
  /** Bereits vorhandene Preise, per Lookup-Key gefunden statt neu angelegt. */
  reused: SalesCatalogReused[];
  blocked: string[];
  error: string | null;
};

export type StripeCatalogExecutor = {
  /** Vorhandenen Preis am Lookup-Key finden, damit kein zweiter entsteht. */
  findPriceByLookupKey: (lookupKey: string) => Promise<{ id: string } | null>;
  createProduct: (payload: Record<string, unknown>, options: { idempotencyKey: string }) => Promise<{ id: string }>;
  createPrice: (
    payload: Record<string, unknown>,
    options: { idempotencyKey: string }
  ) => Promise<{ id: string }>;
};

export type SalesCatalogDeps = {
  env?: Record<string, string | undefined>;
  executor?: StripeCatalogExecutor | null;
  /** Verkaufsseite/Danke-Seite fuer Digistore24, sofern vorhanden. */
  digistore24?: { salespageUrl?: string; thankyouUrl?: string; imageUrl?: string };
};

/** Echter Stripe-Zugriff; wird nur gebaut, wenn ein Schluessel da ist. */
export function createStripeCatalogExecutor(secretKey: string): StripeCatalogExecutor {
  const client = new Stripe(secretKey);
  return {
    async findPriceByLookupKey(lookupKey) {
      // Stripe erlaubt nur aktive Preise mit Lookup-Key; inaktive sind ersetzt.
      const listed = await client.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
      const first = listed.data?.[0];
      return first ? { id: first.id } : null;
    },
    async createProduct(payload, options) {
      const product = await client.products.create(payload as unknown as Stripe.ProductCreateParams, {
        idempotencyKey: options.idempotencyKey,
      });
      return { id: product.id };
    },
    async createPrice(payload, options) {
      const price = await client.prices.create(payload as unknown as Stripe.PriceCreateParams, {
        idempotencyKey: options.idempotencyKey,
      });
      return { id: price.id };
    },
  };
}

function isStripePlan(plan: ChannelPlan): boolean {
  return plan.channel === "stripe";
}

export async function runSalesCatalogStep(deps: SalesCatalogDeps = {}): Promise<SalesCatalogRunResult> {
  const env = deps.env ?? process.env;
  const plan = planSalesCatalog({ env, digistore24: deps.digistore24 });

  const blocked: string[] = [];
  for (const entry of plan.plans) {
    for (const blocker of entry.blockers) blocked.push(`${entry.channel}/${entry.packageId}: ${blocker}`);
  }

  const autoCreate = env.AI_INFLUENZA_CATALOG_AUTOCREATE === "1";
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const dryRun = !autoCreate || !secretKey;

  if (!secretKey) blocked.push("stripe: STRIPE_SECRET_KEY fehlt, Katalog bleibt unveraendert.");
  else if (!autoCreate) blocked.push("stripe: AI_INFLUENZA_CATALOG_AUTOCREATE nicht gesetzt, nur Trockenlauf.");

  const result: SalesCatalogRunResult = {
    dryRun,
    plans: plan.plans.length,
    executed: 0,
    skipped: plan.plans.filter((entry) => entry.action === "skip").length,
    needsReview: plan.needsReview,
    created: [],
    reused: [],
    blocked,
    error: null,
  };

  if (dryRun) return result;

  const executor = deps.executor ?? createStripeCatalogExecutor(secretKey);
  if (!executor) {
    result.blocked.push("stripe: kein Ausfuehrer verfuegbar.");
    return result;
  }

  for (const entry of plan.plans) {
    if (!isStripePlan(entry) || entry.action !== "create" || entry.blockers.length > 0) continue;

    const [productStep, priceStep] = entry.steps;
    if (!productStep || !priceStep) continue;

    try {
      // Zuerst nachsehen: Stripe-Idempotenz-Schluessel verfallen nach 24 Stunden.
      // Ohne diese Pruefung wuerde der naechste Tageslauf Produkte duplizieren.
      const lookupKey = String(priceStep.payload.lookup_key ?? "");
      if (lookupKey) {
        const existing = await executor.findPriceByLookupKey(lookupKey);
        if (existing) {
          result.reused.push({
            channel: "stripe",
            packageId: entry.packageId,
            priceId: existing.id,
            envTarget: entry.envTarget,
          });
          result.skipped += 1;
          continue;
        }
      }
      const product = await executor.createProduct(productStep.payload, {
        idempotencyKey: `${entry.idempotencyKey}-produkt`,
      });
      const price = await executor.createPrice(
        { ...priceStep.payload, product: product.id },
        { idempotencyKey: entry.idempotencyKey },
      );
      result.created.push({
        channel: "stripe",
        packageId: entry.packageId,
        productId: product.id,
        priceId: price.id,
        envTarget: entry.envTarget,
      });
      result.executed += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Stripe-Aufruf fehlgeschlagen";
      result.blocked.push(`stripe/${entry.packageId}: ${message}`);
      result.error = result.error ?? message;
    }
  }

  return result;
}
