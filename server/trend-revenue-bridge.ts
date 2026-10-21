/**
 * CyberSarah Control Center — Trend-Revenue-Bruecke: Server-Adapter + Router
 * (Block 3 + Revenue-Datenebene fuer Block 4, 2026-10-21).
 *
 * Autonome Kette: Google-Trends (keyless RSS) -> Produkt-Relevanz-Ranking ->
 * viraler Content fuer das beste Digistore24-Produkt -> Freigabe-Queue
 * (HITL). Veroeffentlicht wird ausschliesslich nach menschlicher Freigabe
 * ueber die bestehende Publishing-Kette — kein Auto-Post ohne Freigabe.
 *
 * Block 4 (Datenebene): revenueSummary aggregiert conversion_events und
 * revenue_daily_stats fuer das Growth-Dashboard.
 */

import axios from "axios";
import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { router, adminProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { affiliateProducts, conversionEvents, revenueDailyStats } from "../drizzle/schema";
import {
  buildViralContentMessages,
  parseGoogleTrendsRss,
  parseViralContent,
  rankTrendsForProduct,
  type RankedTrend,
  type TrendSignal,
} from "../lib/trend-content-logic";
import { countPendingDraftsByKind, insertPendingDraft } from "./draft-engine";
import { DRAFT_MAX_PENDING_PER_KIND } from "../lib/draft-engine-logic";

const TRENDS_RSS_DE = "https://trends.google.com/trending/rss?geo=DE";
const USER_AGENT =
  process.env.DDG_USER_AGENT ??
  "Mozilla/5.0 (compatible; CyberSarahControlCenter/4.2; +https://github.com/niknight1403/CyberSarah-Control-Center)";

/** Holt und parst den oeffentlichen Google-Trends-RSS (nie werfend). */
export async function fetchTrendSignals(): Promise<{ ok: boolean; trends: TrendSignal[]; detail: string }> {
  try {
    const response = await axios.get<string>(TRENDS_RSS_DE, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml" },
      timeout: 8000,
      responseType: "text",
    });
    const parsed = parseGoogleTrendsRss(typeof response.data === "string" ? response.data : "");
    return { ok: parsed.ok, trends: parsed.trends, detail: parsed.detail };
  } catch (error) {
    return {
      ok: false,
      trends: [],
      detail: `Trends nicht erreichbar: ${error instanceof Error ? error.message : "unbekannter Fehler"}`,
    };
  }
}

async function generateContentDraft(input: {
  productTitle: string;
  productUrl: string;
  trend: RankedTrend | null;
  platform: string;
  userId: number;
}): Promise<{ ok: boolean; detail: string }> {
  const messages = buildViralContentMessages({
    productTitle: input.productTitle,
    productUrl: input.productUrl,
    trend: input.trend,
    platform: input.platform,
  });
  let raw = "";
  try {
    const result = await invokeLLM({ model: "gpt-4o-mini", maxTokens: 900, messages });
    const content = result.choices[0]?.message?.content;
    raw = typeof content === "string" ? content : "";
  } catch (error) {
    return { ok: false, detail: `LLM nicht erreichbar: ${error instanceof Error ? error.message : "unbekannt"}` };
  }
  const pkg = parseViralContent(raw, {
    platform: input.platform,
    trend: input.trend?.title ?? "",
    product: input.productTitle,
  });
  if (!pkg) return { ok: false, detail: "LLM-Ergebnis war kein gueltiges Content-JSON — ehrlich verworfen." };
  try {
    await insertPendingDraft(
      "content",
      `Viraler Content bereit: ${input.productTitle} (${input.platform})`,
      {
        personaId: "cybersarah",
        platform: pkg.platform,
        topic: pkg.trend || input.productTitle,
        content: `HOOK: ${pkg.hook}\n\nSCRIPT: ${pkg.script}\n\nCAPTION: ${pkg.caption}\n\nHASHTAGS: ${pkg.hashtags
          .map((h) => `#${h}`)
          .join(" ")}`,
      },
      String(input.userId),
    );
  } catch {
    return { ok: false, detail: "Entwurf konnte nicht gespeichert werden (DB nicht verfuegbar)." };
  }
  return { ok: true, detail: "Entwurf in der Freigabe-Queue." };
}

export const trendRevenueRouter = router({
  /** Aktuelle Trends (keyless) mit optionalem Produkt-Relevanz-Ranking. */
  trends: adminProcedure
    .input(z.object({ productId: z.number().int().positive().optional() }).optional())
    .query(async ({ input }) => {
      const fetched = await fetchTrendSignals();
      if (!fetched.ok) return { ...fetched, ranked: [] as RankedTrend[] };
      if (!input?.productId) return { ...fetched, ranked: [] as RankedTrend[] };
      const db = await getDb();
      if (!db) return { ...fetched, ranked: [], detail: `${fetched.detail} (Produkt-Ranking ohne DB nicht moeglich.)` };
      const product = (await db.select().from(affiliateProducts).where(eq(affiliateProducts.id, input.productId)).limit(1))[0];
      if (!product) return { ...fetched, ranked: [], detail: "Produkt nicht gefunden." };
      const terms = [product.title ?? "", product.slug ?? ""];
      const ranked = rankTrendsForProduct(fetched.trends, terms).slice(0, 10);
      return { ok: true, trends: fetched.trends, detail: fetched.detail, ranked };
    }),

  /** Erzeugt einen viralen Content-Entwurf fuer ein Produkt (HITL-Queue). */
  align: adminProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        platform: z.enum(["tiktok", "instagram", "youtube", "x"]).default("tiktok"),
        trendTitle: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { ok: false, detail: "Datenbank nicht verfuegbar." };
      const product = (await db.select().from(affiliateProducts).where(eq(affiliateProducts.id, input.productId)).limit(1))[0];
      if (!product) return { ok: false, detail: "Produkt nicht gefunden." };
      const pending = await countPendingDraftsByKind();
      if (pending && (pending.content ?? 0) >= DRAFT_MAX_PENDING_PER_KIND) {
        return { ok: false, detail: `Freigabe-Queue voll (${pending.content}/${DRAFT_MAX_PENDING_PER_KIND} offene Content-Entwuerfe).` };
      }
      let trend: RankedTrend | null = null;
      const fetched = await fetchTrendSignals();
      if (fetched.ok) {
        const ranked = rankTrendsForProduct(fetched.trends, [product.title ?? "", product.slug ?? ""]);
        trend = input.trendTitle ? ranked.find((t) => t.title === input.trendTitle) ?? ranked[0] ?? null : ranked[0] ?? null;
      }
      const result = await generateContentDraft({
        productTitle: product.title ?? `Produkt #${product.id}`,
        productUrl: product.url ?? "",
        trend,
        platform: input.platform,
        userId: ctx.user.id,
      });
      return { ...result, trend: trend?.title ?? null };
    }),

  /** Block 4 — Revenue-Zusammenfassung fuer das Growth-Dashboard. */
  revenueSummary: adminProcedure.input(z.object({ days: z.number().int().min(1).max(90).default(7) }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { ok: false, detail: "Datenbank nicht verfuegbar.", totals: null, perProduct: [], daily: [] };
    const days = input?.days ?? 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const totals = (
      await db
        .select({
          events: sql<number>`count(*)::int`,
          gross: sql<string>`coalesce(sum(${conversionEvents.amountCents}), 0)::text`,
          commission: sql<string>`coalesce(sum(${conversionEvents.commissionCents}), 0)::text`,
        })
        .from(conversionEvents)
        .where(gte(conversionEvents.occurredAt, since))
    )[0];
    const perProduct = await db
      .select({
        productSlug: conversionEvents.productSlug,
        events: sql<number>`count(*)::int`,
        commission: sql<string>`coalesce(sum(${conversionEvents.commissionCents}), 0)::text`,
      })
      .from(conversionEvents)
      .where(gte(conversionEvents.occurredAt, since))
      .groupBy(conversionEvents.productSlug)
      .orderBy(desc(sql`count(*)`))
      .limit(20);
    const daily = await db
      .select()
      .from(revenueDailyStats)
      .orderBy(desc(revenueDailyStats.day))
      .limit(days);
    return { ok: true, detail: `Zeitraum ${days} Tage.`, totals, perProduct, daily };
  }),
});
