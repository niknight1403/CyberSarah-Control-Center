import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { db } from "@workspace/db";
import { contentTable, agentLogsTable, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { inkrementiereFallbackZaehler, setzeSmartPause, istSmartPausiert } from "./watchdog";
import { ladeAffiliateLinksAusDB, ladeWebhookUrlAusDB, type AffiliateLink } from "../routes/einstellungen";

export interface ContentAuftrag {
  marke: "CyberSarah" | "GeldPilot AI" | "UnternehmerGPT";
  typ: "kurzVideo" | "reel" | "tiktok" | "blogartikel";
  plattform: "TikTok" | "Instagram" | "YouTube" | "Google" | "Blog";
  thema: string;
  campaignId?: number;
}

const MARKEN_PERSONAS: Record<string, string> = {
  "CyberSarah": "Du bist CyberSarah, eine KI-Influencerin für KI & Automatisierung. Dein Stil ist tech-affin, modern, direkt und professionell. Zielgruppe: Tech-affine Millennials.",
  "GeldPilot AI": "Du bist GeldPilot AI, ein KI-Finanzexperte für Online-Geldverdienen. Dein Stil ist motivierend, praktisch und erreichbar. Zielgruppe: Einsteiger & Seiteneinsteiger.",
  "UnternehmerGPT": "Du bist UnternehmerGPT, ein KI-Business-Berater für KMU-Automatisierung. Dein Stil ist professionell, lösungsorientiert und businessorientiert. Zielgruppe: Selbstständige & Unternehmer.",
};

const TYP_ANWEISUNGEN: Record<string, string> = {
  kurzVideo: "Erstelle ein Skript für ein 30-60 Sekunden Kurzvideo. Struktur: Hook (3 Sek), Hauptinhalt (20-40 Sek), Call-to-Action (5-10 Sek). Formatiere als Skript mit Zeitangaben.",
  reel: "Erstelle ein Instagram Reel Skript (15-30 Sek). Sehr visuell, schneller Schnitt, starker Hook in den ersten 2 Sekunden. Füge Bildanweisungen hinzu.",
  tiktok: "Erstelle ein TikTok-Skript (15-60 Sek). Trendy, authentisch, mit Hashtag-Vorschlägen. Nutze aktuelle TikTok-Trends. Füge 5-10 relevante Hashtags hinzu.",
  blogartikel: "Erstelle einen vollständigen SEO-optimierten Blogartikel (600-900 Wörter). Struktur: H1-Überschrift, Einleitung, 3-4 Abschnitte mit H2s, Fazit mit CTA. Füge Meta-Description hinzu.",
};

// ─── Affiliate-Links aus DB (mit Default-Fallback) ───────────────────────────
async function fuegeAffiliateLinkHinzu(inhalt: string, marke: string, typ: string): Promise<string> {
  const alle = await ladeAffiliateLinksAusDB();
  const links = alle.filter((l: AffiliateLink) => l.marke === marke);
  if (links.length === 0) return inhalt;
  const link = links[new Date().getDay() % links.length]!;

  const cta = typ === "blogartikel"
    ? `\n\n---\n**Empfehlung:** ${link.cta}\n👉 ${link.url}\n\n*Dieser Beitrag enthält Affiliate-Links. Bei einem Kauf erhalten wir eine kleine Provision ohne Mehrkosten für dich.*`
    : `\n\n${link.cta}\n👉 ${link.url}`;

  return inhalt + cta;
}

// ─── Webhook: Content automatisch an Make.com/Zapier/n8n senden ──────────────
async function sendeContentWebhook(contentId: number, auftrag: ContentAuftrag, inhalt: string): Promise<void> {
  const url = await ladeWebhookUrlAusDB();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ereignis: "content_generiert",
        contentId,
        marke: auftrag.marke,
        typ: auftrag.typ,
        plattform: auftrag.plattform,
        thema: auftrag.thema,
        inhalt,
        zeitstempel: new Date().toISOString(),
        system: "CyberSarah Revenue OS",
      }),
      signal: AbortSignal.timeout(6000),
    });
    logger.info({ contentId, url }, "Content-Webhook gesendet");
  } catch (err) {
    logger.warn({ contentId, err }, "Content-Webhook fehlgeschlagen — Content trotzdem gespeichert");
  }
}

// Fallback-Templates wenn kein OpenAI-Key vorhanden
const FALLBACK_TEMPLATES: Record<string, string> = {
  tiktok: `# {THEMA} — TikTok Script\n\n[HOOK 0-3s] Wusstest du, dass {THEMA} alles verändert?\n[INHALT 3-45s] Hier sind 3 Dinge die du wissen musst...\n[CTA] Folge mir für mehr KI-Tipps!\n\n#KI #CyberSarah #Automatisierung #GeldVerdienen`,
  reel: `# {THEMA} — Reel\n\n🔥 Hook: {THEMA}\n📌 Punkt 1: Das Wichtigste\n📌 Punkt 2: Der Trick\n📌 Punkt 3: Sofort umsetzen\n💡 CTA: Speichern & Teilen!`,
  kurzVideo: `# {THEMA} — Kurzvideo\n\n[0-5s] Problem: Kennst du das?\n[5-40s] Lösung mit KI in 3 Schritten\n[40-60s] CTA: Jetzt starten`,
  blogartikel: `# {THEMA}\n\n## Einleitung\nIn diesem Artikel zeigen wir, wie {THEMA} dein Business transformiert.\n\n## Schritt 1: Grundlagen\n## Schritt 2: Umsetzung\n## Schritt 3: Optimierung\n\n## Fazit\nStarte heute mit der Umsetzung!`,
};

export async function generiereContent(auftrag: ContentAuftrag, agentId: number): Promise<number> {
  const startzeit = Date.now();

  // Smart-Pause aktiv? → sofort Template-Rotation (kein API-Call für 30 Min)
  if (istSmartPausiert(agentId)) {
    logger.warn({ agentId }, "Content Factory: Smart-Pause aktiv → Template-Rotation");
    return generiereContentFallback(auftrag, agentId, startzeit, "smart-pause-401");
  }

  // Fallback-Modus wenn kein API-Key
  if (!openaiVerfuegbar) {
    return generiereContentFallback(auftrag, agentId, startzeit, "kein-api-key");
  }

  const persona = MARKEN_PERSONAS[auftrag.marke] ?? MARKEN_PERSONAS["CyberSarah"];
  const typAnweisung = TYP_ANWEISUNGEN[auftrag.typ] ?? TYP_ANWEISUNGEN["blogartikel"];

  const prompt = `${typAnweisung}

Thema: ${auftrag.thema}
Plattform: ${auftrag.plattform}
Marke: ${auftrag.marke}

Erstelle hochwertigen, originellen Content auf Deutsch. Keine Platzhalter, echter produktionsreifer Content.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: persona },
        { role: "user", content: prompt },
      ],
      max_tokens: 1500,
      temperature: 0.8,
    });

    const roherInhalt = completion.choices[0]?.message?.content ?? "";
    const inhalt = await fuegeAffiliateLinkHinzu(roherInhalt, auftrag.marke, auftrag.typ);
    const titelZeile = roherInhalt.split("\n")[0]?.replace(/^#+ /, "") ?? auftrag.thema;

    const [neuerContent] = await db.insert(contentTable).values({
      campaignId: auftrag.campaignId ?? null,
      marke: auftrag.marke,
      typ: auftrag.typ,
      plattform: auftrag.plattform,
      titel: titelZeile.substring(0, 490),
      inhalt,
      status: "generiert",
      metadaten: JSON.stringify({ thema: auftrag.thema, model: "gpt-4o-mini", tokens: completion.usage?.total_tokens }),
    }).returning();

    const dauer = Date.now() - startzeit;

    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "Content Factory Agent",
      aktion: `Content generiert: ${auftrag.typ} für ${auftrag.marke}`,
      status: "erfolgreich",
      nachricht: `Content erfolgreich generiert: "${titelZeile.substring(0, 100)}" (${auftrag.plattform})`,
      metadaten: JSON.stringify({ contentId: neuerContent?.id, tokens: completion.usage?.total_tokens }),
      dauer,
    });

    await db.update(agentsTable)
      .set({ letzteAktivitaet: new Date() })
      .where(eq(agentsTable.id, agentId));

    // Auto-Webhook: Content sofort an Make.com / Zapier / n8n senden
    void sendeContentWebhook(neuerContent?.id ?? 0, auftrag, inhalt);

    logger.info({ contentId: neuerContent?.id, marke: auftrag.marke, typ: auftrag.typ }, "Content generiert");
    return neuerContent?.id ?? 0;

  } catch (err) {
    const dauer = Date.now() - startzeit;
    const { istApiKeyFehler, nachricht } = handleOpenAIFehler(err, "Content Factory Agent");

    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "Content Factory Agent",
      aktion: `Content-Generierung ${istApiKeyFehler ? "blockiert (401)" : "fehlgeschlagen"}: ${auftrag.typ}`,
      status: "fehler",
      nachricht,
      dauer,
    });

    if (istApiKeyFehler) {
      // Bei 401: NICHT crashen — Agent 30 Min smart-pausieren + Template-Rotation
      setzeSmartPause(agentId, "Content Factory Agent", "OpenAI 401 — API-Key ungültig");
      logger.warn({ agentId }, "Content Factory: 401 → 30-Min-Smart-Pause + Fallback-Template");
      return generiereContentFallback(auftrag, agentId, startzeit, "smart-pause-401");
    }

    throw err;
  }
}

async function generiereContentFallback(auftrag: ContentAuftrag, agentId: number, startzeit: number, grund = "kein-api-key"): Promise<number> {
  inkrementiereFallbackZaehler(agentId, "Content Factory Agent");
  const template = FALLBACK_TEMPLATES[auftrag.typ] ?? FALLBACK_TEMPLATES["blogartikel"];
  const roherInhalt = template!.replace(/{THEMA}/g, auftrag.thema);
  const inhalt = await fuegeAffiliateLinkHinzu(roherInhalt, auftrag.marke, auftrag.typ);
  const titel = `[Draft] ${auftrag.thema} — ${auftrag.marke}`;

  const [neuerContent] = await db.insert(contentTable).values({
    campaignId: null,
    marke: auftrag.marke,
    typ: auftrag.typ,
    plattform: auftrag.plattform,
    titel: titel.substring(0, 490),
    inhalt,
    status: "entwurf",
    metadaten: JSON.stringify({ thema: auftrag.thema, model: "fallback", grund: "kein-api-key" }),
  }).returning();

  const dauer = Date.now() - startzeit;

  await db.insert(agentLogsTable).values({
    agentId,
    agentName: "Content Factory Agent",
    aktion: `Fallback-Content erstellt: ${auftrag.typ}`,
    status: "erfolgreich",
    nachricht: `Template-Content erstellt (kein API-Key): "${titel.substring(0, 80)}"`,
    dauer,
  });

  await db.update(agentsTable)
    .set({ letzteAktivitaet: new Date() })
    .where(eq(agentsTable.id, agentId));

  return neuerContent?.id ?? 0;
}
