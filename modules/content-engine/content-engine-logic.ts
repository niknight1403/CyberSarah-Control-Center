/**
 * Sprint 351 — Saeule 2: Programmatisches Content-Netzwerk.
 * Keyword-Clustering, redaktioneller 7-Tage-SEO-Kalender, Gliederungs-
 * und Meta-Bau. Deterministisch und ohne IO; erzeugte Artikel-Entwuerfe
 * fliessen spaeter als Drafts in die Freigabe-Queue (Ein-Klick-Publish).
 */

export type ContentCluster = {
  stem: string;
  keywords: string[];
};

const STOP_WORDS = new Set(["und", "oder", "der", "die", "das", "mit", "fuer", "wie", "beste"]);

export function normalizeKeyword(raw: string): string {
  return raw.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Cluster nach potentiellem Stem (laengstes gemeinsames Token). */
export function clusterKeywords(keywords: readonly string[]): ContentCluster[] {
  const clusters: ContentCluster[] = [];
  for (const raw of keywords) {
    const keyword = normalizeKeyword(raw);
    if (!keyword) continue;
    const tokens = keyword.split(" ").filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
    const stem = tokens[0] ?? keyword;
    const existing = clusters.find((cluster) => cluster.stem === stem);
    if (existing) existing.keywords.push(keyword);
    else clusters.push({ stem, keywords: [keyword] });
  }
  return clusters;
}

export type ContentCalendarDay = {
  dayIndex: number;
  isoDate: string;
  topic: string;
  primaryKeyword: string;
  outline: readonly string[];
};

/** Deterministischer 7-Tage-Kalender: ein Artikel pro Tag, Cluster rotieren. */
export function planContentBatch(keywords: readonly string[], startDate: Date, days = 7): ContentCalendarDay[] {
  const clusters = clusterKeywords(keywords);
  if (clusters.length === 0) return [];
  const plan: ContentCalendarDay[] = [];
  for (let day = 0; day < Math.min(days, 28); day++) {
    const cluster = clusters[day % clusters.length];
    const primaryKeyword = cluster.keywords[day % cluster.keywords.length];
    plan.push({
      dayIndex: day,
      isoDate: new Date(startDate.getTime() + day * 86_400_000).toISOString().slice(0, 10),
      topic: `${primaryKeyword.replace(/^./, (c) => c.toUpperCase())} — Praxis-Guide ${day + 1}`,
      primaryKeyword,
      outline: buildArticleOutline(primaryKeyword, cluster.keywords),
    });
  }
  return plan;
}

export function buildArticleOutline(primaryKeyword: string, clusterKeywords: readonly string[]): string[] {
  const k = primaryKeyword.trim() || "Thema";
  return [
    `H2: Was ist ${k}? (Definition + Zielgruppe)`,
    `H2: ${k} Schritt fuer Schritt (Anleitung mit 5 Schritten)`,
    `H2: Haeufige Fehler bei ${k}`,
    `H2: ${k} Tools und Kosten (0-Euro-Pfad zuerst)`,
    clusterKeywords.length > 1 ? `H2: Verwandte Themen: ${clusterKeywords.filter((entry) => entry !== primaryKeyword).slice(0, 3).join(", ")}` : "H2: FAQ (3 Fragen mit Antwortteaser)",
    "H2: Fazit +_naechster Schritt",
  ].map((line) => line.replace("+_", "+ "));
}

export type SeoMetaCheck = {
  titleOk: boolean;
  descriptionOk: boolean;
  keywordInTitle: boolean;
  score: number;
};

export function seoMetaCheck(title: string, metaDescription: string, keyword: string): SeoMetaCheck {
  const k = normalizeKeyword(keyword);
  const titleOk = title.trim().length >= 30 && title.trim().length <= 60;
  const descriptionOk = metaDescription.trim().length >= 120 && metaDescription.trim().length <= 158;
  const keywordInTitle = k.length > 0 && normalizeKeyword(title).includes(k);
  const score = (titleOk ? 35 : 15) + (descriptionOk ? 30 : 10) + (keywordInTitle ? 35 : 10);
  return { titleOk, descriptionOk, keywordInTitle, score: Math.min(100, score) };
}

export type ContentBatchStatus = {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  status: "green" | "yellow" | "red";
};

/** Batch-Status aus Draft-Zustaenden (0=pending). */
export function contentBatchStatus(states: readonly ("pending" | "approved" | "rejected")[]): ContentBatchStatus {
  const total = states.length;
  const approved = states.filter((state) => state === "approved").length;
  const rejected = states.filter((state) => state === "rejected").length;
  const pending = total - approved - rejected;
  const status = total === 0 ? "red" : pending === 0 ? (approved > 0 ? "green" : "yellow") : pending === total ? "yellow" : "yellow";
  return { total, approved, pending, rejected, status };
}
