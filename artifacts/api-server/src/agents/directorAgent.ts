import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { db } from "@workspace/db";
import { agentLogsTable, agentsTable, campaignsTable, contentTable } from "@workspace/db";
import { eq, sql, gte } from "drizzle-orm";
import { logger } from "../lib/logger";
import { inkrementiereFallbackZaehler } from "./watchdog";

export interface StrategieAnalyse {
  empfohleneMake: string;
  empfohleneNische: string;
  empfohlenePlattform: string;
  prioritaet: "hoch" | "mittel" | "niedrig";
  begruendung: string;
  naechsteAktionen: string[];
}

const FALLBACK_STRATEGIE: StrategieAnalyse = {
  empfohleneMake: "CyberSarah",
  empfohleneNische: "KI-Automatisierung für Einsteiger",
  empfohlenePlattform: "TikTok",
  prioritaet: "hoch",
  begruendung: "Automatische Fallback-Strategie — TikTok hat höchste Reichweite für KI-Content 2026",
  naechsteAktionen: [
    "3 TikTok-Videos zu KI-Tools erstellen",
    "Affiliate-Links für Digistore24 eintragen",
    "Community-Engagement steigern",
  ],
};

export async function fuehreStrategieAnalyseDurch(agentId: number): Promise<StrategieAnalyse> {
  const startzeit = Date.now();

  const aktiveCampaigns = await db.select().from(campaignsTable).where(eq(campaignsTable.status, "aktiv")).limit(10);
  const letzteWoche = new Date();
  letzteWoche.setDate(letzteWoche.getDate() - 7);
  const recentContent = await db.select().from(contentTable).where(gte(contentTable.createdAt, letzteWoche)).limit(20);

  const kontext = {
    aktiveCampaigns: aktiveCampaigns.length,
    marken: [...new Set(aktiveCampaigns.map(c => c.marke))],
    contentDieseWoche: recentContent.length,
    contentNachPlattform: recentContent.reduce((acc, c) => {
      acc[c.plattform] = (acc[c.plattform] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  // Fallback wenn kein API-Key
  if (!openaiVerfuegbar) {
    inkrementiereFallbackZaehler(agentId, "Director Agent");
    const dauer = Date.now() - startzeit;
    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "Director Agent",
      aktion: "Strategische Analyse (Fallback)",
      status: "erfolgreich",
      nachricht: `Fallback-Strategie: ${FALLBACK_STRATEGIE.empfohlenePlattform} / ${FALLBACK_STRATEGIE.empfohleneNische}`,
      dauer,
    });
    await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
    return FALLBACK_STRATEGIE;
  }

  const prompt = `Du bist der Director Agent des CyberSarah Revenue OS — das strategische Gehirn.

Aktueller System-Status:
${JSON.stringify(kontext, null, 2)}

Verfügbare Marken:
- CyberSarah (KI & Automatisierung, Tech-Millennials)
- GeldPilot AI (Online Geldverdienen, Einsteiger)
- UnternehmerGPT (KMU-Automatisierung, Selbstständige)

Analysiere den aktuellen Status und gib eine strategische Empfehlung.
Antworte NUR mit validem JSON in diesem Format:
{
  "empfohleneMake": "Markenname",
  "empfohleneNische": "spezifische Nische",
  "empfohlenePlattform": "Plattformname",
  "prioritaet": "hoch|mittel|niedrig",
  "begruendung": "kurze Begründung",
  "naechsteAktionen": ["Aktion 1", "Aktion 2", "Aktion 3"]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Du bist ein strategischer CEO für KI-Revenue-Systeme. Antworte ausschließlich mit validem JSON." },
        { role: "user", content: prompt },
      ],
      max_tokens: 600,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const rawContent = completion.choices[0]?.message?.content ?? "{}";
    const analyse: StrategieAnalyse = JSON.parse(rawContent);
    const dauer = Date.now() - startzeit;

    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "Director Agent",
      aktion: "Strategische Analyse durchgeführt",
      status: "erfolgreich",
      nachricht: `Empfehlung: ${analyse.empfohleneMake} / ${analyse.empfohleneNische} (Priorität: ${analyse.prioritaet})`,
      metadaten: JSON.stringify(analyse),
      dauer,
    });

    await db.update(agentsTable)
      .set({ letzteAktivitaet: new Date() })
      .where(eq(agentsTable.id, agentId));

    logger.info({ analyse }, "Director Agent Analyse abgeschlossen");
    return analyse;

  } catch (err) {
    const dauer = Date.now() - startzeit;
    const { istApiKeyFehler, nachricht } = handleOpenAIFehler(err, "Director Agent");

    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "Director Agent",
      aktion: `Strategische Analyse ${istApiKeyFehler ? "blockiert (401)" : "fehlgeschlagen"}`,
      status: istApiKeyFehler ? "erfolgreich" : "fehler",
      nachricht: istApiKeyFehler ? `⚠️ API-Key 401 → Fallback-Strategie aktiv` : nachricht,
      dauer,
    });

    if (istApiKeyFehler) {
      inkrementiereFallbackZaehler(agentId, "Director Agent");
      await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
      return FALLBACK_STRATEGIE;
    }

    throw err;
  }
}
