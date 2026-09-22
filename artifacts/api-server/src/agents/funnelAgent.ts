import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { inkrementiereFallbackZaehler } from "./watchdog";
import { db } from "@workspace/db";
import { agentLogsTable, agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface EmailSequenz {
  marke: string;
  sequenzName: string;
  emails: Array<{
    tag: number;
    betreff: string;
    vorschautext: string;
    inhalt: string;
    cta: string;
  }>;
  ziel: string;
  konversionsZiel: string;
}

const FUNNEL_MARKEN: Array<{
  marke: "CyberSarah" | "GeldPilot AI" | "UnternehmerGPT";
  leadMagnet: string;
  produkt: string;
  zielgruppe: string;
}> = [
  {
    marke: "CyberSarah",
    leadMagnet: "5 KI-Prompts die sofort Zeit sparen (kostenlos)",
    produkt: "CyberSarah KI-Kurs (197€)",
    zielgruppe: "Tech-affine Millennials die KI nutzen wollen",
  },
  {
    marke: "GeldPilot AI",
    leadMagnet: "Passives Einkommen Checkliste (kostenlos)",
    produkt: "GeldPilot Pro System (297€)",
    zielgruppe: "Einsteiger die online Geld verdienen wollen",
  },
  {
    marke: "UnternehmerGPT",
    leadMagnet: "KMU Automatisierungs-Audit (kostenlos)",
    produkt: "UnternehmerGPT Business-Paket (497€)",
    zielgruppe: "Selbstständige und kleine Unternehmer",
  },
];

export async function generiereFunnelSequenz(agentId: number): Promise<EmailSequenz> {
  const startzeit = Date.now();
  const auftrag = FUNNEL_MARKEN[Math.floor(Math.random() * FUNNEL_MARKEN.length)]!;

  const prompt = `Erstelle eine 5-E-Mail-Nurturing-Sequenz für ${auftrag.marke}.

Lead-Magnet: ${auftrag.leadMagnet}
Produkt: ${auftrag.produkt}
Zielgruppe: ${auftrag.zielgruppe}

Erstelle eine E-Mail-Sequenz die vom Lead-Magnet zum Kauf führt. Antworte NUR mit validem JSON:
{
  "marke": "${auftrag.marke}",
  "sequenzName": "Name der Sequenz",
  "emails": [
    {
      "tag": 0,
      "betreff": "Willkommen-E-Mail Betreff",
      "vorschautext": "Vorschautext (max. 90 Zeichen)",
      "inhalt": "E-Mail Text (150-250 Wörter, persönlich, wertvoll)",
      "cta": "Button-Text"
    },
    {"tag": 1, "betreff": "...", "vorschautext": "...", "inhalt": "...", "cta": "..."},
    {"tag": 3, "betreff": "...", "vorschautext": "...", "inhalt": "...", "cta": "..."},
    {"tag": 5, "betreff": "...", "vorschautext": "...", "inhalt": "...", "cta": "..."},
    {"tag": 7, "betreff": "Angebot-E-Mail", "vorschautext": "...", "inhalt": "...", "cta": "Jetzt kaufen"}
  ],
  "ziel": "Conversion-Ziel beschreiben",
  "konversionsZiel": "${auftrag.produkt}"
}`;

  if (!openaiVerfuegbar) {
    inkrementiereFallbackZaehler(agentId, "Funnel Agent");
    const fallback: EmailSequenz = { marke: auftrag.marke, sequenzName: `${auftrag.marke} Willkommens-Sequenz`, emails: [{ tag: 0, betreff: `Willkommen bei ${auftrag.marke}!`, vorschautext: "Dein Einstieg beginnt jetzt", inhalt: `Hallo! Danke für dein Interesse an ${auftrag.marke}. Hier sind deine nächsten Schritte...`, cta: "Jetzt starten" }], ziel: "Lead-Nurturing", konversionsZiel: auftrag.produkt };
    const dauer = Date.now() - startzeit;
    await db.insert(agentLogsTable).values({ agentId, agentName: "Funnel Agent", aktion: `E-Mail-Sequenz (Fallback): ${auftrag.marke}`, status: "erfolgreich", nachricht: "Fallback-Sequenz erstellt (kein API-Key)", dauer });
    await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
    return fallback;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `Du bist ein E-Mail-Marketing-Experte für ${auftrag.marke}. Erstelle konversionsstarke, authentische E-Mail-Sequenzen auf Deutsch.` },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.6,
      response_format: { type: "json_object" },
    });

    const sequenz: EmailSequenz = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const dauer = Date.now() - startzeit;
    await db.insert(agentLogsTable).values({ agentId, agentName: "Funnel Agent", aktion: `E-Mail-Sequenz generiert: ${auftrag.marke}`, status: "erfolgreich", nachricht: `"${sequenz.sequenzName}" — ${sequenz.emails?.length ?? 0} E-Mails | Ziel: ${sequenz.konversionsZiel?.substring(0, 60)}`, metadaten: JSON.stringify({ sequenzName: sequenz.sequenzName, marke: auftrag.marke, emailAnzahl: sequenz.emails?.length }), dauer });
    await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
    logger.info({ sequenz: sequenz.sequenzName, marke: auftrag.marke }, "Funnel Agent: E-Mail-Sequenz generiert");
    return sequenz;
  } catch (err) {
    const { istApiKeyFehler } = handleOpenAIFehler(err, "Funnel Agent");
    if (istApiKeyFehler) {
      await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
      return { marke: auftrag.marke, sequenzName: "Basis-Sequenz", emails: [], ziel: "Lead-Nurturing", konversionsZiel: auftrag.produkt };
    }
    throw err;
  }
}
