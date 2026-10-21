/**
 * CyberSarah Control Center — Digistore24 Affiliate Engine: Server-Adapter
 * + Router (Phase 2 der Revenue-OS-Mission, 2026-10-21).
 *
 * Autonome Kette (HITL am Ende, wie vom Nutzer gefordert):
 *   1. discover: laedt den oeffentlichen Digistore24-Marketplace (8s-Timeout),
 *      parst echte Produkte und laesst das LLM nach Provision/Conversion/
 *      Nachfrage bewerten — nie erfundene Treffer, ehrliche Fehler.
 *   2. funnel: generiert fuer ein Produkt den kompletten Launch-Funnel
 *      (Landingpage, E-Mail-Sequenz, Sales-Copy, Traffic-Plan) und legt ihn
 *      als "revenue-loop"-Entwurf in der Freigabe-Queue ab:
 *      Titel = "Produkt X ist bereit zum Start. Bitte bestätigen."
 *      Erst die manuelle Freigabe im Control Center schaltet live.
 *
 * 0 EUR, 0 API-Keys (marketplace-Scraping) — ein optionaler
 * DIGISTORE24_API_KEY-Auswertungspfad kann spaeter ergänzt werden.
 */

import axios from "axios";
import { z } from "zod";
import { router, adminProcedure } from "./_core/trpc";
import { syncDigistore24Commissions } from "./digistore24-api";
import { invokeLLM, type Message } from "./_core/llm";
import { countPendingDraftsByKind, insertPendingDraft } from "./draft-engine";
import { getDb } from "./db";
import { affiliateProducts, conversionEvents, funnelCampaigns } from "../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import {
  renderLandingHtml,
  slugifyLanding,
  validateFunnelForLaunch,
  type LandingFunnelPayload,
} from "../lib/digistore24-launch-logic";
import { DRAFT_MAX_PENDING_PER_KIND, type RevenueLoopDraftPayload } from "../lib/draft-engine-logic";
import {
  buildEvaluationMessages,
  buildFunnelMessages,
  buildMarketplaceUrl,
  parseDigistoreProducts,
  parseEvaluations,
  parseFunnel,
  type DigistoreEvaluation,
  type DigistoreProduct,
} from "../lib/digistore24-logic";

const USER_AGENT =
  process.env.DIGISTORE24_USER_AGENT ??
  "Mozilla/5.0 (compatible; CyberSarahControlCenter/4.1; +https://github.com/niknight1403/CyberSarah-Control-Center)";

async function callLlm(messages: Message[], maxTokens: number): Promise<string> {
  const result = await invokeLLM({ model: "gpt-4o-mini", maxTokens, messages });
  const content = result.choices[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

/** Laedt den Marketplace und parst echte Produkte (nie werfend). */
async function fetchMarketplaceProducts(): Promise<{ products: DigistoreProduct[]; ok: boolean; detail: string }> {
  try {
    const response = await axios.get<string>(buildMarketplaceUrl(), {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html", "Accept-Language": "de-DE,de;q=0.9" },
      timeout: 8_000,
      responseType: "text",
      validateStatus: (status) => status === 200,
      maxRedirects: 3,
    });
    const products = parseDigistoreProducts(typeof response.data === "string" ? response.data : "");
    if (products.length === 0) {
      return { products, ok: false, detail: "Marketplace erreichbar, aber keine Produkt-Links erkannt (Layout geändert?)." };
    }
    return { products, ok: true, detail: `${products.length} Produkte aus dem Marketplace geparst.` };
  } catch (error) {
    return {
      products: [],
      ok: false,
      detail: `Digistore24-Marketplace momentan nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Entdeckt und bewertet Produkte: Provision/Conversion/Nachfrage. */
async function discoverDigistoreProducts(): Promise<{
  evaluations: DigistoreEvaluation[];
  productCount: number;
  ok: boolean;
  detail: string;
}> {
  const market = await fetchMarketplaceProducts();
  if (!market.ok) {
    return { evaluations: [], productCount: 0, ok: false, detail: market.detail };
  }
  try {
    const raw = await callLlm(buildEvaluationMessages(market.products), 900);
    const evaluations = parseEvaluations(raw, market.products);
    if (evaluations.length === 0) {
      return { evaluations: [], productCount: market.products.length, ok: false, detail: "LLM-Antwort enthielt keine verwertbaren Bewertungen." };
    }
    return { evaluations, productCount: market.products.length, ok: true, detail: `${evaluations.length} Produkte bewertet (aus ${market.products.length}).` };
  } catch (error) {
    return {
      evaluations: [],
      productCount: market.products.length,
      ok: false,
      detail: `Bewertungs-LLM nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Generiert den Launch-Funnel und legt ihn in der Freigabe-Queue ab. */
async function generateDigistoreFunnel(slug: string, productTitle: string): Promise<{
  queued: boolean;
  ok: boolean;
  detail: string;
  funnel?: { name: string; metric: string; stages: number };
}> {
  const product: DigistoreProduct = {
    slug,
    title: productTitle,
    url: `https://www.digistore24.com/product/${slug}/`,
  };
  try {
    const pending = await countPendingDraftsByKind();
    if (pending === null) {
      return { queued: false, ok: false, detail: "Datenbank nicht konfiguriert — Funnel nicht speicherbar." };
    }
    if ((pending["revenue-loop"] ?? 0) >= DRAFT_MAX_PENDING_PER_KIND) {
      return { queued: false, ok: false, detail: `Freigabe-Queue voll (${pending["revenue-loop"]} offene Revenue-Loops). Bitte erst bestätigen.` };
    }
    const raw = await callLlm(buildFunnelMessages(product), 1200);
    const funnel = parseFunnel(raw);
    if (!funnel) {
      return { queued: false, ok: false, detail: "LLM-Antwort enthielt keinen vollständigen Funnel (Name/Hypothese/Stages/Metrik)." };
    }
    const payload: RevenueLoopDraftPayload = {
      name: `Digistore24: ${funnel.name} (${productTitle})`,
      hypothesis: funnel.hypothesis,
      stages: funnel.stages,
      metric: funnel.metric,
    };
    await insertPendingDraft(
      "revenue-loop",
      `Produkt bereit zum Start: ${productTitle} — bitte bestätigen`,
      payload,
      "digistore24-engine"
    );

    // Block 4: Produkt upserten und Kampagne fuer den One-Click-Launch anlegen.
    try {
      const db = await getDb();
      if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
      const inserted = await db
        .insert(affiliateProducts)
        .values({ slug: product.slug, title: productTitle, url: product.url })
        .onConflictDoUpdate({
          target: affiliateProducts.slug,
          set: { title: productTitle, url: product.url, updatedAt: new Date() },
        })
        .returning({ id: affiliateProducts.id });
      const productId = inserted[0]?.id;
      if (productId) {
        await db.insert(funnelCampaigns).values({
          productId,
          name: funnel.name,
          hypothesis: funnel.hypothesis,
          stages: funnel.stages,
          metric: funnel.metric,
          landingJson: {
            headline: funnel.headline ?? funnel.name,
            subheadline: funnel.subheadline ?? "",
            benefits: funnel.benefits ?? funnel.stages,
            ctaText: funnel.ctaText ?? "Jetzt Zugang sichern",
            audience: funnel.audience ?? "",
            keywords: funnel.keywords ?? [],
          },
        });
      }
    } catch (persistError) {
      return {
        queued: true,
        ok: false,
        detail: `Funnel in Freigabe-Queue, aber Persistenz fehlgeschlagen: ${
          persistError instanceof Error ? persistError.message : String(persistError)
        }`,
      };
    }
    return {
      queued: true,
      ok: true,
      detail: "Funnel komplett (Landingpage, E-Mails, Sales-Copy, Traffic-Plan) — wartet auf manuelle Bestätigung.",
      funnel: { name: funnel.name, metric: funnel.metric, stages: funnel.stages.length },
    };
  } catch (error) {
    return { queued: false, ok: false, detail: `Funnel-Generierung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Kampagnen-Verwaltung: One-Click-Launch (Block 4, HITL-Freigabe). */
async function launchCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) return { ok: false as const, reason: "Die Kontodatenbank ist nicht verfuegbar." };
  const rows = await db.select().from(funnelCampaigns).where(eq(funnelCampaigns.id, campaignId)).limit(1);
  const campaign = rows[0];
  if (!campaign) return { ok: false as const, reason: "Kampagne nicht gefunden." };

  const productRows = await db
    .select()
    .from(affiliateProducts)
    .where(eq(affiliateProducts.id, campaign.productId))
    .limit(1);
  const product = productRows[0];

  const funnel = (campaign.landingJson ?? null) as LandingFunnelPayload | null;
  const check = validateFunnelForLaunch({
    productTitle: product?.title ?? null,
    affiliateUrl: product?.url ?? null,
    funnel,
  });
  if (!check.ok) {
    return { ok: false as const, reason: check.reason };
  }

  const slug = slugifyLanding(campaign.name);
  const affiliateUrl = product!.url!;
  await db
    .update(funnelCampaigns)
    .set({ status: "live", slug, affiliateUrl, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(funnelCampaigns.id, campaignId));
  return {
    ok: true as const,
    landingUrl: `/landings/${slug}`,
    affiliateUrl,
  };
}

export const digistore24Router = router({
  /** Phase 2.1: Produkte entdecken und bewerten. */
  discover: adminProcedure.query(async () => discoverDigistoreProducts()),

  /** API-Sync (2026-10-21): Commissionen via Digistore24-REST-API ziehen. */
  pullCommissions: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).optional() }).optional())
    .mutation(async ({ input }) => syncDigistore24Commissions(input?.days ?? 30)),

  /** Phase 2.2/2.3: Launch-Funnel generieren und zur Bestätigung einreihen. */
  funnel: adminProcedure
    .input(
      z.object({
        slug: z.string().trim().min(3).max(200),
        productTitle: z.string().trim().min(4).max(300),
      })
    )
    .mutation(async ({ input }) => generateDigistoreFunnel(input.slug, input.productTitle)),

  /** Block 4: Alle Kampagnen mit Status und Landing-URLs (Admin-Uebersicht). */
  campaigns: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
    const rows = await db.select().from(funnelCampaigns).orderBy(desc(funnelCampaigns.createdAt)).limit(100);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      hypothesis: r.hypothesis,
      status: r.status,
      slug: r.slug ?? null,
      affiliateUrl: r.affiliateUrl ?? null,
      createdAt: r.createdAt,
    }));
  }),

  /** Block 4: One-Click-Launch — schaltet eine Kampagne nach Pruefung live. */
  launch: adminProcedure
    .input(z.object({ campaignId: z.number().int().positive() }))
    .mutation(async ({ input }) => launchCampaign(input.campaignId)),

  /** Block 4: Kampagne pausieren (Landing wird sofort unauffindbar). */
  revoke: adminProcedure
    .input(z.object({ campaignId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
      await db
        .update(funnelCampaigns)
        .set({ status: "paused", updatedAt: new Date() })
        .where(eq(funnelCampaigns.id, input.campaignId));
      return { ok: true as const };
    }),

  /** Block 4: Woechentlicher Wachstums-Report — ganze Funnel-Messkette live. */
  growthReport: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
    const campaigns = await db.select().from(funnelCampaigns).orderBy(desc(funnelCampaigns.createdAt)).limit(100);
    const events = await db.select().from(conversionEvents).orderBy(desc(conversionEvents.occurredAt)).limit(500);
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const weekEvents = events.filter((e) => new Date(e.occurredAt) >= since);
    const revenueCents = weekEvents.reduce((sum, e) => sum + (e.commissionCents ?? 0), 0);
    const views = campaigns.reduce((sum, c) => sum + (c.viewCount ?? 0), 0);
    const clicks = campaigns.reduce((sum, c) => sum + (c.clickCount ?? 0), 0);
    const products = await db.select().from(affiliateProducts).limit(500);
    const productSlugById = new Map(products.map((prod) => [prod.id, prod.slug] as const));
    const perCampaign = campaigns.map((c) => {
      const slug = productSlugById.get(c.productId) ?? "";
      const conv = weekEvents.filter((e) => slug && e.productSlug === slug);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        slug: c.slug,
        views: c.viewCount ?? 0,
        clicks: c.clickCount ?? 0,
        ctr: (c.viewCount ?? 0) > 0 ? Math.round(((c.clickCount ?? 0) / (c.viewCount ?? 1)) * 1000) / 10 : 0,
        conversions7d: conv.length,
        commissionCents7d: conv.reduce((sum, e) => sum + (e.commissionCents ?? 0), 0),
      };
    });
    return {
      ok: true,
      windowDays: 7,
      totals: {
        campaigns: campaigns.length,
        live: campaigns.filter((c) => c.status === "live").length,
        views,
        clicks,
        ctr: views > 0 ? Math.round((clicks / views) * 1000) / 10 : 0,
        conversions: weekEvents.length,
        revenueCents,
      },
      perCampaign,
    };
  }),
});
