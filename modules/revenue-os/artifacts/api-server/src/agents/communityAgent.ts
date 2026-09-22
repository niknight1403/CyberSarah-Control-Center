import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { inkrementiereFallbackZaehler } from "./watchdog";
import { db } from "@workspace/db";
import { agentLogsTable, agentsTable, contentTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface CommunityReport {
  marke: string;
  kommentarAntworten: Array<{ kommentar: string; antwort: string }>;
  dmVorlage: string;
  leadQualifizierungsFragen: string[];
  engagementTipps: string[];
  postedHashtags: string[];
}

const COMMUNITY_KONTEXTE: Array<{ marke: "CyberSarah" | "GeldPilot AI" | "UnternehmerGPT"; typischeKommentare: string[] }> = [
  {
    marke: "CyberSarah",
    typischeKommentare: [
      "Wie fange ich mit KI an?",
      "Welche KI-Tools sind wirklich kostenlos?",
      "Kannst du mir das genauer erklären?",
      "Das funktioniert bei mir nicht",
      "Wie lange hat das gedauert?",
    ],
  },
  {
    marke: "GeldPilot AI",
    typischeKommentare: [
      "Ist das wirklich möglich oder Betrug?",
      "Wie viel Geld brauchst du am Anfang?",
      "Wie lange bis zum ersten Einkommen?",
      "Geht das auch als Schüler/Student?",
      "Welche Plattform empfiehlst du?",
    ],
  },
  {
    marke: "UnternehmerGPT",
    typischeKommentare: [
      "Lohnt sich das für mein kleines Unternehmen?",
      "Wie viel Zeit muss ich investieren?",
      "Brauche ich technische Kenntnisse?",
      "Was kostet die Implementierung?",
      "Hast du Referenzen?",
    ],
  },
];

export async function verarbeiteCommunitiy(agentId: number): Promise<CommunityReport> {
  const startzeit = Date.now();
  const kontext = COMMUNITY_KONTEXTE[Math.floor(Math.random() * COMMUNITY_KONTEXTE.length)]!;

  // Letzten generierten Content als Kontext laden
  const letzterContent = await db
    .select({ titel: contentTable.titel, plattform: contentTable.plattform })
    .from(contentTable)
    .where(eq(contentTable.marke, kontext.marke))
    .orderBy(desc(contentTable.createdAt))
    .limit(3);

  const contentKontext = letzterContent.map(c => `"${c.titel}" (${c.plattform})`).join(", ");

  const prompt = `Du bist der Community-Manager für ${kontext.marke}.

Letzter Content: ${contentKontext || "Noch kein Content vorhanden"}

Typische Kommentare die du bekommst:
${kontext.typischeKommentare.map((k, i) => `${i + 1}. "${k}"`).join("\n")}

Erstelle authentische Community-Antworten und Engagement-Strategien. Antworte NUR mit validem JSON:
{
  "marke": "${kontext.marke}",
  "kommentarAntworten": [
    {"kommentar": "Kommentar 1", "antwort": "Authentische Antwort (50-100 Wörter, persönlich, hilfreich)"},
    {"kommentar": "Kommentar 2", "antwort": "..."},
    {"kommentar": "Kommentar 3", "antwort": "..."}
  ],
  "dmVorlage": "DM-Vorlage für qualifizierte Leads (100-150 Wörter)",
  "leadQualifizierungsFragen": ["Frage 1", "Frage 2", "Frage 3"],
  "engagementTipps": ["Tipp 1", "Tipp 2", "Tipp 3"],
  "postedHashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}`;

  if (!openaiVerfuegbar) {
    inkrementiereFallbackZaehler(agentId, "Community Agent");
    const dauer = Date.now() - startzeit;
    const fallback: CommunityReport = { marke: kontext.marke, kommentarAntworten: kontext.typischeKommentare.slice(0, 3).map(k => ({ kommentar: k, antwort: `Danke für deine Frage! Schau in meine Bio-Links für mehr Infos. Gerne auch per DM! 🙌` })), dmVorlage: `Hallo! Danke für dein Interesse an ${kontext.marke}. Ich würde dir gerne mehr zeigen — wann hast du 15 Min?`, leadQualifizierungsFragen: ["Was ist dein größtes Problem?", "Was hast du schon versucht?", "Wie schnell willst du Ergebnisse?"], engagementTipps: ["Täglich kommentieren", "Stories nutzen", "Direkt antworten"], postedHashtags: ["#KI", "#CyberSarah", "#Automatisierung"] };
    await db.insert(agentLogsTable).values({ agentId, agentName: "Community Agent", aktion: `Community (Fallback): ${kontext.marke}`, status: "erfolgreich", nachricht: "Fallback-Report erstellt (kein API-Key)", dauer });
    await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
    return fallback;
  }

  let report: CommunityReport;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `Du bist ein authentischer Community-Manager für ${kontext.marke}. Deine Antworten sind persönlich, hilfreich und bauen Vertrauen auf. Antworte ausschließlich mit validem JSON auf Deutsch.` },
        { role: "user", content: prompt },
      ],
      max_tokens: 1000,
      temperature: 0.6,
      response_format: { type: "json_object" },
    });
    report = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  } catch (err) {
    const { istApiKeyFehler } = handleOpenAIFehler(err, "Community Agent");
    if (istApiKeyFehler) {
      await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
      return { marke: kontext.marke, kommentarAntworten: [], dmVorlage: "", leadQualifizierungsFragen: [], engagementTipps: [], postedHashtags: [] };
    }
    throw err;
  }

  const dauer = Date.now() - startzeit;

  await db.insert(agentLogsTable).values({
    agentId,
    agentName: "Community Agent",
    aktion: `Community-Management: ${kontext.marke}`,
    status: "erfolgreich",
    nachricht: `${report.kommentarAntworten?.length ?? 0} Kommentar-Antworten generiert | ${report.leadQualifizierungsFragen?.length ?? 0} Lead-Fragen | ${report.engagementTipps?.length ?? 0} Tipps`,
    metadaten: JSON.stringify({ marke: kontext.marke, antworten: report.kommentarAntworten?.length }),
    dauer,
  });

  await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
  logger.info({ marke: kontext.marke }, "Community Agent: Report generiert");
  return report;
}
