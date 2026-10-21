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
import { invokeLLM, type Message } from "./_core/llm";
import { countPendingDraftsByKind, insertPendingDraft } from "./draft-engine";
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

export const digistore24Router = router({
  /** Phase 2.1: Produkte entdecken und bewerten. */
  discover: adminProcedure.query(async () => discoverDigistoreProducts()),

  /** Phase 2.2/2.3: Launch-Funnel generieren und zur Bestätigung einreihen. */
  funnel: adminProcedure
    .input(
      z.object({
        slug: z.string().trim().min(3).max(200),
        productTitle: z.string().trim().min(4).max(300),
      })
    )
    .mutation(async ({ input }) => generateDigistoreFunnel(input.slug, input.productTitle)),
});
