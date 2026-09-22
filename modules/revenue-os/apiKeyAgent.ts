/**
 * API-Key-Agent — autonomer API-Integrations-Manager
 *
 * Aufgaben:
 * 1. Scannt verfügbare APIs die zum Umsatz beitragen (Affiliate, Content, Analytics)
 * 2. Speichert bekannte API-Key-Slots in der DB
 * 3. Testet vorhandene Keys auf Gültigkeit
 * 4. Gibt Einrichtungsanleitungen mit direkten Links aus
 * 5. Integriert neue Keys automatisch in die laufenden Agenten
 */
import { db } from "@workspace/db";
import { systemConfigTable, agentLogsTable, agentsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { openai, openaiVerfuegbar } from "../lib/openaiClient";

const AGENT_NAME = "API-Key-Agent";

// ─── Bekannte APIs die echten Umsatz ermöglichen ─────────────────────────────

export interface ApiSlot {
  schluessel: string;          // env var name / system_config key
  name: string;                // Anzeigename
  kategorie: "pflicht" | "umsatz" | "content" | "analytics";
  beschreibung: string;
  einrichtungsUrl: string;
  testUrl?: string;            // REST-Endpoint zum Testen (HEAD/GET)
  testHeader?: string;         // z.B. "Authorization: Bearer {key}"
  umsatzPotenzial: "hoch" | "mittel" | "niedrig";
  monatlicheKosten: string;
  provision?: string;
  autoIntegrierbar: boolean;   // kann der Agent es selbst einrichten?
}

export const BEKANNTE_API_SLOTS: ApiSlot[] = [
  // ── PFLICHT ────────────────────────────────────────────────────────────────
  {
    schluessel: "OPENAI_API_KEY",
    name: "OpenAI API",
    kategorie: "pflicht",
    beschreibung: "Echte KI-Texte, Trend-Analyse, HARA-Vorschläge — ohne diesen Key laufen alle KI-Agenten im Fallback-Modus",
    einrichtungsUrl: "https://platform.openai.com/api-keys",
    testUrl: "https://api.openai.com/v1/models",
    testHeader: "Authorization: Bearer {key}",
    umsatzPotenzial: "hoch",
    monatlicheKosten: "ca. 5–30 € je nach Nutzung",
    autoIntegrierbar: true,
  },
  {
    schluessel: "STRIPE_SECRET_KEY",
    name: "Stripe Zahlungen",
    kategorie: "pflicht",
    beschreibung: "Echte Zahlungen empfangen, Payment Links erstellen, Webhooks verarbeiten",
    einrichtungsUrl: "https://dashboard.stripe.com/apikeys",
    testUrl: "https://api.stripe.com/v1/account",
    testHeader: "Authorization: Bearer {key}",
    umsatzPotenzial: "hoch",
    monatlicheKosten: "0 € + 1,5% + 0,25€ pro Transaktion",
    autoIntegrierbar: true,
  },
  // ── UMSATZ ─────────────────────────────────────────────────────────────────
  {
    schluessel: "DIGISTORE24_API_KEY",
    name: "Digistore24 Affiliate",
    kategorie: "umsatz",
    beschreibung: "25–60% Provision auf KI-Kurse, digitale Produkte — direkter Umsatzhebel",
    einrichtungsUrl: "https://www.digistore24.com/app/api_keys",
    testUrl: "https://www.digistore24.com/api/call/all/products/",
    testHeader: "X-DS24-AUTH-TOKEN: {key}",
    umsatzPotenzial: "hoch",
    monatlicheKosten: "0 € (Provision-Modell)",
    provision: "25–60%",
    autoIntegrierbar: true,
  },
  {
    schluessel: "NEUROFLASH_API_KEY",
    name: "neuroflash Affiliate",
    kategorie: "umsatz",
    beschreibung: "35% Lifetime-Provision auf alle neuroflash-Abos die du vermittelst",
    einrichtungsUrl: "https://neuroflash.com/de/partner/",
    umsatzPotenzial: "hoch",
    monatlicheKosten: "0 € (Affiliate)",
    provision: "35% lifetime",
    autoIntegrierbar: false,
  },
  {
    schluessel: "AMAZON_AFFILIATE_TAG",
    name: "Amazon PartnerNet",
    kategorie: "umsatz",
    beschreibung: "3–10% auf alle Amazon-Käufe über deine Links (KI-Tools, Bücher, Tech)",
    einrichtungsUrl: "https://affiliate-program.amazon.de",
    umsatzPotenzial: "mittel",
    monatlicheKosten: "0 € (Affiliate)",
    provision: "3–10%",
    autoIntegrierbar: false,
  },
  {
    schluessel: "GETRESPONSE_API_KEY",
    name: "GetResponse E-Mail",
    kategorie: "umsatz",
    beschreibung: "E-Mail-Listen aufbauen UND 33% Affiliate-Provision auf vermittelte Abos",
    einrichtungsUrl: "https://app.getresponse.com/api",
    testUrl: "https://api.getresponse.com/v3/accounts",
    testHeader: "X-Auth-Token: api-key {key}",
    umsatzPotenzial: "hoch",
    monatlicheKosten: "15–50 €/Monat (eigene Nutzung) oder 0 € als reines Affiliate",
    provision: "33% recurring",
    autoIntegrierbar: true,
  },
  // ── CONTENT ────────────────────────────────────────────────────────────────
  {
    schluessel: "ELEVENLABS_API_KEY",
    name: "ElevenLabs Stimme",
    kategorie: "content",
    beschreibung: "Professionelle KI-Stimme für Faceless Videos und Audiocontent",
    einrichtungsUrl: "https://elevenlabs.io/api",
    testUrl: "https://api.elevenlabs.io/v1/user",
    testHeader: "xi-api-key: {key}",
    umsatzPotenzial: "mittel",
    monatlicheKosten: "5–22 €/Monat",
    autoIntegrierbar: true,
  },
  {
    schluessel: "SERP_API_KEY",
    name: "SerpAPI (Google Trends)",
    kategorie: "analytics",
    beschreibung: "Echte Google-Trenddaten statt zufälliger THEMEN_POOL — massiver Qualitätssprung für Trend-Agent",
    einrichtungsUrl: "https://serpapi.com/manage-api-key",
    testUrl: "https://serpapi.com/account",
    testHeader: "Authorization: Bearer {key}",
    umsatzPotenzial: "mittel",
    monatlicheKosten: "0 € (100 Suchen/Monat kostenlos)",
    autoIntegrierbar: true,
  },
  {
    schluessel: "YOUTUBE_API_KEY",
    name: "YouTube Data API",
    kategorie: "analytics",
    beschreibung: "Trending-Videos analysieren für bessere Content-Ideen — kostenlos",
    einrichtungsUrl: "https://console.cloud.google.com/apis/credentials",
    testUrl: "https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&key={key}",
    umsatzPotenzial: "mittel",
    monatlicheKosten: "0 € (kostenlos bis 10.000 Einheiten/Tag)",
    autoIntegrierbar: true,
  },
  {
    schluessel: "MAILCHIMP_API_KEY",
    name: "Mailchimp E-Mail",
    kategorie: "content",
    beschreibung: "E-Mail-Kampagnen automatisch versenden und E-Mail-Listen verwalten",
    einrichtungsUrl: "https://us1.admin.mailchimp.com/account/api/",
    umsatzPotenzial: "mittel",
    monatlicheKosten: "0 € bis 500 Kontakte kostenlos",
    autoIntegrierbar: true,
  },
];

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

async function holeAgentId(): Promise<number | null> {
  const [agent] = await db.select({ id: agentsTable.id })
    .from(agentsTable).where(eq(agentsTable.name, AGENT_NAME));
  return agent?.id ?? null;
}

async function protokolliere(
  aktion: string,
  status: "erfolgreich" | "fehler",
  nachricht: string,
  dauer?: number
): Promise<void> {
  const agentId = await holeAgentId();
  if (agentId === null) return;
  await db.insert(agentLogsTable).values({ agentId, agentName: AGENT_NAME, aktion, status, nachricht, dauer });
  await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
}

// ─── API-Key aus DB oder Env lesen ───────────────────────────────────────────

async function ladeApiKey(schluessel: string): Promise<string | null> {
  // Zuerst Env-Var prüfen (höchste Priorität)
  const envVal = process.env[schluessel];
  if (envVal && envVal.length > 8 && !envVal.includes("HIER_EINTRAGEN")) {
    return envVal;
  }
  // Dann DB (system_config)
  const [row] = await db.select({ wert: systemConfigTable.wert })
    .from(systemConfigTable).where(eq(systemConfigTable.schluessel, schluessel.toLowerCase()));
  if (row?.wert && row.wert.length > 8) return row.wert;
  return null;
}

// ─── API-Key speichern ────────────────────────────────────────────────────────

export async function speichereApiKey(schluessel: string, wert: string): Promise<void> {
  await db.insert(systemConfigTable)
    .values({ schluessel: schluessel.toLowerCase(), wert, aktiviert: true })
    .onConflictDoUpdate({
      target: systemConfigTable.schluessel,
      set: { wert, aktiviert: true, updatedAt: new Date() },
    });
  logger.info({ schluessel }, "API-Key gespeichert");
}

// ─── API-Key testen ───────────────────────────────────────────────────────────

export async function testeApiKey(slot: ApiSlot, key: string): Promise<{ gueltig: boolean; nachricht: string }> {
  if (!slot.testUrl) {
    return { gueltig: true, nachricht: "Kein automatischer Test verfügbar — manuell prüfen" };
  }

  try {
    const url = slot.testUrl.replace("{key}", key);
    const headers: Record<string, string> = { "User-Agent": "CyberSarah/1.0" };

    if (slot.testHeader) {
      const [headerName, ...valueParts] = slot.testHeader.replace("{key}", key).split(": ");
      if (headerName && valueParts.length > 0) {
        headers[headerName] = valueParts.join(": ");
      }
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });

    if (res.ok) {
      return { gueltig: true, nachricht: `✅ Verbindung erfolgreich (HTTP ${res.status})` };
    } else if (res.status === 401 || res.status === 403) {
      return { gueltig: false, nachricht: `❌ Ungültiger Key (HTTP ${res.status})` };
    } else {
      return { gueltig: true, nachricht: `⚠️ Verbunden (HTTP ${res.status}) — Key scheint gültig` };
    }
  } catch (err) {
    return { gueltig: false, nachricht: `❌ Verbindungsfehler: ${err instanceof Error ? err.message : "Unbekannt"}` };
  }
}

// ─── Status aller API-Keys abrufen ───────────────────────────────────────────

export interface ApiKeyStatus {
  schluessel: string;
  name: string;
  kategorie: string;
  gesetzt: boolean;
  getestet: boolean;
  gueltig: boolean | null;
  testNachricht: string | null;
  einrichtungsUrl: string;
  umsatzPotenzial: string;
  monatlicheKosten: string;
  provision?: string;
  autoIntegrierbar: boolean;
}

export async function holeAlleApiKeyStatus(): Promise<ApiKeyStatus[]> {
  const result: ApiKeyStatus[] = [];

  for (const slot of BEKANNTE_API_SLOTS) {
    const key = await ladeApiKey(slot.schluessel);
    const gesetzt = key !== null;

    result.push({
      schluessel: slot.schluessel,
      name: slot.name,
      kategorie: slot.kategorie,
      gesetzt,
      getestet: false,
      gueltig: null,
      testNachricht: null,
      einrichtungsUrl: slot.einrichtungsUrl,
      umsatzPotenzial: slot.umsatzPotenzial,
      monatlicheKosten: slot.monatlicheKosten,
      provision: slot.provision,
      autoIntegrierbar: slot.autoIntegrierbar,
    });
  }

  return result;
}

// ─── Autonomer API-Scan: Neue umsatzstarke APIs suchen (via OpenAI) ──────────

export async function sucheNeueApis(): Promise<string[]> {
  if (!openaiVerfuegbar) {
    return ["OpenAI API-Key fehlt — autonome API-Suche nicht möglich. OpenAI-Key unter Einstellungen eintragen."];
  }

  const bereitsKonfiguriert = (await holeAlleApiKeyStatus())
    .filter(s => s.gesetzt).map(s => s.name);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 800,
    temperature: 0.3,
    messages: [{
      role: "user",
      content: `Du bist ein KI-Business-Stratege. Das CyberSarah Revenue OS ist ein deutschsprachiges KI-Agenten-System für autonome Umsatzgenerierung (KI-Kurse, Affiliate, Content).

Bereits integriert: ${bereitsKonfiguriert.join(", ")}

Empfehle 5 NEUE APIs/Services die KONKRETEN Umsatz für dieses System bringen könnten.
Fokus auf: Affiliate-Netzwerke, E-Mail-Marketing, Social-Media-Automatisierung, KI-Content-APIs.
Nur kostenlose oder provisions-basierte Optionen.

Antworte als JSON-Array mit genau dieser Struktur:
[{"name": "API-Name", "url": "https://...", "grund": "Warum Umsatz", "provision": "X%", "kosten": "0€/Monat"}]`
    }],
  });

  const raw = completion.choices[0]?.message?.content ?? "[]";
  try {
    const apis = JSON.parse(raw.replace(/```json|```/g, "").trim()) as Array<{
      name: string; url: string; grund: string; provision: string; kosten: string;
    }>;
    return apis.map(a => `**${a.name}** (${a.provision}) — ${a.grund} → ${a.url}`);
  } catch {
    return [raw];
  }
}

// ─── Haupt-Scan-Funktion ──────────────────────────────────────────────────────

export async function scannApiIntegrationen(): Promise<{
  gesetzt: number;
  fehlend: number;
  monatlichesUmsatzpotenzial: string;
  naechsteEmpfehlung: string;
  alleStatus: ApiKeyStatus[];
}> {
  const start = Date.now();
  const alleStatus = await holeAlleApiKeyStatus();

  const gesetzt = alleStatus.filter(s => s.gesetzt).length;
  const fehlend = alleStatus.filter(s => !s.gesetzt).length;

  // Wichtigste fehlende API ermitteln
  const prioritaet = ["pflicht", "umsatz", "content", "analytics"];
  const naechste = alleStatus
    .filter(s => !s.gesetzt)
    .sort((a, b) => prioritaet.indexOf(a.kategorie) - prioritaet.indexOf(b.kategorie))[0];

  const naechsteEmpfehlung = naechste
    ? `${naechste.name} einrichten → ${naechste.einrichtungsUrl} (${naechste.monatlicheKosten})`
    : "Alle wichtigen APIs sind konfiguriert ✅";

  // Umsatzpotenzial-Schätzung
  const hochPotenzial = alleStatus.filter(s => !s.gesetzt && s.umsatzPotenzial === "hoch").length;
  const monatlichesUmsatzpotenzial = hochPotenzial > 0
    ? `+${hochPotenzial * 200}–${hochPotenzial * 800} €/Monat durch ${hochPotenzial} fehlende High-Impact-APIs`
    : "Volles Potenzial ausgeschöpft";

  await protokolliere(
    "API-Scan",
    "erfolgreich",
    `${gesetzt} APIs aktiv, ${fehlend} fehlend. Nächste: ${naechste?.name ?? "alle gesetzt"}`,
    Date.now() - start
  );

  return { gesetzt, fehlend, monatlichesUmsatzpotenzial, naechsteEmpfehlung, alleStatus };
}
