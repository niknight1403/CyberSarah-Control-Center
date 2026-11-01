import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { inkrementiereFallbackZaehler } from "./watchdog";
import { db } from "@workspace/db";
import { agentLogsTable, agentsTable, contentTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface VideoSkript {
  titel: string;
  hook: string;
  hauptinhalt: string;
  callToAction: string;
  thumbnailText: string;
  beschreibung: string;
  tags: string[];
  empfohleneMusik: string;
}

const VIDEO_THEMEN: Array<{ marke: "CyberSarah" | "GeldPilot AI" | "UnternehmerGPT"; thema: string; plattform: "TikTok" | "YouTube" | "Instagram" }> = [
  { marke: "CyberSarah", thema: "5 KI-Tools die dein Business 10x produktiver machen", plattform: "YouTube" },
  { marke: "CyberSarah", thema: "Ich habe 30 Tage lang KI für alles genutzt — das Ergebnis", plattform: "TikTok" },
  { marke: "GeldPilot AI", thema: "So verdienst du dein erstes Geld online — Schritt für Schritt", plattform: "YouTube" },
  { marke: "GeldPilot AI", thema: "Affiliate Marketing Fehler die mich 500€ gekostet haben", plattform: "TikTok" },
  { marke: "UnternehmerGPT", thema: "Wie KMUs 2026 mit KI konkurrenzfähig bleiben", plattform: "YouTube" },
  { marke: "UnternehmerGPT", thema: "3 Automatisierungen die ich sofort in jedem Business einführen würde", plattform: "Instagram" },
];

export async function generiereVideoSkript(agentId: number): Promise<VideoSkript> {
  const startzeit = Date.now();
  const auftrag = VIDEO_THEMEN[Math.floor(Math.random() * VIDEO_THEMEN.length)]!;

  const prompt = `Erstelle ein vollständiges Video-Skript für ${auftrag.plattform}.

Marke: ${auftrag.marke}
Thema: ${auftrag.thema}
Plattform: ${auftrag.plattform}

Antworte NUR mit validem JSON:
{
  "titel": "Video-Titel (max. 70 Zeichen)",
  "hook": "Die ersten 3-5 Sekunden — extrem aufmerksamkeitsstark",
  "hauptinhalt": "Das vollständige Skript mit Zeitmarkierungen [0:00], [0:15] etc.",
  "callToAction": "Spezifischer CTA am Ende",
  "thumbnailText": "3-5 Wörter für das Thumbnail",
  "beschreibung": "YouTube/TikTok Beschreibung (200-300 Zeichen)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "empfohleneMusik": "Musikstil/Genre-Empfehlung"
}`;

  if (!openaiVerfuegbar) {
    inkrementiereFallbackZaehler(agentId, "Video Agent");
    const fallback: VideoSkript = { titel: auftrag.thema.substring(0, 70), hook: "Das verändert alles! 🚀", hauptinhalt: `[0:00] Intro\n[0:05] ${auftrag.thema}\n[0:30] 3 wichtige Punkte\n[0:50] Fazit`, callToAction: "Folgen & mehr erfahren!", thumbnailText: "KI TRICK 2026", beschreibung: `${auftrag.thema} | ${auftrag.marke}`, tags: ["#KI", "#CyberSarah", "#Automatisierung", "#TikTok2026"], empfohleneMusik: "Upbeat elektronisch" };
    const dauer = Date.now() - startzeit;
    await db.insert(contentTable).values({ marke: auftrag.marke, typ: auftrag.plattform === "YouTube" ? "kurzVideo" : "tiktok", plattform: auftrag.plattform, titel: fallback.titel.substring(0, 490), inhalt: `HOOK: ${fallback.hook}\n\nSKRIPT: ${fallback.hauptinhalt}\n\nCTA: ${fallback.callToAction}`, status: "entwurf", metadaten: JSON.stringify({ typ: "video_fallback" }) });
    await db.insert(agentLogsTable).values({ agentId, agentName: "Video Agent", aktion: "Video-Skript (Fallback)", status: "erfolgreich", nachricht: `Fallback-Skript erstellt (kein API-Key): "${fallback.titel}"`, dauer });
    await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
    return fallback;
  }

  let skript: VideoSkript;
  let completion: Awaited<ReturnType<typeof openai.chat.completions.create>>;
  try {
    completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `Du bist ein professioneller Video-Skript-Autor für ${auftrag.marke}. Erstelle packende, konversionsstarke Video-Skripte auf Deutsch.` },
        { role: "user", content: prompt },
      ],
      max_tokens: 1200,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });
    skript = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  } catch (err) {
    const { istApiKeyFehler } = handleOpenAIFehler(err, "Video Agent");
    if (istApiKeyFehler) {
      await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
      return { titel: auftrag.thema.substring(0, 70), hook: "Achtung!", hauptinhalt: auftrag.thema, callToAction: "Jetzt folgen!", thumbnailText: "NEU", beschreibung: auftrag.thema, tags: ["#KI"], empfohleneMusik: "Upbeat" };
    }
    throw err;
  }

  const dauer = Date.now() - startzeit;

  // In Content-Datenbank speichern
  await db.insert(contentTable).values({
    marke: auftrag.marke,
    typ: auftrag.plattform === "YouTube" ? "kurzVideo" : auftrag.plattform === "TikTok" ? "tiktok" : "reel",
    plattform: auftrag.plattform,
    titel: skript.titel?.substring(0, 490) ?? auftrag.thema,
    inhalt: `HOOK:\n${skript.hook}\n\nSKRIPT:\n${skript.hauptinhalt}\n\nCTA:\n${skript.callToAction}\n\nTHUMBNAIL: ${skript.thumbnailText}\n\nBESCHREIBUNG:\n${skript.beschreibung}\n\nTAGS: ${skript.tags?.join(", ")}\n\nMUSIK: ${skript.empfohleneMusik}`,
    status: "generiert",
    metadaten: JSON.stringify({ typ: "video_skript", model: "gpt-4o-mini", tokens: completion.usage?.total_tokens }),
  });

  await db.insert(agentLogsTable).values({
    agentId,
    agentName: "Video Agent",
    aktion: `Video-Skript generiert: ${auftrag.plattform}`,
    status: "erfolgreich",
    nachricht: `"${skript.titel}" für ${auftrag.marke} auf ${auftrag.plattform} — Thumbnail: "${skript.thumbnailText}"`,
    metadaten: JSON.stringify({ titel: skript.titel, marke: auftrag.marke, plattform: auftrag.plattform }),
    dauer,
  });

  await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
  logger.info({ titel: skript.titel, marke: auftrag.marke }, "Video Agent: Skript generiert");
  return skript;
}
