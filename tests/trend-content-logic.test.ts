import { describe, expect, it } from "vitest";
import {
  buildViralContentMessages,
  parseGoogleTrendsRss,
  parseViralContent,
  rankTrendsForProduct,
  scoreTrendRelevance,
  type RankedTrend,
  type TrendSignal,
} from "../lib/trend-content-logic";

const trend = (title: string, traffic = "", url = "https://trends.google.com/x"): TrendSignal => ({
  title,
  traffic,
  pubDate: "Mon, 02 Nov 2026 00:00:00 GMT",
  url,
});

describe("parseGoogleTrendsRss", () => {
  it("lehrt leere oder ungueltige Rueckgaben ehrlich ab", () => {
    expect(parseGoogleTrendsRss("")).toEqual({ ok: false, trends: [], detail: "Keine RSS-Antwort erhalten." });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseGoogleTrendsRss(null as any).ok).toBe(false);
  });

  it("meldet Strukturfehler statt Fake-Trends, wenn keine Items existieren", () => {
    const result = parseGoogleTrendsRss("<rss><channel><title>Trends</title></channel></rss>");
    expect(result.ok).toBe(false);
    expect(result.trends).toEqual([]);
    expect(result.detail).toContain("keine Trend-Eintraege");
  });

  it("parst Titel, Traffic, Datum und Link inklusive CDATA und Entities", () => {
    const xml = `<rss><channel>
      <item><title><![CDATA[Test Trend]]></title><ht:approx_traffic><![CDATA[100K+]]></ht:approx_traffic><pubDate>Mon, 02 Nov 2026 00:00:00 GMT</pubDate><link>https://trends.google.com/a</link></item>
      <item><title>Second &amp; Third</title><approx_traffic>10K+</approx_traffic><pubDate>Tue, 03 Nov 2026</pubDate><link>https://trends.google.com/b</link></item>
    </channel></rss>`;
    const result = parseGoogleTrendsRss(xml);
    expect(result.ok).toBe(true);
    expect(result.trends).toEqual([
      { title: "Test Trend", traffic: "100K+", pubDate: "Mon, 02 Nov 2026 00:00:00 GMT", url: "https://trends.google.com/a" },
      { title: "Second & Third", traffic: "10K+", pubDate: "Tue, 03 Nov 2026", url: "https://trends.google.com/b" },
    ]);
    expect(result.detail).toContain("2 Trends");
  });

  it("ueberspringt Items ohne Titel und begrenzt auf 25 Trends", () => {
    const oneItem = "<item><link>https://x</link></item>";
    const validItem = (i: number) => `<item><title>Trend Nummer ${i}</title></item>`;
    const xml = `<rss>${oneItem}${Array.from({ length: 30 }, (_, i) => validItem(i + 1)).join("")}</rss>`;
    const result = parseGoogleTrendsRss(xml);
    expect(result.ok).toBe(true);
    expect(result.trends).toHaveLength(25);
    expect(result.trends[0].title).toBe("Trend Nummer 1");
    expect(result.trends[24].title).toBe("Trend Nummer 25");
  });
});

describe("scoreTrendRelevance", () => {
  it("gibt 0 Relevanz ohne verwertbare Produktbegriffe", () => {
    const ranked = scoreTrendRelevance(trend("ki intelligenz"), []);
    expect(ranked.relevance).toBe(0);
    expect(ranked.matchedTerms).toEqual([]);
  });

  it("scoret direkte Uebereinstimmungen mit 80 Basispunkten", () => {
    const ranked = scoreTrendRelevance(
      trend("kuenstliche intelligenz tools", ""),
      ["Kuenstliche Intelligenz"],
    );
    expect(ranked.matchedTerms).toEqual(["kuenstliche", "intelligenz"]);
    expect(ranked.relevance).toBe(80);
  });

  it("erkennt Teilstring-Treffer in beide Richtungen", () => {
    expect(scoreTrendRelevance(trend("superintelligenz debatte"), ["intelligenz"]).relevance).toBe(80);
    expect(scoreTrendRelevance(trend("intelligenz"), ["superintelligenz"]).relevance).toBe(80);
  });

  it("zaehlt mehrfach passende Begriffe nur einmal (Dedupe)", () => {
    const ranked = scoreTrendRelevance(trend("intelligenz news"), ["intelligenz", "Intelligenz"]);
    expect(ranked.matchedTerms).toEqual(["intelligenz"]);
    expect(ranked.relevance).toBe(40);
  });

  it("gibt Traffic-Boosts und deckelt bei 100", () => {
    expect(scoreTrendRelevance(trend("x", "1M+"), ["x"]).relevance).toBe(20);
    expect(scoreTrendRelevance(trend("x", "10K+"), ["x"]).relevance).toBe(10);
    expect(scoreTrendRelevance(trend("x", "500+"), ["x"]).relevance).toBe(0);
    const full = scoreTrendRelevance(trend("kuenstliche intelligenz", "2M+"), ["kuenstliche intelligenz"]);
    expect(full.relevance).toBe(100);
  });

  it("ignoriert Kurztoken unter 4 Zeichen beim Match", () => {
    expect(scoreTrendRelevance(trend("ki tools"), ["ki"]).relevance).toBe(0);
  });
});

describe("rankTrendsForProduct", () => {
  it("sortiert nach Relevanz abwaerts und bricht Gleichstand alphabetisch", () => {
    const ranked = rankTrendsForProduct(
      [trend("zzz thema"), trend("aaa thema"), trend("kuenstliche intelligenz", "1M+")],
      ["kuenstliche intelligenz"],
    );
    expect(ranked.map((r) => r.title)).toEqual([
      "kuenstliche intelligenz",
      "aaa thema",
      "zzz thema",
    ]);
  });

  it("gibt bei leerem Input eine leere, stabile Rangliste zurueck", () => {
    expect(rankTrendsForProduct([], ["produkt"])).toEqual<RankedTrend[]>([]);
  });
});

describe("buildViralContentMessages", () => {
  it("baut System- und User-Prompt mit Trend, Produkt und Plattform", () => {
    const messages = buildViralContentMessages({
      productTitle: "Affiliate Produkt",
      productUrl: "https://example.com/go",
      trend: { ...trend("Trend Titel", "100K+"), relevance: 80, matchedTerms: [] },
      platform: "TikTok",
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("JSON-Objekt");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("Affiliate Produkt");
    expect(messages[1].content).toContain("https://example.com/go");
    expect(messages[1].content).toContain("TikTok");
    expect(messages[1].content).toContain('Trend Titel"');
    expect(messages[1].content).toContain("100K+");
  });

  it("fordert zeitlose Inhalte ohne erfundene Trendbezuege, wenn kein Trend passt", () => {
    const messages = buildViralContentMessages({
      productTitle: "Affiliate Produkt",
      productUrl: "https://example.com/go",
      trend: null,
      platform: "Instagram",
    });
    expect(messages[1].content).toContain("Kein passender Trend gefunden");
    expect(messages[1].content).toContain("zeitlos");
  });
});

describe("parseViralContent", () => {
  const meta = { platform: "TikTok", trend: "Trend Titel", product: "Affiliate Produkt" };

  it("verwirft leere, JSON-lose und kaputte Eingaben mit null", () => {
    expect(parseViralContent("", meta)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseViralContent(null as any, meta)).toBeNull();
    expect(parseViralContent("kein json hier", meta)).toBeNull();
    expect(parseViralContent("{ kaputtes json }", meta)).toBeNull();
  });

  it("lehrt Fehlfeld-Befuellung ab: Hook, Skript und Caption haben Mindestanforderungen", () => {
    const hashtags = '["alpha","beta","gamma","delta"]';
    const hook = "Dieser Hook sitzt sofort";
    const caption = "Gueltige Caption mit Inhalt";
    const longScript = "x".repeat(2201);
    const script = "Sprechtext mit ausreichend Laenge fuer einen viralen Kurzfilm von vierzig Sekunden Dauer.";
    expect(parseViralContent(`{"hook":"kurz","script":"${script}","caption":"${caption}","hashtags":${hashtags}}`, meta)).toBeNull();
    expect(parseViralContent(`{"hook":"${hook}","script":"zu kurz","caption":"${caption}","hashtags":${hashtags}}`, meta)).toBeNull();
    expect(parseViralContent(`{"hook":"${hook}","script":"${longScript}","caption":"${caption}","hashtags":${hashtags}}`, meta)).toBeNull();
    expect(parseViralContent(`{"hook":"${hook}","script":"${script}","caption":"kurz","hashtags":${hashtags}}`, meta)).toBeNull();
    expect(parseViralContent(`{"hook":"${hook}","script":"${script}","caption":"${caption}","hashtags":["alpha","beta"]}`, meta)).toBeNull();
  });

  it("laesst JSON mit Prefix- und Suffix-Muell zu und bereinigt Hashtags", () => {
    const script = "Sprechtext mit ausreichend Laenge fuer einen viralen Kurzfilm von vierzig Sekunden Dauer.";
    const raw = `Hier ist dein Ergebnis: {"hook":"Dieser Hook sitzt sofort","script":"${script}",\n"caption":"Gueltige Caption mit Inhalt","hashtags":["#alpha","beta",3,"   ","#zu_langer_hashtag_der_laenger_als_vierzig_zeichen_ist_xxxxx","gamma"]} Hoffe es hilft!`;
    const parsed = parseViralContent(raw, meta);
    expect(parsed).not.toBeNull();
    expect(parsed?.hashtags).toEqual(["alpha", "beta", "gamma"]);
    expect(parsed?.platform).toBe("TikTok");
    expect(parsed?.trend).toBe("Trend Titel");
    expect(parsed?.product).toBe("Affiliate Produkt");
  });

  it("kapppt Hashtag-Listen bei 8 Eintraegen", () => {
    const script = "Sprechtext mit ausreichend Laenge fuer einen viralen Kurzfilm von vierzig Sekunden Dauer.";
    const tags = Array.from({ length: 12 }, (_, i) => `hashtag${i}`);
    const parsed = parseViralContent(
      `{"hook":"Dieser Hook sitzt sofort","script":"${script}","caption":"Gueltige Caption mit Inhalt","hashtags":${JSON.stringify(tags)}}`,
      meta,
    );
    expect(parsed?.hashtags).toEqual(tags.slice(0, 8));
  });
});
