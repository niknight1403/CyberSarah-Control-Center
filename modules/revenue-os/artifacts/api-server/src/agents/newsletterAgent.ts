/**
 * Newsletter-Agent — Beehiiv Integration
 *
 * Was dieser Agent tut:
 * 1. Generiert wöchentlich einen KI-Newsletter (Freitag 08:00 Uhr)
 * 2. Veröffentlicht ihn direkt via Beehiiv API (POST /publications/{id}/posts)
 * 3. Sammelt Abonnenten aus bestehenden Leads + fügt neue via API hinzu
 * 4. Verfolgt Wachstum und Umsatz (Boosts-Netzwerk: 6€/Abo)
 * 5. Fügt automatisch Affiliate-Links aus der DB in jeden Newsletter ein
 *
 * Einrichtung:
 * - BEEHIIV_API_KEY: Settings → API im Beehiiv Dashboard
 * - BEEHIIV_PUBLICATION_ID: URL deiner Publication (pub_xxxxx)
 * - Beides unter /einstellungen/api-keys eintragen
 */
import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { db } from "@workspace/db";
import { agentLogsTable, agentsTable, leadsTable, systemConfigTable } from "@workspace/db";
import { eq, desc, gte } from "drizzle-orm";
import { logger } from "../lib/logger";
import { inkrementiereFallbackZaehler, setzeSmartPause, istSmartPausiert } from "./watchdog";
import { ladeAffiliateLinksAusDB } from "../routes/einstellungen";

const AGENT_NAME = "Newsletter-Agent";

// ─── Beehiiv API Wrapper ──────────────────────────────────────────────────────

async function ladeBeehiivCredentials(): Promise<{ apiKey: string; publicationId: string } | null> {
  const [keyRow] = await db.select({ wert: systemConfigTable.wert })
    .from(systemConfigTable).where(eq(systemConfigTable.schluessel, "beehiiv_api_key"));
  const [pubRow] = await db.select({ wert: systemConfigTable.wert })
    .from(systemConfigTable).where(eq(systemConfigTable.schluessel, "beehiiv_publication_id"));

  const apiKey = keyRow?.wert ?? process.env["BEEHIIV_API_KEY"];
  const publicationId = pubRow?.wert ?? process.env["BEEHIIV_PUBLICATION_ID"];

  if (!apiKey || !publicationId) return null;
  return { apiKey, publicationId };
}

async function beehiivRequest(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
  creds?: { apiKey: string; publicationId: string }
): Promise<unknown> {
  const credentials = creds ?? await ladeBeehiivCredentials();
  if (!credentials) throw new Error("Beehiiv-Credentials fehlen (BEEHIIV_API_KEY + BEEHIIV_PUBLICATION_ID)");

  const res = await fetch(`https://api.beehiiv.com/v2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Beehiiv API Fehler ${res.status}: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ─── Abonnenten-Statistiken ───────────────────────────────────────────────────

export async function holeAbonnentenStats(): Promise<{
  gesamt: number;
  aktiv: number;
  letzteWoche: number;
  boostsVerdienst: number;
} | null> {
  try {
    const creds = await ladeBeehiivCredentials();
    if (!creds) return null;

    const data = await beehiivRequest("GET",
      `/publications/${creds.publicationId}/subscriptions?limit=100&status=active`,
      undefined, creds
    ) as { data?: unknown[]; total_results?: number };

    const gesamt = data.total_results ?? (data.data?.length ?? 0);
    const boostsVerdienst = Math.round(gesamt * 6.4); // durchschnittlicher Beehiiv Boost-Satz KI-Nische

    return { gesamt, aktiv: gesamt, letzteWoche: 0, boostsVerdienst };
  } catch (err) {
    logger.warn({ err }, "Beehiiv Abonnenten-Stats Fehler");
    return null;
  }
}

// ─── Abonnent hinzufügen (aus Leads-DB) ─────────────────────────────────────

export async function fuegeAbonnentHinzu(email: string, marke: string = "CyberSarah"): Promise<boolean> {
  try {
    const creds = await ladeBeehiivCredentials();
    if (!creds) return false;

    await beehiivRequest("POST", `/publications/${creds.publicationId}/subscriptions`, {
      email,
      reactivate_existing: false,
      send_welcome_email: true,
      utm_source: "cybersarah-revenue-os",
      utm_medium: "agent",
      utm_campaign: marke.toLowerCase().replace(/\s+/g, "-"),
    }, creds);

    return true;
  } catch (err) {
    logger.warn({ err, email }, "Beehiiv: Abonnent konnte nicht hinzugefügt werden");
    return false;
  }
}

// ─── Leads aus DB in Beehiiv synchronisieren ─────────────────────────────────

export async function synchronisiereLeadsNachBeehiiv(): Promise<number> {
  const creds = await ladeBeehiivCredentials();
  if (!creds) return 0;

  // Leads der letzten 7 Tage die noch nicht synchronisiert wurden
  const vorWoche = new Date();
  vorWoche.setDate(vorWoche.getDate() - 7);

  const leads = await db.select({ email: leadsTable.email, marke: leadsTable.marke })
    .from(leadsTable)
    .where(gte(leadsTable.createdAt, vorWoche))
    .limit(50);

  let synchronisiert = 0;
  for (const lead of leads) {
    if (lead.email) {
      const ok = await fuegeAbonnentHinzu(lead.email, lead.marke ?? "CyberSarah");
      if (ok) synchronisiert++;
    }
  }

  return synchronisiert;
}

// ─── Newsletter-Inhalt generieren ────────────────────────────────────────────

interface NewsletterInhalt {
  betreff: string;
  previewText: string;
  intro: string;
  hauptinhalt: string;
  tipDerWoche: string;
  affiliateSektionHtml: string;
  cta: string;
  ctaUrl: string;
}

function fallbackNewsletter(kalenderwoche: number): NewsletterInhalt {
  return {
    betreff: `KW${kalenderwoche}: Die 3 KI-Tools die wirklich Geld sparen`,
    previewText: "Ehrlicher Vergleich, keine Werbung, direkt anwendbar.",
    intro: `Willkommen zur KW${kalenderwoche}-Ausgabe des CyberSarah KI-Money-Newsletters. Diese Woche zeigen wir dir, welche Tools wirklich funktionieren.`,
    hauptinhalt: `## 🔧 Tool der Woche: neuroflash\n\nDeutschland's beste KI-Text-Lösung. DSGVO-konform, Server in Deutschland, direkt auf Deutsch.\n\n**Warum es sich lohnt:**\n- Erstellt Texte in 30 Sekunden die früher 2 Stunden dauerten\n- Spart 10+ Stunden pro Woche bei Social Media Content\n- 35% Provision wenn du es weiterempfiehlst\n\n## 💡 Tipp: Content-Batch am Montag\n\nBlockiere Montagvormittag für deine gesamte Woche:\n1. 10 Social-Media-Posts mit KI erstellen\n2. 1 Newsletter schreiben\n3. 2 Blog-Artikel generieren\n\nDas kostet 2 Stunden und gibt dir 30 Stunden zurück.`,
    tipDerWoche: "Nutze ChatGPT Teams (nicht Plus) für Kundendaten — nur dort gibt es einen AVV nach DSGVO.",
    affiliateSektionHtml: "",
    cta: "Zum KI-Tool-Kompass DACH",
    ctaUrl: "https://cybersarah.app",
  };
}

async function generiereNewsletterInhalt(
  marke: "CyberSarah" | "GeldPilot AI" | "UnternehmerGPT",
  affiliateLinks: Array<{ name: string; url: string; provision?: string }>
): Promise<NewsletterInhalt> {
  const datum = new Date();
  const startOfYear = new Date(datum.getFullYear(), 0, 1);
  const kalenderwoche = Math.ceil(((datum.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);

  if (!openaiVerfuegbar) {
    return fallbackNewsletter(kalenderwoche);
  }

  const markenKontext: Record<string, string> = {
    "CyberSarah": "KI-Tools & Automatisierung für Selbstständige und Creator",
    "GeldPilot AI": "Online-Geldverdienen & passives Einkommen durch KI",
    "UnternehmerGPT": "Business-Automatisierung & KI-Einsatz für KMU und Solopreneure",
  };

  const affiliateText = affiliateLinks.slice(0, 3).map(l =>
    `- ${l.name}: ${l.url}${l.provision ? ` (${l.provision} Provision)` : ""}`
  ).join("\n");

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1800,
      temperature: 0.75,
      response_format: { type: "json_object" },
      messages: [{
        role: "system",
        content: `Du bist der Newsletter-Redakteur für ${marke} (${markenKontext[marke]}). Schreibe kompakte, ehrliche Newsletter ohne Buzzwords. Ton: direkt, klar, hilfreich — wie ein Freund der wirklich Ahnung hat.`,
      }, {
        role: "user",
        content: `Erstelle den Newsletter für Kalenderwoche ${kalenderwoche}/${datum.getFullYear()}.

Aktuelle Affiliate-Programme die erwähnt werden können:
${affiliateText || "Stripe, neuroflash (35% Provision), GetResponse (33% recurring)"}

Antworte NUR mit validem JSON:
{
  "betreff": "KW${kalenderwoche}: [prägnanter Betreff, max 50 Zeichen]",
  "previewText": "[Vorschautext, max 80 Zeichen]",
  "intro": "[1-2 Sätze persönliche Begrüßung]",
  "hauptinhalt": "[Hauptteil in Markdown, 200-350 Wörter. Enthält: 1 Tool-Empfehlung, 1 Tutorial/Tipp, 1 echte Zahl/Studie. Keine Füllsätze.]",
  "tipDerWoche": "[Ein konkreter umsetzbarer Tipp, 1-2 Sätze]",
  "cta": "[Button-Text, max 30 Zeichen]",
  "ctaUrl": "https://cybersarah.app"
}`,
      }],
    });

    const raw = resp.choices[0]?.message.content ?? "{}";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as Partial<NewsletterInhalt>;

    // Affiliate-HTML separat aufbauen
    const affiliateSektionHtml = affiliateLinks.length > 0
      ? `<hr><p><strong>🔗 Diese Woche empfehlen wir:</strong></p><ul>${
          affiliateLinks.slice(0, 3).map(l =>
            `<li><a href="${l.url}">${l.name}</a>${l.provision ? ` — ${l.provision} Provision` : ""}</li>`
          ).join("")
        }</ul>`
      : "";

    return {
      betreff: parsed.betreff ?? `KW${kalenderwoche}: KI-Tipps der Woche`,
      previewText: parsed.previewText ?? "Direkt anwendbar.",
      intro: parsed.intro ?? "",
      hauptinhalt: parsed.hauptinhalt ?? "",
      tipDerWoche: parsed.tipDerWoche ?? "",
      affiliateSektionHtml,
      cta: parsed.cta ?? "Mehr erfahren",
      ctaUrl: parsed.ctaUrl ?? "https://cybersarah.app",
    };
  } catch (err) {
    handleOpenAIFehler(err, AGENT_NAME);
    return fallbackNewsletter(kalenderwoche);
  }
}

// ─── Markdown zu HTML konvertieren (minimal) ─────────────────────────────────

function markdownZuHtml(md: string): string {
  return md
    .replace(/## (.*)/g, "<h2>$1</h2>")
    .replace(/### (.*)/g, "<h3>$1</h3>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/- (.*)/g, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^/, "<p>").replace(/$/, "</p>");
}

// ─── Newsletter in Beehiiv veröffentlichen ────────────────────────────────────

export async function veroeffentlicheNewsletter(
  marke: "CyberSarah" | "GeldPilot AI" | "UnternehmerGPT" = "CyberSarah"
): Promise<{ erfolg: boolean; postId?: string; url?: string; nachricht: string }> {
  const start = Date.now();

  const creds = await ladeBeehiivCredentials();
  if (!creds) {
    return {
      erfolg: false,
      nachricht: "Beehiiv-Credentials fehlen. BEEHIIV_API_KEY + BEEHIIV_PUBLICATION_ID unter Einstellungen → API-Keys eintragen.",
    };
  }

  const affiliateLinks = await ladeAffiliateLinksAusDB();
  const inhalt = await generiereNewsletterInhalt(marke, affiliateLinks.map(l => ({
    name: l.cta, url: l.url, provision: l.provision
  })));

  // HTML aufbauen
  const bodyHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
  <p style="font-size: 16px; line-height: 1.7;">${inhalt.intro}</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <div style="font-size: 15px; line-height: 1.8;">
    ${markdownZuHtml(inhalt.hauptinhalt)}
  </div>
  <div style="background: #f0f9ff; border-left: 4px solid #0891b2; padding: 16px; margin: 24px 0; border-radius: 4px;">
    <strong>💡 Tipp der Woche:</strong><br>
    ${inhalt.tipDerWoche}
  </div>
  ${inhalt.affiliateSektionHtml}
  <div style="text-align: center; margin: 32px 0;">
    <a href="${inhalt.ctaUrl}" style="background: #7c3aed; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px;">
      ${inhalt.cta} →
    </a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee;">
  <p style="font-size: 12px; color: #888; text-align: center;">
    ${marke} · Automatisch erstellt von CyberSarah Revenue OS<br>
    Du erhältst diese E-Mail weil du dich angemeldet hast.
  </p>
</div>`;

  try {
    const result = await beehiivRequest("POST",
      `/publications/${creds.publicationId}/posts`,
      {
        subject_line: inhalt.betreff,
        preview_text: inhalt.previewText,
        content_html: bodyHtml,
        content_json: {},
        status: "confirmed",  // "draft" = nur speichern, "confirmed" = sofort senden
        scheduled_at: null,   // null = sofort
        display_thumbnail: false,
        audience: "free",     // "free" = alle Abonnenten, "premium" = nur paid
        send_count: null,     // null = alle
        content_tags: ["ki", marke.toLowerCase().replace(/\s+/g, "-"), "automatisiert"],
        split_test_subject_line: null,
      },
      creds
    ) as { data?: { id?: string; url?: string } };

    const postId = result?.data?.id;
    const url = result?.data?.url;
    const dauer = Date.now() - start;

    // Leads synchronisieren
    const synchronisiert = await synchronisiereLeadsNachBeehiiv();

    // Protokollieren
    const agentId = await holeAgentId();
    if (agentId) {
      await db.insert(agentLogsTable).values({
        agentId, agentName: AGENT_NAME,
        aktion: "Newsletter veröffentlicht",
        status: "erfolgreich",
        nachricht: `"${inhalt.betreff}" | ${synchronisiert} neue Leads synchronisiert`,
        dauer,
        metadaten: JSON.stringify({ postId, url, marke, betreff: inhalt.betreff }),
      });
      await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
    }

    return { erfolg: true, postId, url, nachricht: `Newsletter "${inhalt.betreff}" erfolgreich veröffentlicht. ${synchronisiert} Leads synchronisiert.` };
  } catch (err) {
    const nachricht = err instanceof Error ? err.message : "Unbekannter Fehler";
    logger.error({ err }, "Newsletter-Agent: Veröffentlichung fehlgeschlagen");
    return { erfolg: false, nachricht };
  }
}

// ─── Letzte Newsletter-Posts abrufen ─────────────────────────────────────────

export async function holeLetzteNewsletter(limit: number = 5): Promise<Array<{
  id: string;
  betreff: string;
  status: string;
  webUrl: string;
  erstelltAm: string;
  empfaenger: number;
  oeffnungsrate?: number;
}>> {
  try {
    const creds = await ladeBeehiivCredentials();
    if (!creds) return [];

    const data = await beehiivRequest("GET",
      `/publications/${creds.publicationId}/posts?limit=${limit}&order_by=created_at&direction=desc`,
      undefined, creds
    ) as { data?: Array<{
      id: string;
      subject_line?: string;
      status?: string;
      web_url?: string;
      created_at?: number;
      stats?: { recipients?: number; open_rate?: number };
    }> };

    return (data.data ?? []).map(p => ({
      id: p.id,
      betreff: p.subject_line ?? "(kein Betreff)",
      status: p.status ?? "unknown",
      webUrl: p.web_url ?? "",
      erstelltAm: p.created_at ? new Date(p.created_at * 1000).toISOString() : "",
      empfaenger: p.stats?.recipients ?? 0,
      oeffnungsrate: p.stats?.open_rate,
    }));
  } catch (err) {
    logger.warn({ err }, "Beehiiv: Letzte Posts konnten nicht geladen werden");
    return [];
  }
}

async function holeAgentId(): Promise<number | null> {
  const [agent] = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.name, AGENT_NAME));
  return agent?.id ?? null;
}

// ─── Wöchentlicher Cron-Trigger ──────────────────────────────────────────────

export async function woechentlicherNewsletterScan(): Promise<void> {
  const agentId = await holeAgentId();
  if (agentId && await istSmartPausiert(agentId)) return;

  const creds = await ladeBeehiivCredentials();
  if (!creds) {
    logger.info("Newsletter-Agent: Übersprungen — Beehiiv-Credentials fehlen");
    return;
  }

  await veroeffentlicheNewsletter("GeldPilot AI");
}
