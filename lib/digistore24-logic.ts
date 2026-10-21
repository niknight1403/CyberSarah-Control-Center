/**
 * CyberSarah Control Center — Digistore24 Affiliate Engine: reine Logik
 * (Phase 2 der Revenue-OS-Mission, 2026-10-21).
 *
 * Zero-Stub-Policy: Keine erfundenen Produkte, keine Fake-Scores. Die
 * Logik validiert, parst und formuliert — Netzwerk und LLM bleiben im
 * Server-Adapter (server/digistore24.ts).
 */

export type DigistoreProduct = {
  slug: string;
  title: string;
  url: string;
};

export type DigistoreEvaluation = {
  slug: string;
  title: string;
  score: number;
  reason: string;
};

export type FunnelPackage = {
  name: string;
  hypothesis: string;
  stages: string[];
  metric: string;
};

/** Marketplace-URL des deutschen Digistore24-Produktkatalogs. */
export function buildMarketplaceUrl(): string {
  return "https://www.digistore24.com/marketplace";
}

/** Validiert einen rohen Produkt-Treffer (Mindestanforderungen, Dedupe-noetig). */
export function isValidProduct(product: DigistoreProduct): boolean {
  return (
    typeof product.slug === "string" &&
    product.slug.length >= 3 &&
    product.slug.length <= 200 &&
    typeof product.title === "string" &&
    product.title.trim().length >= 4 &&
    product.title.length <= 300 &&
    /^https:\/\/(www\.)?digistore24\.com\/product\/[^/?#]+\/?$/i.test(product.url)
  );
}

/**
 * Parst Produkt-Links aus dem Marketplace-HTML. Tolerant gegenueber
 * Layout-Aenderungen: gesucht werden /product/<slug>-Links mit Text.
 * Kein Treffer heisst ehrlich: leere Liste (ok=false-Detail im Adapter).
 */
export function parseDigistoreProducts(html: string): DigistoreProduct[] {
  const products: DigistoreProduct[] = [];
  const seen = new Set<string>();
  const anchor = /<a\b[^>]*href="([^"]*\/product\/([^/"?#]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchor.exec(html)) !== null && products.length < 60) {
    const rawUrl = match[1].startsWith("http") ? match[1] : `https://www.digistore24.com${match[1]}`;
    const slug = match[2].toLowerCase();
    const title = match[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const product: DigistoreProduct = { slug, title, url: rawUrl.split("?")[0] };
    if (isValidProduct(product) && !seen.has(slug)) {
      seen.add(slug);
      products.push(product);
    }
  }
  return products;
}

/** Bewertungs-Prompt: Provision, Conversion, Nachfrage — als JSON antworten. */
export function buildEvaluationMessages(products: DigistoreProduct[]): Array<{ role: "user" | "assistant"; content: string }> {
  const list = products
    .slice(0, 40)
    .map((p, i) => `${i + 1}. slug=${p.slug} | titel=${p.title} | url=${p.url}`)
    .join("\n");
  return [
    {
      role: "user",
      content:
        `Du bist ein erfahrener Affiliate-Marketing-Analyst. Bewerte die folgenden Digistore24-Produkte ` +
        `fuer eine Affiliate-Kampagne im deutschsprachigen Raum nach drei Kriterien: ` +
        `(a) erwartbare Provision, (b) Conversion-Wahrscheinlichkeit, (c) Nachfrage/Trend. ` +
        `Waehle die 5 vielversprechendsten Produkte und antworte NUR mit einem JSON-Array: ` +
        `[{"slug":"...","title":"...","score":0-100,"reason":"ein Satz Begruendung"}]. ` +
        `Kein Markdown, keine Erklaerung ausserhalb des JSON.\n\n${list}`,
    },
  ];
}

/** LLM-Antwort in validierte Bewertungen ueberfuehren (nie werfend). */
export function parseEvaluations(text: string, products: DigistoreProduct[]): DigistoreEvaluation[] {
  const jsonSlice = text.slice(Math.max(text.indexOf("["), 0), text.lastIndexOf("]") + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const out: DigistoreEvaluation[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const slug = typeof r.slug === "string" ? r.slug.toLowerCase() : "";
    const product = bySlug.get(slug);
    if (!product) continue;
    const scoreRaw = typeof r.score === "number" ? r.score : Number(r.score);
    if (!Number.isFinite(scoreRaw)) continue;
    const evaluation: DigistoreEvaluation = {
      slug,
      title: typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 200) : product.title,
      score: Math.max(0, Math.min(100, Math.round(scoreRaw))),
      reason: typeof r.reason === "string" ? r.reason.trim().slice(0, 300) : "",
    };
    out.push(evaluation);
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Funnel-Prompt: kompletter Launch-Funnel als JSON passend zur Freigabe-Queue. */
export function buildFunnelMessages(product: DigistoreProduct): Array<{ role: "user" | "assistant"; content: string }> {
  return [
    {
      role: "user",
      content:
        `Erstelle fuer das Digistore24-Affiliate-Produkt "${product.title}" (URL: ${product.url}) ` +
        `einen hochkonvertierenden Launch-Funnel im deutschsprachigen Raum. Antworte NUR mit JSON: ` +
        `{"name":"Kampagnen-Name","hypothesis":"warum dieses Produkt Geld verdient (Zielgruppe + Hebel)",` +
        `"stages":["STAGE 1: Landingpage: <Headline + 3 Bullets + CTA-Text>",` +
        `"STAGE 2: E-Mail-Sequenz: <3 Betreffzeilen mit je 1-Satz-Anreisern>",` +
        `"STAGE 3: Sales-Copy: <kurzer Verkaufstext fuer Social>",` +
        `"STAGE 4: Traffic-Plan: <3 konkrete Kanäle>"],"metric":"Gemessen an: <KPI>"}. ` +
        `Alles konkret und ausformuliert, keine Platzhalter in spitzen Klammern im Ergebnis. Kein Markdown.`,
    },
  ];
}

/** Validiert ein Funnel-Ergebnis (RevenueLoopDraftPayload-kompatibel, min. 3 Stufen). */
export function parseFunnel(text: string): FunnelPackage | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const r = parsed as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const hypothesis = typeof r.hypothesis === "string" ? r.hypothesis.trim() : "";
  const stages = Array.isArray(r.stages)
    ? r.stages.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim().slice(0, 800))
    : [];
  const metric = typeof r.metric === "string" ? r.metric.trim() : "";
  if (!name || name.length < 4 || !hypothesis || stages.length < 3 || !metric) return null;
  return { name: name.slice(0, 120), hypothesis: hypothesis.slice(0, 600), stages: stages.slice(0, 6), metric: metric.slice(0, 200) };
}
