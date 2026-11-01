/**
 * CyberSarah Control Center — Trend- & Content-Logik (Block 3 der
 * Revenue-OS-Mission, 2026-10-21).
 *
 * Keyless Trend-Erkennung + produktabgestimmte Content-Planung:
 *   - parseGoogleTrendsRss(): liest Googles oeffentlichen Trends-RSS
 *     (https://trends.google.com/trending/rss?geo=DE) — 0 EUR, 0 Keys.
 *   - scoreTrendRelevance(): Keyword-Ueberlappung Trend <-> Produkt/Nische.
 *   - buildViralContentMessages(): Prompt fuer virale Skripte, Hooks,
 *     Captions und Hashtags, exakt abgestimmt auf ein Affiliate-Produkt.
 *   - parseViralContent(): strikte JSON-Validierung; unbrauchbares LLM-
 *     Ergebnis heisst ehrlich "kein Entwurf", nie ein Fake-Inhalt.
 *
 * Zero-Stub: Keine erfundenen Trends. Ohne echte RSS-Daten liefert die
 * Kette ok=false mit Grund — der Aufrufer sieht den Unterschied.
 */

export type TrendSignal = {
  title: string;
  traffic: string;
  pubDate: string;
  url: string;
};

export type TrendParseOutcome =
  | { ok: true; trends: TrendSignal[]; detail: string }
  | { ok: false; trends: TrendSignal[]; detail: string };

export type RankedTrend = TrendSignal & { relevance: number; matchedTerms: string[] };

export type ViralContentPackage = {
  hook: string;
  script: string;
  caption: string;
  hashtags: string[];
  platform: string;
  trend: string;
  product: string;
};

const MAX_TRENDS = 25;
const MAX_SCRIPT_CHARS = 2200;

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function pickTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeEntities(m[1]).trim() : "";
}

/** Parst den Google-Trends-RSS. Ehrlich: leeres Ergebnis mit Grund. */
export function parseGoogleTrendsRss(xml: string): TrendParseOutcome {
  if (!xml || typeof xml !== "string") {
    return { ok: false, trends: [], detail: "Keine RSS-Antwort erhalten." };
  }
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const trends: TrendSignal[] = [];
  for (const block of blocks) {
    const title = pickTag(block, "title");
    if (!title) continue;
    trends.push({
      title,
      traffic: pickTag(block, "ht:approx_traffic") || pickTag(block, "approx_traffic"),
      pubDate: pickTag(block, "pubDate"),
      url: pickTag(block, "link"),
    });
    if (trends.length >= MAX_TRENDS) break;
  }
  if (trends.length === 0) {
    return { ok: false, trends, detail: "RSS enthielt keine Trend-Eintraege (Struktur geaendert oder Geo ohne Daten)." };
  }
  return { ok: true, trends, detail: `${trends.length} Trends aus dem oeffentlichen RSS gelesen.` };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u00e4\u00f6\u00fc\u00df\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4);
}

/** Relevanz-Score eines Trends fuer ein Produkt/Nische (0-100). */
export function scoreTrendRelevance(trend: TrendSignal, productTerms: string[]): RankedTrend {
  const trendTerms = tokenize(trend.title);
  const wanted = productTerms.flatMap((t) => tokenize(t)).filter(Boolean);
  const matched = wanted.filter((w) => trendTerms.some((tt) => tt.includes(w) || w.includes(tt)));
  const unique = Array.from(new Set(matched));
  const base = wanted.length === 0 ? 0 : Math.round((unique.length / Math.min(wanted.length, 8)) * 80);
  const trafficBoost = /100K\+|1M\+|2M\+|500K\+/.test(trend.traffic) ? 20 : /10K\+/.test(trend.traffic) ? 10 : 0;
  return { ...trend, relevance: Math.min(100, base + trafficBoost), matchedTerms: unique };
}

/** Rankt Trends nach Relevanz fuer ein Produkt (stabil, hoechste zuerst). */
export function rankTrendsForProduct(trends: TrendSignal[], productTerms: string[]): RankedTrend[] {
  return trends
    .map((t) => scoreTrendRelevance(t, productTerms))
    .sort((a, b) => b.relevance - a.relevance || a.title.localeCompare(b.title));
}

export type ChatMessage = { role: "system" | "user"; content: string };

/** Prompt fuer virale, produktabgestimmte Inhalte (Block 3). */
export function buildViralContentMessages(input: {
  productTitle: string;
  productUrl: string;
  trend: RankedTrend | null;
  platform: string;
}): ChatMessage[] {
  const system =
    "Du bist CyberSarah, eine deutsche KI-Influencerin. Du schreibst virale Kurzvideo-Inhalte, " +
    "die echt konvertieren. Keine Floskeln, kein Clickbait ohne Substanz. Sprache: Deutsch. " +
    "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt mit den Feldern hook (1 Satz), script (30-60 Sekunden Sprechtext), " +
    "caption (max 220 Zeichen), hashtags (Array mit 5-8 Strings ohne #).";
  const trendLine = input.trend
    ? `Aktueller Trend (Google Trends, ${input.trend.traffic || "Traffic unbekannt"}): "${input.trend.title}".`
    : "Kein passender Trend gefunden — schreibe zeitlos, ohne erfundene Trendbezuege.";
  const user =
    `Produkt: ${input.productTitle}\nAffiliate-Link: ${input.productUrl}\nPlattform: ${input.platform}\n` +
    `${trendLine}\n\n` +
    "Erzeuge einen Inhalt, der das Produkt ueber den Trend/Alltagsnutzen verkauft, ohne das Produkt zu ueberzeichnen. " +
    "Der Hook muss in den ersten 2 Sekunden sitzen. Der Script muss den Affiliate-Mehrwert klar machen und zur Bio/ zum Link fuehren.";
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Strikte Validierung des LLM-Ergebnisses. Null = ehrlich verworfen. */
export function parseViralContent(
  raw: string,
  meta: { platform: string; trend: string; product: string }
): ViralContentPackage | null {
  if (!raw || typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const hook = typeof obj.hook === "string" ? obj.hook.trim() : "";
  const script = typeof obj.script === "string" ? obj.script.trim() : "";
  const caption = typeof obj.caption === "string" ? obj.caption.trim() : "";
  const hashtagsRaw = Array.isArray(obj.hashtags) ? obj.hashtags : [];
  const hashtags = hashtagsRaw
    .filter((h): h is string => typeof h === "string")
    .map((h) => h.replace(/^#/, "").trim())
    .filter((h) => h.length >= 2 && h.length <= 40)
    .slice(0, 8);
  if (hook.length < 8 || script.length < 60 || script.length > MAX_SCRIPT_CHARS || caption.length < 10) return null;
  if (hashtags.length < 3) return null;
  return { hook, script, caption, hashtags, platform: meta.platform, trend: meta.trend, product: meta.product };
}
