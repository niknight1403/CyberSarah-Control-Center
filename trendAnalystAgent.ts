import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { db } from "@workspace/db";
import { agentLogsTable, agentsTable, contentTable, systemConfigTable } from "@workspace/db";
import { eq, gte, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { generiereContent } from "./contentAgent";
import { inkrementiereFallbackZaehler } from "./watchdog";

export interface TrendReport {
  topThemen: string[];
  empfohleneMarke: string;
  empfohlenePlattform: string;
  aktuelleHashtags: string[];
  contentEmpfehlung: string;
  naechsteAktionen: string[];
}

const THEMEN_POOL = [
  "KI-Tools für Einsteiger 2026",
  "ChatGPT vs. Gemini: Der ehrliche Vergleich",
  "Passives Einkommen mit KI — Realität oder Mythos?",
  "Automatisierung für Selbstständige: 5 Schritte",
  "Online Geld verdienen ohne Vorkenntnisse",
  "KI ersetzt Berufe — was kommt stattdessen?",
  "Der KI-Marketing-Trick den Profis nutzen",
  "Wie ich mit einem ChatGPT-Prompt 1000€ verdient habe",
  "TikTok Algorithmus 2026: Was wirklich funktioniert",
  "Affiliate-Marketing mit KI automatisieren",
];

const MARKEN = ["CyberSarah", "GeldPilot AI", "UnternehmerGPT"] as const;
const PLATTFORMEN = ["TikTok", "Instagram", "YouTube", "Blog"] as const;

// ─── Echte Trend-Daten via SerpAPI (falls Key gesetzt) ──────────────────────
async function holeEchteTrends(thema: string): Promise<string[]> {
  try {
    const [serpRow] = await db.select({ wert: systemConfigTable.wert })
      .from(systemConfigTable).where(eq(systemConfigTable.schluessel, "serp_api_key"));
    const serpKey = serpRow?.wert ?? process.env["SERP_API_KEY"];

    if (!serpKey) return [];

    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(thema + " 2026 Deutschland")}&hl=de&gl=de&api_key=${serpKey}&num=5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];

    const data = await res.json() as { organic_results?: Array<{ title: string }> };
    return (data.organic_results ?? []).slice(0, 5).map(r => r.title);
  } catch {
    return []; // Graceful fallback
  }
}

// ─── Echte YouTube-Trends (falls Key gesetzt) ────────────────────────────────
async function holeYouTubeTrends(): Promise<string[]> {
  try {
    const [ytRow] = await db.select({ wert: systemConfigTable.wert })
      .from(systemConfigTable).where(eq(systemConfigTable.schluessel, "youtube_api_key"));
    const ytKey = ytRow?.wert ?? process.env["YOUTUBE_API_KEY"];

    if (!ytKey) return [];

    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&regionCode=DE&videoCategoryId=27&maxResults=5&key=${ytKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];

    const data = await res.json() as { items?: Array<{ snippet: { title: string } }> };
    return (data.items ?? []).map(i => i.snippet.title);
  } catch {
    return [];
  }
}



function erstelleFallbackReport(plattform: string, thema: string): TrendReport {
  const idx = Math.floor(Math.random() * MARKEN.length);
  return {
    topThemen: THEMEN_POOL.slice(0, 3),
    empfohleneMarke: MARKEN[idx] ?? "CyberSarah",
    empfohlenePlattform: plattform,
    aktuelleHashtags: ["#KI", "#CyberSarah", "#Automatisierung", "#GeldVerdienen", "#TikTok2026"],
    contentEmpfehlung: thema,
    naechsteAktionen: [
      `${plattform}-Content zu "${thema}" erstellen`,
      "Affiliate-Links in Bio eintragen",
      "Engagement messen nach 24h",
    ],
  };
}

export async function analysiereTrends(agentId: number): Promise<TrendReport> {
  const startzeit = Date.now();

  const letzteWoche = new Date();
  letzteWoche.setDate(letzteWoche.getDate() - 7);

  const recentContent = await db
    .select({ plattform: contentTable.plattform, marke: contentTable.marke, titel: contentTable.titel })
    .from(contentTable)
    .where(gte(contentTable.createdAt, letzteWoche))
    .orderBy(desc(contentTable.createdAt))
    .limit(30);

  const plattformStats = recentContent.reduce((acc, c) => {
    acc[c.plattform] = (acc[c.plattform] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const unterrepraesentiertePlattform = (["TikTok", "Instagram", "YouTube", "Blog"] as string[])
    .sort((a, b) => (plattformStats[a] ?? 0) - (plattformStats[b] ?? 0))[0] ?? "TikTok";

  // Echte Trends laden wenn API-Key vorhanden, sonst Fallback-Pool
  const [echteGoogleTrends, echteYouTubeTrends] = await Promise.all([
    holeEchteTrends("KI Tools Geld verdienen"),
    holeYouTubeTrends(),
  ]);

  const alleTrends = [...echteGoogleTrends, ...echteYouTubeTrends];
  const zufaelligesThema = alleTrends.length > 0
    ? alleTrends[Math.floor(Math.random() * alleTrends.length)]!
    : THEMEN_POOL[Math.floor(Math.random() * THEMEN_POOL.length)]!;
  const datenquelle = alleTrends.length > 0 ? "Echte Google/YouTube-Trends" : "Fallback-Pool";

  // Fallback-Modus wenn kein API-Key
  if (!openaiVerfuegbar) {
    inkrementiereFallbackZaehler(agentId, "Trend Analyst Agent");
    const report = erstelleFallbackReport(unterrepraesentiertePlattform, zufaelligesThema);
    const dauer = Date.now() - startzeit;

    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "Trend Analyst Agent",
      aktion: "Trend-Analyse (Fallback)",
      status: "erfolgreich",
      nachricht: `Fallback-Report: ${report.topThemen.slice(0, 2).join(", ")} | ${report.empfohlenePlattform}`,
      dauer,
    });
    await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
    return report;
  }

  const prompt = `Du bist der Trend-Analyst des CyberSarah Revenue OS.

Analysierte Content-Plattform-Verteilung der letzten 7 Tage:
${JSON.stringify(plattformStats, null, 2)}

Unterrepräsentierte Plattform: ${unterrepraesentiertePlattform}
Vorgeschlagenes Thema: ${zufaelligesThema}

Gib eine Trend-Analyse und Content-Empfehlung. Antworte NUR mit validem JSON:
{
  "topThemen": ["Thema1", "Thema2", "Thema3"],
  "empfohleneMarke": "CyberSarah|GeldPilot AI|UnternehmerGPT",
  "empfohlenePlattform": "TikTok|Instagram|YouTube|Blog",
  "aktuelleHashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "contentEmpfehlung": "Konkrete Content-Idee als Satz",
  "naechsteAktionen": ["Aktion 1", "Aktion 2"]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Du bist ein Social-Media-Trend-Analyst für KI-Content. Antworte ausschließlich mit validem JSON." },
        { role: "user", content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.4,
      response_format: { type: "json_object" },
    });

    const report: TrendReport = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const dauer = Date.now() - startzeit;

    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "Trend Analyst Agent",
      aktion: "Trend-Analyse durchgeführt",
      status: "erfolgreich",
      nachricht: `Top-Themen: ${report.topThemen?.slice(0, 2).join(", ")} | Empfehlung: ${report.empfohlenePlattform}`,
      metadaten: JSON.stringify(report),
      dauer,
    });

    await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));

    // Content-Auftrag basierend auf Analyse
    try {
      const marken = ["CyberSarah", "GeldPilot AI", "UnternehmerGPT"] as const;
      const typen = { TikTok: "tiktok", Instagram: "reel", YouTube: "kurzVideo", Blog: "blogartikel" } as const;
      const plattformTyp = typen[report.empfohlenePlattform as keyof typeof typen] ?? "tiktok";
      const marke = marken.includes(report.empfohleneMarke as typeof marken[number])
        ? (report.empfohleneMarke as typeof marken[number])
        : "CyberSarah";

      await generiereContent({
        marke,
        typ: plattformTyp,
        plattform: report.empfohlenePlattform as "TikTok" | "Instagram" | "YouTube" | "Blog",
        thema: report.contentEmpfehlung ?? zufaelligesThema,
      }, agentId);
    } catch (contentErr) {
      logger.warn({ contentErr }, "Trend-basierter Content-Auftrag fehlgeschlagen (nicht kritisch)");
    }

    logger.info(report, "Trend Analyst Agent abgeschlossen");
    return report;

  } catch (err) {
    const dauer = Date.now() - startzeit;
    const { istApiKeyFehler, nachricht } = handleOpenAIFehler(err, "Trend Analyst Agent");

    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "Trend Analyst Agent",
      aktion: `Trend-Analyse ${istApiKeyFehler ? "blockiert (401)" : "fehlgeschlagen"}`,
      status: istApiKeyFehler ? "erfolgreich" : "fehler",
      nachricht: istApiKeyFehler ? `⚠️ API-Key 401 → Fallback-Report aktiv` : nachricht,
      dauer,
    });

    if (istApiKeyFehler) {
      inkrementiereFallbackZaehler(agentId, "Trend Analyst Agent");
      const report = erstelleFallbackReport(unterrepraesentiertePlattform, zufaelligesThema);
      await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
      return report;
    }

    throw err;
  }
}
