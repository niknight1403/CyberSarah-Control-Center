/**
 * SEO-Content-Empire-Agent
 * Generiert autonome, SEO-optimierte Artikel zu profitablen Keywords, veröffentlicht
 * sie sofort über eine öffentlich crawlbare Server-Route (`/api/seo/artikel/:slug`)
 * und verlinkt automatisch ein passendes Digitalprodukt zur Monetarisierung.
 * Baut auf dem Persona/OpenAI-Muster von `contentAgent.ts` auf.
 */
import { db } from "@workspace/db";
import { seoContentTable, agentLogsTable, agentsTable, produkteTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { inkrementiereFallbackZaehler, setzeSmartPause, istSmartPausiert } from "./watchdog";
import { erzeugeTrackingLink } from "../lib/attribution";

const MAX_ARTIKEL_PRO_SCAN = 2;
const AGENT_NAME = "SEO-Content-Empire-Agent";

const MARKEN_THEMEN: Record<string, string> = {
  "CyberSarah": "KI-Tools, Automatisierung und Produktivität für Selbstständige",
  "GeldPilot AI": "Online-Geldverdienen, passives Einkommen und KI-gestützte Nebeneinkünfte",
  "UnternehmerGPT": "Business-Automatisierung, KI im Unternehmen und Prozessoptimierung für KMU",
};

const FALLBACK_KEYWORDS = [
  { keyword: "KI Prompts für Selbstständige", marke: "CyberSarah" },
  { keyword: "Online Geld verdienen mit KI 2026", marke: "GeldPilot AI" },
  { keyword: "Automatisierung für kleine Unternehmen", marke: "UnternehmerGPT" },
  { keyword: "ChatGPT für Freelancer nutzen", marke: "CyberSarah" },
  { keyword: "Passives Einkommen durch KI-Tools", marke: "GeldPilot AI" },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .substring(0, 80);
}

async function holeEigeneAgentId(): Promise<number | null> {
  const [agent] = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.name, AGENT_NAME));
  return agent?.id ?? null;
}

async function protokolliere(aktion: string, status: "erfolgreich" | "fehler", nachricht: string, dauer?: number): Promise<void> {
  const agentId = await holeEigeneAgentId();
  if (agentId === null) return;
  await db.insert(agentLogsTable).values({ agentId, agentName: AGENT_NAME, aktion, status, nachricht, dauer });
  await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
}

// ─── Keyword-Ideen generieren (OpenAI oder Fallback) ─────────────────────────

async function generiereKeywordIdeen(vorhandeneKeywords: string[], anzahl: number): Promise<Array<{ keyword: string; marke: string }>> {
  if (!openaiVerfuegbar) {
    return FALLBACK_KEYWORDS.filter(k => !vorhandeneKeywords.includes(k.keyword)).slice(0, anzahl);
  }
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: "Du bist SEO-Stratege für drei deutschsprachige KI-Business-Marken: CyberSarah (KI & Automatisierung), GeldPilot AI (Online-Geldverdienen), UnternehmerGPT (Business-Automatisierung für KMU). Gib NUR valides JSON zurück: Array von Objekten mit keyword (deutsches Long-Tail-Keyword mit Suchvolumen-Potenzial, wenig Konkurrenz) und marke (einer von: CyberSarah, GeldPilot AI, UnternehmerGPT).",
        },
        {
          role: "user",
          content: `Erstelle ${anzahl} neue SEO-Keyword-Ideen für Blogartikel. Vermeide diese bereits vorhandenen Keywords: ${vorhandeneKeywords.join(", ") || "keine"}.`,
        },
      ],
    });
    const raw = resp.choices[0]?.message.content ?? "[]";
    const cleaned = raw.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Array<{ keyword: string; marke: string }> | { keywords: Array<{ keyword: string; marke: string }> };
    const liste = Array.isArray(parsed) ? parsed : parsed.keywords;
    return (liste ?? []).filter(k => k?.keyword && !vorhandeneKeywords.includes(k.keyword)).slice(0, anzahl);
  } catch (err) {
    logger.warn({ err }, `${AGENT_NAME}: OpenAI-Keyword-Ideen fehlgeschlagen, nutze Fallback`);
    return FALLBACK_KEYWORDS.filter(k => !vorhandeneKeywords.includes(k.keyword)).slice(0, anzahl);
  }
}

// ─── Artikel-Text generieren (OpenAI oder Fallback-Template) ─────────────────

async function generiereArtikelText(keyword: string, marke: string): Promise<{ titel: string; metaDescription: string; body: string }> {
  const themenkontext = MARKEN_THEMEN[marke] ?? MARKEN_THEMEN["CyberSarah"];

  if (!openaiVerfuegbar) {
    return {
      titel: `${keyword}: Der komplette Guide 2026`,
      metaDescription: `Alles zu ${keyword} — praxisnah erklärt, mit konkreten Schritten zum Umsetzen.`.substring(0, 300),
      body: `## Einleitung\n\n${keyword} ist eines der wichtigsten Themen für ${themenkontext}. In diesem Guide erfährst du alles Wichtige.\n\n## Was du wissen musst\n\nDie Grundlagen sind entscheidend, bevor du startest.\n\n## Schritt-für-Schritt-Anleitung\n\n1. Grundlagen verstehen\n2. Werkzeuge auswählen\n3. Umsetzen und optimieren\n\n## Fazit\n\nMit den richtigen Schritten gelingt der Einstieg in ${keyword} schnell und nachhaltig.`,
    };
  }

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1500,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `Du schreibst SEO-optimierte deutsche Blogartikel für ${themenkontext}. Antworte NUR mit validem JSON: {"titel": "...", "metaDescription": "... (max 155 Zeichen)", "body": "... (Markdown, 700-1000 Wörter, H2-Zwischenüberschriften, kein H1, klare Struktur, praxisnah, kein Platzhaltertext)"}`,
        },
        { role: "user", content: `Schreibe einen SEO-Artikel zum Keyword: "${keyword}"` },
      ],
    });
    const raw = resp.choices[0]?.message.content ?? "{}";
    const cleaned = raw.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { titel?: string; metaDescription?: string; body?: string };
    if (!parsed.titel || !parsed.body) throw new Error("Unvollständige OpenAI-Antwort");
    return {
      titel: parsed.titel.substring(0, 490),
      metaDescription: (parsed.metaDescription ?? "").substring(0, 300),
      body: parsed.body,
    };
  } catch (err) {
    const { istApiKeyFehler } = handleOpenAIFehler(err, AGENT_NAME);
    if (istApiKeyFehler) {
      const agentId = await holeEigeneAgentId();
      if (agentId !== null) {
        setzeSmartPause(agentId, AGENT_NAME, "OpenAI 401 — API-Key ungültig");
        inkrementiereFallbackZaehler(agentId, AGENT_NAME);
      }
    }
    logger.warn({ err }, `${AGENT_NAME}: Artikel-Generierung fehlgeschlagen, nutze Fallback`);
    return {
      titel: `${keyword}: Der komplette Guide 2026`,
      metaDescription: `Alles zu ${keyword} — praxisnah erklärt.`.substring(0, 300),
      body: `## Einleitung\n\n${keyword} betrifft ${themenkontext}. Hier die wichtigsten Punkte.\n\n## Grundlagen\n\nStarte mit den Basics.\n\n## Umsetzung\n\nSchritt für Schritt zum Ziel.\n\n## Fazit\n\nJetzt loslegen mit ${keyword}.`,
    };
  }
}

// ─── Phase 1: neue SEO-Artikel scannen + erstellen ──────────────────────────

export async function generiereSeoArtikel(): Promise<{
  erstellt: number;
  artikel: Array<{ titel: string; slug: string; marke: string }>;
  fehler: string[];
}> {
  const startzeit = Date.now();
  const fehler: string[] = [];

  if (await istAgentSmartPausiert()) {
    return { erstellt: 0, artikel: [], fehler: ["Agent smart-pausiert (OpenAI 401) — versucht es später erneut"] };
  }

  const vorhandene = await db.select({ keyword: seoContentTable.keyword }).from(seoContentTable);
  const vorhandeneKeywords = vorhandene.map(k => k.keyword);

  const ideen = await generiereKeywordIdeen(vorhandeneKeywords, MAX_ARTIKEL_PRO_SCAN);
  const erstellt: Array<{ titel: string; slug: string; marke: string }> = [];

  // aktive Digitalprodukte für Monetarisierungs-Link laden
  const aktiveProdukte = await db.select().from(produkteTable).where(eq(produkteTable.aktiv, true));

  for (const idee of ideen) {
    try {
      const { titel, metaDescription, body } = await generiereArtikelText(idee.keyword, idee.marke);
      const slugBasis = slugify(idee.keyword);
      const slug = `${slugBasis}-${Date.now().toString(36)}`;

      const produkt = aktiveProdukte.length > 0
        ? aktiveProdukte[Math.floor(Math.random() * aktiveProdukte.length)]
        : undefined;

      const [neuerArtikel] = await db.insert(seoContentTable).values({
        keyword: idee.keyword,
        slug,
        titel,
        metaDescription,
        body,
        marke: idee.marke,
        produktId: produkt?.id ?? null,
        status: "veroeffentlicht",
        veroeffentlichtAm: new Date(),
      }).returning();

      // Erst nach dem Insert kennen wir die Artikel-ID — der Tracking-Link im CTA
      // trägt sie als client_reference_id, damit Stripe-Zahlungen diesem Artikel
      // zugeordnet werden können (echte Umsatz-Attribution).
      if (produkt && neuerArtikel) {
        const trackingLink = erzeugeTrackingLink(produkt.stripePaymentLink ?? "#", "seo_content", neuerArtikel.id);
        const bodyMitCta = `${body}\n\n---\n\n**Empfehlung:** [${produkt.name}](${trackingLink}) — ${produkt.beschreibung ?? ""}`;
        await db.update(seoContentTable).set({ body: bodyMitCta }).where(eq(seoContentTable.id, neuerArtikel.id));
      }

      erstellt.push({ titel, slug, marke: idee.marke });
      logger.info({ slug, titel }, `✅ ${AGENT_NAME}: neuer SEO-Artikel veröffentlicht`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fehler.push(`${idee.keyword}: ${msg}`);
      logger.error({ err, keyword: idee.keyword }, `${AGENT_NAME}: Fehler beim Erstellen`);
    }
  }

  const dauer = Date.now() - startzeit;
  await protokolliere("artikel_scannen", fehler.length === 0 || erstellt.length > 0 ? "erfolgreich" : "fehler",
    `${erstellt.length} neue SEO-Artikel veröffentlicht, ${fehler.length} Fehler`, dauer);

  return { erstellt: erstellt.length, artikel: erstellt, fehler };
}

async function istAgentSmartPausiert(): Promise<boolean> {
  const agentId = await holeEigeneAgentId();
  if (agentId === null) return false;
  return istSmartPausiert(agentId);
}

// ─── Übersicht laden ─────────────────────────────────────────────────────────

export async function ladeSeoUebersicht() {
  const alle = await db.select().from(seoContentTable).orderBy(desc(seoContentTable.createdAt));
  const gesamtAufrufe = alle.reduce((sum, a) => sum + a.aufrufe, 0);
  return {
    artikel: alle,
    stats: {
      gesamt: alle.length,
      veroeffentlicht: alle.filter(a => a.status === "veroeffentlicht").length,
      pausiert: alle.filter(a => a.status === "pausiert").length,
      gesamtAufrufe,
    },
  };
}

export async function ladeArtikelPerSlug(slug: string) {
  const [artikel] = await db.select().from(seoContentTable).where(eq(seoContentTable.slug, slug));
  if (!artikel) return null;
  await db.update(seoContentTable).set({ aufrufe: artikel.aufrufe + 1 }).where(eq(seoContentTable.id, artikel.id));
  return artikel;
}

export async function pausiereArtikel(id: number): Promise<void> {
  await db.update(seoContentTable).set({ status: "pausiert", updatedAt: new Date() }).where(eq(seoContentTable.id, id));
}

export async function reaktiviereArtikel(id: number): Promise<void> {
  await db.update(seoContentTable).set({ status: "veroeffentlicht", updatedAt: new Date() }).where(eq(seoContentTable.id, id));
}
