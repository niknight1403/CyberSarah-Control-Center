/**
 * CyberSarah Control Center — Produkt-Autopilot (Digistore24).
 *
 * Legt Produkte selbststaendig an: Produkt, Preisplan, Katalogzeile im eigenen
 * Dashboard. Die Ideen stehen in config/product-ideas.json (versioniert, mit
 * Begruendung und Freigabe-Flag). Der Autopilot erfindet keine Produkte und
 * keine Umsaetze.
 *
 * Ablauf je Lauf:
 *   1. Tageslauf-Sperre ueber revenue_jobs (dedupe_key) — ein Lauf pro Tag,
 *      sofern nicht ausdruecklich erzwungen.
 *   2. listProducts bei Digistore24 lesen (Duplikat-Schutz auch ohne lokale Zeile).
 *   3. Fuer jede faellige Idee: createProduct, dann createPaymentPlan.
 *   4. Ergebnis in revenue_offers (kind=digistore24_product) und
 *      affiliate_products festhalten, damit das Dashboard das Produkt kennt,
 *      bevor der erste Verkauf eintrifft.
 *
 * Wichtig: Digistore24 gibt Produkte erst nach manueller Freigabe im Konto
 * frei. Der Status ist deshalb "awaiting_approval" und nicht "live".
 */

import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { sql } from "drizzle-orm";
import { affiliateProducts, revenueJobs, revenueOffers } from "../drizzle/schema";
import { getDb } from "./db";
import {
  buildCreateProductParams, buildPaymentPlanParams, catalogSlug, checkoutUrl,
  intervalLabel, planNextProducts, readCreatedPaymentPlanId, readCreatedProductId,
  safeErrorMessage, summarizeRun, MAX_PRODUCTS_PER_RUN, MAX_AUTOPILOT_PRODUCTS_TOTAL,
  parseProductIdeas, type ProductIdea,
} from "../lib/product-autopilot-logic";

const API_BASE = "https://www.digistore24.com/api/call";
const OFFER_KIND = "digistore24_product";
const JOB_KIND = "product_autopilot";
const MAX_ATTEMPTS = 3;
const DEFAULT_THANKYOU = "https://app.cybersarah-ki.com/";

export type AutopilotRunOptions = {
  maxProducts?: number;
  dryRun?: boolean;
  /** Tageslauf-Sperre umgehen (nur fuer manuelle Laeufe). */
  force?: boolean;
};

export type AutopilotRunResult = {
  ok: boolean;
  mode: "live" | "dry_run" | "blocked";
  detail?: string;
  created: Array<{ slug: string; productId: string; paymentPlanId: string; checkoutUrl: string }>;
  skipped: Array<{ slug: string; reason: string }>;
  failed: Array<{ slug: string; error: string }>;
  remaining: number;
  ideas: number;
};

function ideasFilePath(): string {
  const candidates = [
    process.env.PRODUCT_IDEAS_FILE?.trim(),
    path.join(process.cwd(), "config", "product-ideas.json"),
    path.resolve(__dirname, "..", "config", "product-ideas.json"),
  ].filter((entry): entry is string => Boolean(entry));
  for (const candidate of candidates) {
    try { if (fs.existsSync(candidate)) return candidate; } catch { /* naechster Pfad */ }
  }
  return "";
}

/** Liest den Ideen-Katalog. Fehlt er, gibt es einen ehrlichen Fehler statt Fake-Ideen. */
export function loadProductIdeas(): { ideas: ProductIdea[]; error?: string } {
  const file = ideasFilePath();
  if (!file) return { ideas: [], error: "Ideenkatalog config/product-ideas.json nicht gefunden." };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const ideas = parseProductIdeas(parsed);
    if (!ideas.length) return { ideas: [], error: "Ideenkatalog enthaelt keine gueltige Idee." };
    return { ideas };
  } catch (error) {
    return { ideas: [], error: `Ideenkatalog unlesbar: ${safeErrorMessage(error)}` };
  }
}

async function d24Call(fn: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const apiKey = process.env.DIGISTORE24_API_KEY?.trim();
  if (!apiKey) throw new Error("DIGISTORE24_API_KEY nicht konfiguriert.");
  const response = await axios.get<Record<string, unknown>>(`${API_BASE}/${fn}`, {
    params,
    headers: { "X-DS-API-KEY": apiKey, Accept: "application/json" },
    timeout: 30000,
    validateStatus: () => true,
  });
  const body = response.data ?? {};
  const result = String((body as { result?: unknown }).result ?? "");
  if (result === "error") {
    const message = String((body as { message?: unknown }).message ?? "unbekannter Fehler");
    throw new Error(`${fn}: ${message}`);
  }
  return body;
}

function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

type OfferMeta = {
  ideaSlug?: string;
  digistoreProductId?: string;
  paymentPlanId?: string;
  interval?: string;
  intervalLabel?: string;
  rationale?: string;
  attempts?: number;
  error?: string;
  source?: string;
};

async function existingRows(): Promise<Array<{ id: number; name: string; status: string; metadata: OfferMeta }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: revenueOffers.id, name: revenueOffers.name, status: revenueOffers.status, metadata: revenueOffers.metadata })
    .from(revenueOffers)
    .where(sql`${revenueOffers.kind} = ${OFFER_KIND}`);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    metadata: (row.metadata ?? {}) as OfferMeta,
  }));
}

async function remoteProductNames(): Promise<string[]> {
  try {
    const body = await d24Call("listProducts", { page_no: "1", page_size: "200" });
    const data = (body.data ?? {}) as { products?: Array<Record<string, unknown>> };
    return (data.products ?? [])
      .flatMap((product) => [product.name_intern, product.name, product.name_de])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  } catch {
    // Ohne Fernliste bleibt der lokale Duplikat-Schutz; ein Ausfall darf den
    // Lauf nicht stillschweigend als "alles neu" behandeln.
    return [];
  }
}

/** Tageslauf-Sperre: liefert true, wenn dieser Tag schon gelaufen ist. */
async function claimDailyRun(force: boolean): Promise<{ claimed: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) return { claimed: false, reason: "Datenbank nicht verfuegbar." };
  const key = `product-autopilot:${dayKey()}`;
  if (force) return { claimed: true };
  const inserted = await db
    .insert(revenueJobs)
    .values({ dedupeKey: key, kind: JOB_KIND, status: "running", payload: { startedAt: new Date().toISOString() } })
    .onConflictDoNothing()
    .returning({ id: revenueJobs.id });
  if (!inserted.length) return { claimed: false, reason: "Tageslauf existiert bereits." };
  return { claimed: true };
}

async function finishJob(status: string, result: Record<string, unknown>, error?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(revenueJobs)
    .set({ status, result, lastError: error ?? null, updatedAt: new Date() })
    .where(sql`${revenueJobs.dedupeKey} = ${`product-autopilot:${dayKey()}`}`);
}

async function persistProduct(idea: ProductIdea, productId: string, planId: string, attempts: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const url = checkoutUrl(productId);
  const metadata: OfferMeta = {
    ideaSlug: idea.slug,
    digistoreProductId: productId,
    paymentPlanId: planId,
    interval: idea.interval,
    intervalLabel: intervalLabel(idea),
    rationale: idea.rationale,
    attempts,
    source: "autopilot",
  };
  const existing = await db
    .select({ id: revenueOffers.id })
    .from(revenueOffers)
    .where(sql`${revenueOffers.kind} = ${OFFER_KIND} and ${revenueOffers.metadata}->>'ideaSlug' = ${idea.slug}`)
    .limit(1);
  if (existing.length) {
    await db.update(revenueOffers).set({
      name: idea.name, status: "awaiting_approval", priceCents: idea.priceCents,
      targetUrl: url, metadata, updatedAt: new Date(),
    }).where(sql`${revenueOffers.id} = ${existing[0].id}`);
  } else {
    await db.insert(revenueOffers).values({
      kind: OFFER_KIND, name: idea.name, status: "awaiting_approval",
      priceCents: idea.priceCents, targetUrl: url, metadata,
    });
  }
  await db.insert(affiliateProducts).values({
    slug: catalogSlug(productId),
    title: idea.name,
    url,
    platform: "digistore24",
  }).onConflictDoNothing();
}

async function markFailure(idea: ProductIdea, attempts: number, error: string, productId?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const status = attempts >= MAX_ATTEMPTS ? "failed" : "retry";
  const metadata: OfferMeta = {
    ideaSlug: idea.slug,
    digistoreProductId: productId,
    attempts,
    error,
    source: "autopilot",
  };
  const existing = await db
    .select({ id: revenueOffers.id })
    .from(revenueOffers)
    .where(sql`${revenueOffers.kind} = ${OFFER_KIND} and ${revenueOffers.metadata}->>'ideaSlug' = ${idea.slug}`)
    .limit(1);
  if (existing.length) {
    await db.update(revenueOffers).set({ status, metadata, updatedAt: new Date() })
      .where(sql`${revenueOffers.id} = ${existing[0].id}`);
  } else {
    await db.insert(revenueOffers).values({
      kind: OFFER_KIND, name: idea.name, status, priceCents: idea.priceCents, metadata,
    });
  }
}

export async function runProductAutopilot(options: AutopilotRunOptions = {}): Promise<AutopilotRunResult> {
  const maxProducts = options.maxProducts ?? 1;
  const dryRun = options.dryRun === true;
  const base: AutopilotRunResult = {
    ok: false, mode: "blocked", created: [], skipped: [], failed: [], remaining: 0, ideas: 0,
  };
  if (!process.env.DIGISTORE24_API_KEY?.trim()) {
    return { ...base, detail: "DIGISTORE24_API_KEY nicht konfiguriert." };
  }
  const { ideas, error } = loadProductIdeas();
  base.ideas = ideas.length;
  if (error || !ideas.length) return { ...base, detail: error ?? "Kein Ideenkatalog." };
  if (dryRun) {
    const plan = planNextProducts({
      ideas, localSlugs: new Set(), remoteNames: [], maxProducts, totalCreated: 0,
    });
    return {
      ...base, ok: true, mode: "dry_run",
      skipped: plan.skipped,
      remaining: plan.toCreate.length,
      detail: `Trockenlauf: ${plan.toCreate.map((idea) => idea.slug).join(", ") || "nichts faellig"}`,
    };
  }
  const claim = await claimDailyRun(options.force === true);
  if (!claim.claimed) return { ...base, ideas: ideas.length, detail: claim.reason };

  try {
    const rows = await existingRows();
    const settled = rows.filter((row) => row.status !== "failed");
    const localSlugs = new Set(settled.map((row) => row.metadata.ideaSlug).filter((slug): slug is string => Boolean(slug)));
    const completed = settled.filter((row) => row.metadata.digistoreProductId).length;
    const plan = planNextProducts({
      ideas,
      localSlugs,
      remoteNames: await remoteProductNames(),
      maxProducts,
      totalCreated: completed,
    });

    const result: AutopilotRunResult = {
      ...base, ok: true, mode: "live", skipped: plan.skipped,
      remaining: Math.max(0, MAX_AUTOPILOT_PRODUCTS_TOTAL - completed - plan.toCreate.length),
    };

    for (const idea of plan.toCreate) {
      const previous = rows.find((row) => row.metadata.ideaSlug === idea.slug);
      const attempts = (previous?.metadata.attempts ?? 0) + 1;
      let productId = previous?.metadata.digistoreProductId;
      try {
        if (!productId) {
          const created = await d24Call("createProduct", buildCreateProductParams(idea, { thankYouUrl: DEFAULT_THANKYOU }));
          const parsed = readCreatedProductId(created);
          if (!parsed) throw new Error("createProduct lieferte keine Produkt-ID.");
          productId = parsed;
        }
        const planBody = await d24Call("createPaymentPlan", buildPaymentPlanParams(idea, productId));
        const planId = readCreatedPaymentPlanId(planBody);
        if (!planId) throw new Error("createPaymentPlan lieferte keine Plan-ID.");
        await persistProduct(idea, productId, planId, attempts);
        result.created.push({ slug: idea.slug, productId, paymentPlanId: planId, checkoutUrl: checkoutUrl(productId) });
      } catch (error) {
        const message = safeErrorMessage(error);
        await markFailure(idea, attempts, message, productId);
        result.failed.push({ slug: idea.slug, error: message });
      }
    }

    await finishJob(
      result.failed.length ? "completed_with_errors" : "completed",
      { created: result.created.length, skipped: result.skipped.length, failed: result.failed.length },
      result.failed.length ? summarizeRun(result) : undefined,
    );
    return result;
  } catch (error) {
    const message = safeErrorMessage(error);
    await finishJob("failed", { created: 0 }, message);
    return { ...base, ideas: ideas.length, detail: message, mode: "blocked" };
  }
}

/** Statusbericht fuer Dashboard und Betrieb. */
export async function productAutopilotStatus(): Promise<Record<string, unknown>> {
  const { ideas, error } = loadProductIdeas();
  const rows = await existingRows();
  const db = await getDb();
  const lastRun = db
    ? (await db.select({ status: revenueJobs.status, result: revenueJobs.result, lastError: revenueJobs.lastError, updatedAt: revenueJobs.updatedAt })
        .from(revenueJobs)
        .where(sql`${revenueJobs.kind} = ${JOB_KIND}`)
        .orderBy(sql`${revenueJobs.updatedAt} desc`)
        .limit(1))[0] ?? null
    : null;
  return {
    ok: !error,
    detail: error,
    apiKeyConfigured: Boolean(process.env.DIGISTORE24_API_KEY?.trim()),
    ideasTotal: ideas.length,
    ideasApproved: ideas.filter((idea) => idea.approved).length,
    products: rows.map((row) => ({
      slug: row.metadata.ideaSlug ?? row.name,
      name: row.name,
      status: row.status,
      productId: row.metadata.digistoreProductId ?? null,
      paymentPlanId: row.metadata.paymentPlanId ?? null,
      attempts: row.metadata.attempts ?? 0,
      error: row.metadata.error ?? null,
    })),
    lastRun,
    limits: { maxProductsPerRun: MAX_PRODUCTS_PER_RUN, maxProductsTotal: MAX_AUTOPILOT_PRODUCTS_TOTAL },
  };
}
