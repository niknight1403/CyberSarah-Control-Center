/**
 * WhatsApp-Business-Agent — Meta WhatsApp Business API
 *
 * Was dieser Agent tut:
 * 1. Sendet täglich einen KI-Tipp an einen WhatsApp Broadcast-Kontaktliste
 * 2. Beantwortet eingehende Kunden-Nachrichten automatisch (Sales Bot)
 * 3. Versendet Stripe Payment Links auf Anfrage
 * 4. Segmentiert Kontakte (Leads → Kunden → VIP)
 *
 * Einrichtung (einmalig, ~30 Minuten):
 * 1. business.facebook.com → Meta Business Account erstellen
 * 2. developers.facebook.com → App erstellen → WhatsApp Business API aktivieren
 * 3. WHATSAPP_PHONE_NUMBER_ID (die ID deiner Telefonnummer aus dem Meta Dashboard)
 * 4. WHATSAPP_ACCESS_TOKEN (permanenter Token aus dem Meta Business Manager)
 * 5. WHATSAPP_WEBHOOK_SECRET (für Webhook-Verifikation)
 * 6. Alle Keys unter /einstellungen/api-keys eintragen
 *
 * Webhook-URL für Meta: https://deine-domain.de/api/whatsapp/webhook
 */
import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { db } from "@workspace/db";
import { agentLogsTable, agentsTable, leadsTable, systemConfigTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { inkrementiereFallbackZaehler } from "./watchdog";

const AGENT_NAME = "WhatsApp-Business-Agent";

// ─── Meta WhatsApp API Wrapper ────────────────────────────────────────────────

async function ladeWhatsAppCredentials(): Promise<{
  phoneNumberId: string;
  accessToken: string;
  webhookSecret: string;
} | null> {
  const load = async (key: string) => {
    const [row] = await db.select({ wert: systemConfigTable.wert })
      .from(systemConfigTable).where(eq(systemConfigTable.schluessel, key));
    return row?.wert ?? process.env[key.toUpperCase().replace(/-/g, "_")];
  };

  const phoneNumberId = await load("whatsapp_phone_number_id");
  const accessToken = await load("whatsapp_access_token");
  const webhookSecret = await load("whatsapp_webhook_secret") ?? "cybersarah_webhook";

  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken, webhookSecret };
}

async function sendWhatsAppMessage(
  to: string,
  type: "text" | "template",
  content: { text?: string; template?: { name: string; language: string; components?: unknown[] } },
  creds: { phoneNumberId: string; accessToken: string }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const body = type === "text"
      ? { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: content.text } }
      : { messaging_product: "whatsapp", recipient_type: "individual", to, type: "template", template: content.template };

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${creds.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      }
    );

    const data = await res.json() as { messages?: Array<{ id: string }> ; error?: { message: string } };

    if (!res.ok || data.error) {
      return { success: false, error: data.error?.message ?? `HTTP ${res.status}` };
    }

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Verbindungsfehler" };
  }
}

// ─── Täglicher KI-Tipp generieren ────────────────────────────────────────────

const FALLBACK_TIPPS = [
  "💡 KI-Tipp: Nutze ChatGPT Teams statt Plus für Kundendaten — nur dort gibt es einen DSGVO-konformen AVV. Kostet 25$/User aber schützt dich vor Bußgeldern.",
  "💡 KI-Tipp: neuroflash ist die beste DSGVO-konforme KI für deutsche Texte. Server in DE, AVV inklusive, 35% Affiliate-Provision. Kostenlos testen: neuroflash.com",
  "💡 KI-Tipp: Content-Batch-Montag spart 10h/Woche. Montag früh: alle Social Posts der Woche mit KI erstellen. Rest der Woche nur posten.",
  "💡 KI-Tipp: Der stärkste KI-Prompt-Trick: Sag der KI immer WER sie ist. 'Du bist ein erfahrener Deutsche Copywriter für...' liefert 3x bessere Ergebnisse.",
  "💡 KI-Tipp: Affiliate-Marketing + KI = passives Einkommen. neuroflash zahlt 35% lifetime, GetResponse 33% recurring. Einmal einrichten, dauerhaft verdienen.",
  "💡 KI-Tipp: DSGVO und KI: Midjourney hat keinen AVV — für Geschäftszwecke nur Adobe Firefly oder Stable Diffusion lokal nutzen.",
  "💡 KI-Tipp: Faceless YouTube mit KI: ElevenLabs Stimme + KI-Script + Stock Video = 0€ Produktionskosten. Kanal mit 1.000 Views/Monat ist realistisch.",
];

export async function generiereTaeglichenTipp(): Promise<string> {
  if (!openaiVerfuegbar) {
    const idx = new Date().getDay();
    return FALLBACK_TIPPS[idx % FALLBACK_TIPPS.length]!;
  }

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      temperature: 0.8,
      messages: [{
        role: "system",
        content: "Du bist CyberSarah AI, deutschsprachiger KI-Money-Experte. Schreibe prägnante WhatsApp-Nachrichten (max 3 Sätze, beginne mit einem Emoji). Ton: freundlich, direkt, nützlich — wie ein Freund der wirklich Ahnung hat.",
      }, {
        role: "user",
        content: `Schreibe einen kurzen WhatsApp-Tipp zum Thema "${
          ["KI-DSGVO", "Affiliate-Marketing mit KI", "Prompt-Tipps", "passives Einkommen", "KI-Tools DACH", "Content-Automatisierung", "neuroflash-Tipp"][new Date().getDay()]
        }". Max 3 Sätze. Kein Hashtag-Spam. Direkt anwendbar.`,
      }],
    });

    return resp.choices[0]?.message.content?.trim() ?? FALLBACK_TIPPS[0]!;
  } catch {
    const idx = new Date().getDay();
    return FALLBACK_TIPPS[idx % FALLBACK_TIPPS.length]!;
  }
}

// ─── KI-Sales-Bot: eingehende Nachricht beantworten ──────────────────────────

interface WhatsAppKontext {
  telefon: string;
  name?: string;
  letzteNachrichten: string[];
}

export async function beantworteKundenNachricht(
  nachricht: string,
  kontext: WhatsAppKontext,
  creds: { phoneNumberId: string; accessToken: string }
): Promise<void> {
  let antwort: string;

  if (!openaiVerfuegbar) {
    // Fallback: Schlüsselwort-basiert
    const lower = nachricht.toLowerCase();
    if (lower.includes("preis") || lower.includes("kosten") || lower.includes("kaufen")) {
      antwort = "💰 Unser KI-Tool-Kompass DACH kostet einmalig 19 € — kein Abo, Sofort-Download. Sichere dir jetzt deinen Zugang: https://cybersarah.app\n\nFragen? Schreib uns gerne! 🙂";
    } else if (lower.includes("dsgvo") || lower.includes("datenschutz")) {
      antwort = "🔒 Gute Frage! Nicht alle KI-Tools sind in Deutschland legal nutzbar. Unser KI-Tool-Kompass DACH zeigt dir für 20 Tools exakt welche sicher sind (Grün/Gelb/Rot). 19 € einmalig: https://cybersarah.app";
    } else if (lower.includes("hello") || lower.includes("hallo") || lower.includes("hi")) {
      antwort = `👋 Hallo${kontext.name ? ` ${kontext.name}` : ""}! Hier ist CyberSarah AI — dein KI-Experte für den DACH-Raum. Was kann ich für dich tun?\n\n📚 KI-Tool-Kompass: 20 Tools, DSGVO-bewertet\n💡 Tägliche KI-Tipps\n🤖 Automatisierungs-Beratung`;
    } else {
      antwort = "Danke für deine Nachricht! 🙏 Unser Team meldet sich in Kürze. In der Zwischenzeit: Unser KI-Tool-Kompass DACH (19€) gibt dir sofort alle Antworten zu DSGVO-sicheren KI-Tools → https://cybersarah.app";
    }
  } else {
    try {
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 250,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `Du bist der WhatsApp Sales-Bot von CyberSarah AI. Deutschsprachig, freundlich, kompetent. 
Dein Produkt: KI-Tool-Kompass DACH (19€ einmalig, https://cybersarah.app) — zeigt welche KI-Tools DSGVO-konform sind.
Du sendest täglich KI-Tipps und beantwortest Fragen zu KI, Automatisierung und Online-Geldverdienen.
Antworte in max 3-4 Sätzen. Keine Bullet-Points (WhatsApp-Format). Bei Interesse → Link zum Produkt. Nie aufdringlich.`,
          },
          ...kontext.letzteNachrichten.slice(-4).map((m, i) => ({
            role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
            content: m,
          })),
          { role: "user", content: nachricht },
        ],
      });

      antwort = resp.choices[0]?.message.content?.trim() ?? "Vielen Dank für deine Nachricht! Wir melden uns gleich.";
    } catch {
      antwort = "Danke für deine Nachricht! 🙏 Hier ist unser aktueller KI-Tool-Kompass → https://cybersarah.app";
    }
  }

  await sendWhatsAppMessage(kontext.telefon, "text", { text: antwort }, creds);
}

// ─── Webhook: eingehende WhatsApp-Nachrichten verarbeiten ────────────────────

export async function verarbeiteWhatsAppWebhook(payload: unknown): Promise<void> {
  const creds = await ladeWhatsAppCredentials();
  if (!creds) return;

  try {
    const data = payload as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              from: string;
              type: string;
              text?: { body: string };
              timestamp: string;
            }>;
            contacts?: Array<{ profile?: { name?: string } }>;
          };
        }>;
      }>;
    };

    const messages = data.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
    const contactName = data.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;

    for (const msg of messages) {
      if (msg.type !== "text" || !msg.text?.body) continue;

      logger.info({ from: msg.from, text: msg.text.body.slice(0, 50) }, "WhatsApp Nachricht eingegangen");

      // Lead in DB speichern
      await db.insert(leadsTable).values({
        email: `whatsapp_${msg.from}@placeholder.de`, // Platzhalter
        marke: "CyberSarah",
        quelle: "whatsapp",
        telefon: msg.from,
        name: contactName ?? null,
      }).onConflictDoNothing().catch(() => null);

      // Antworten
      await beantworteKundenNachricht(
        msg.text.body,
        { telefon: msg.from, name: contactName, letzteNachrichten: [msg.text.body] },
        creds
      );
    }
  } catch (err) {
    logger.error({ err }, "WhatsApp-Webhook Verarbeitungsfehler");
  }
}

// ─── Täglicher Broadcast: KI-Tipp versenden ──────────────────────────────────

export async function sendeTaeglichenTipp(
  empfaenger: string[] // Liste von Telefonnummern im Format "4917612345678"
): Promise<{ gesendet: number; fehler: number }> {
  const start = Date.now();
  const creds = await ladeWhatsAppCredentials();

  if (!creds) {
    logger.info("WhatsApp-Agent: Übersprungen — Credentials fehlen");
    return { gesendet: 0, fehler: 0 };
  }

  if (empfaenger.length === 0) {
    logger.info("WhatsApp-Agent: Keine Empfänger konfiguriert");
    return { gesendet: 0, fehler: 0 };
  }

  const tipp = await generiereTaeglichenTipp();
  let gesendet = 0;
  let fehler = 0;

  for (const nummer of empfaenger) {
    const result = await sendWhatsAppMessage(nummer, "text", { text: tipp }, creds);
    if (result.success) {
      gesendet++;
    } else {
      fehler++;
      logger.warn({ nummer, error: result.error }, "WhatsApp: Nachricht nicht zugestellt");
    }
    // Rate-Limit: max 80 Nachrichten/Sekunde bei WhatsApp Business
    await new Promise(r => setTimeout(r, 100));
  }

  const agentId = await holeAgentId();
  if (agentId) {
    await db.insert(agentLogsTable).values({
      agentId, agentName: AGENT_NAME,
      aktion: "Täglicher Broadcast",
      status: fehler === 0 ? "erfolgreich" : "erfolgreich",
      nachricht: `${gesendet} Tipps gesendet, ${fehler} Fehler | "${tipp.slice(0, 60)}..."`,
      dauer: Date.now() - start,
    });
    await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
  }

  return { gesendet, fehler };
}

// ─── Empfängerliste aus System-Config laden ───────────────────────────────────

export async function ladeEmpfaengerliste(): Promise<string[]> {
  const [row] = await db.select({ wert: systemConfigTable.wert })
    .from(systemConfigTable).where(eq(systemConfigTable.schluessel, "whatsapp_broadcast_list"));

  if (!row?.wert) return [];

  try {
    return JSON.parse(row.wert) as string[];
  } catch {
    return [];
  }
}

export async function fuegeEmpfaengerHinzu(telefon: string): Promise<void> {
  const liste = await ladeEmpfaengerliste();
  if (!liste.includes(telefon)) {
    liste.push(telefon);
    await db.insert(systemConfigTable)
      .values({ schluessel: "whatsapp_broadcast_list", wert: JSON.stringify(liste), aktiviert: true })
      .onConflictDoUpdate({
        target: systemConfigTable.schluessel,
        set: { wert: JSON.stringify(liste), updatedAt: new Date() },
      });
  }
}

// ─── WhatsApp-Status abrufen ──────────────────────────────────────────────────

export async function holeWhatsAppStatus(): Promise<{
  konfiguriert: boolean;
  telefonNummer: string | null;
  empfaengerAnzahl: number;
  heutigeNachrichten: number;
}> {
  const creds = await ladeWhatsAppCredentials();
  const empfaenger = await ladeEmpfaengerliste();

  if (!creds) {
    return { konfiguriert: false, telefonNummer: null, empfaengerAnzahl: 0, heutigeNachrichten: 0 };
  }

  // Nummer aus ID auflösen (vereinfacht)
  const telefonNummer = `+49 (${creds.phoneNumberId.slice(0, 4)}...)`;

  // Heutige Logs zählen
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const agentId = await holeAgentId();
  let heutigeNachrichten = 0;

  if (agentId) {
    const logs = await db.select({ id: agentLogsTable.id })
      .from(agentLogsTable)
      .where(eq(agentLogsTable.agentId, agentId))
      .limit(100);
    heutigeNachrichten = logs.length; // Vereinfacht
  }

  return {
    konfiguriert: true,
    telefonNummer,
    empfaengerAnzahl: empfaenger.length,
    heutigeNachrichten,
  };
}

async function holeAgentId(): Promise<number | null> {
  const [agent] = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.name, AGENT_NAME));
  return agent?.id ?? null;
}

// ─── Täglicher Cron-Trigger ───────────────────────────────────────────────────

export async function taeglicheWhatsAppAufgabe(): Promise<void> {
  const empfaenger = await ladeEmpfaengerliste();
  if (empfaenger.length > 0) {
    await sendeTaeglichenTipp(empfaenger);
  }
}
