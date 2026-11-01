/**
 * Faceless-Video-Auto-Publish-Agent
 * 3-Phasen-Loop: (1) Content-Generierung — Skript+Voiceover+Thumbnail per KI,
 * (2) Scheduling/Posting — automatisches Veröffentlichen via Webhook mit
 *     strengem Rate-Limit pro Plattform, (3) Daten-Analyse/Optimierung —
 *     Performance auswerten und schwache Themen/Formate pausieren.
 * Token-Sicherheit: max. TAEGLICHES_GENERIERUNGS_LIMIT KI-Aufrufe/Tag,
 * damit das OpenAI-Kontingent nie unkontrolliert leerläuft.
 */
import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { inkrementiereFallbackZaehler, setzeSmartPause, istSmartPausiert } from "./watchdog";
import { db } from "@workspace/db";
import {
  agentLogsTable, agentsTable, facelessVideosTable,
  influencerPlatformenTable, type FacelessVideo,
} from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";

const AGENT_NAME = "Faceless-Video-Auto-Publish-Agent";
const objectStorageService = new ObjectStorageService();

// ─── Token-/API-Limit-Handling ───────────────────────────────────────────────
// Harte Obergrenze für KI-Generierungen pro Tag — verhindert unkontrollierten
// Token-Verbrauch, unabhängig davon wie oft der Cron/Orchestrator getriggert wird.
const TAEGLICHES_GENERIERUNGS_LIMIT = 8;

async function holeEigeneAgentId(): Promise<number | null> {
  const [agent] = await db.select({ id: agentsTable.id })
    .from(agentsTable).where(eq(agentsTable.name, AGENT_NAME));
  return agent?.id ?? null;
}

async function protokolliere(aktion: string, status: "erfolgreich" | "fehler", nachricht: string, dauer?: number, metadaten?: Record<string, unknown>): Promise<void> {
  const agentId = await holeEigeneAgentId();
  if (agentId === null) return;
  await db.insert(agentLogsTable).values({
    agentId, agentName: AGENT_NAME, aktion, status, nachricht, dauer,
    metadaten: metadaten ? JSON.stringify(metadaten) : undefined,
  });
  await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
}

const VIDEO_THEMEN: Array<{ marke: "CyberSarah" | "GeldPilot AI" | "UnternehmerGPT"; thema: string; plattform: "tiktok" | "youtube" | "instagram" }> = [
  { marke: "CyberSarah", thema: "5 KI-Automatisierungen, die dir täglich 2 Stunden sparen", plattform: "tiktok" },
  { marke: "CyberSarah", thema: "Warum dein Business ohne KI 2026 zurückfällt", plattform: "youtube" },
  { marke: "GeldPilot AI", thema: "So baust du ein passives Einkommen mit KI-Tools auf", plattform: "tiktok" },
  { marke: "GeldPilot AI", thema: "3 Fehler, die Anfänger beim Online-Geldverdienen machen", plattform: "instagram" },
  { marke: "UnternehmerGPT", thema: "KI-Strategie für KMUs — der 2026 Guide", plattform: "youtube" },
  { marke: "UnternehmerGPT", thema: "Diese 4 Prozesse solltest du sofort automatisieren", plattform: "tiktok" },
];

interface VideoInhalt {
  hook: string;
  voiceoverSkript: string;
  callToAction: string;
  thumbnailPrompt: string;
}

async function zaehleHeutigeGenerierungen(): Promise<number> {
  const heuteStart = new Date();
  heuteStart.setHours(0, 0, 0, 0);
  const [row] = await db.select({ anzahl: sql<number>`count(*)` })
    .from(facelessVideosTable)
    .where(and(gte(facelessVideosTable.createdAt, heuteStart), eq(facelessVideosTable.quelle, "openai")));
  return Number(row?.anzahl ?? 0);
}

// ─── Phase 1: Content-Generierung ────────────────────────────────────────────

export async function generiereFacelessVideo(): Promise<FacelessVideo | null> {
  const agentId = await holeEigeneAgentId();
  if (agentId === null) return null;

  if (istSmartPausiert(agentId)) {
    logger.info({ agentId }, "Faceless-Video-Agent: Smart-Pause aktiv — Generierung übersprungen");
    return null;
  }

  const startzeit = Date.now();
  const auftrag = VIDEO_THEMEN[Math.floor(Math.random() * VIDEO_THEMEN.length)]!;

  // Token-Sicherheit: tägliches Limit an echten KI-Generierungen einhalten.
  const heutigeAnzahl = await zaehleHeutigeGenerierungen();
  const limitErreicht = heutigeAnzahl >= TAEGLICHES_GENERIERUNGS_LIMIT;

  if (!openaiVerfuegbar || limitErreicht) {
    inkrementiereFallbackZaehler(agentId, AGENT_NAME);
    const fallback: VideoInhalt = {
      hook: "Das hier verändert dein Business sofort! 🚀",
      voiceoverSkript: `[0:00] ${auftrag.thema}\n[0:05] Der wichtigste Hebel, den kaum jemand nutzt\n[0:20] So setzt du es in 3 Schritten um\n[0:45] Das Ergebnis, wenn du dranbleibst`,
      callToAction: "Folge jetzt für mehr KI-Strategien!",
      thumbnailPrompt: `Modern flat-design thumbnail about ${auftrag.thema}, bold text-free composition`,
    };
    const dauer = Date.now() - startzeit;
    const [video] = await db.insert(facelessVideosTable).values({
      marke: auftrag.marke,
      plattform: auftrag.plattform,
      thema: auftrag.thema,
      hook: fallback.hook,
      voiceoverSkript: fallback.voiceoverSkript,
      callToAction: fallback.callToAction,
      thumbnailPrompt: fallback.thumbnailPrompt,
      status: "entwurf",
      quelle: limitErreicht ? "limit_fallback" : "openai_fallback",
      metadaten: JSON.stringify({ grund: limitErreicht ? "tägliches Generierungslimit erreicht" : "kein API-Key" }),
    }).returning();
    await protokolliere(
      "Faceless-Video (Fallback)",
      "erfolgreich",
      `Fallback-Skript erstellt: "${auftrag.thema}" (${limitErreicht ? "Tageslimit erreicht" : "kein API-Key"})`,
      dauer,
    );
    return video ?? null;
  }

  const prompt = `Erstelle ein vollständiges Faceless-Video-Skript (keine Person vor der Kamera, nur Voiceover + Stock-/B-Roll-Footage) für ${auftrag.plattform}.

Marke: ${auftrag.marke}
Thema: ${auftrag.thema}

Antworte NUR mit validem JSON:
{
  "hook": "Erste 3 Sekunden — extrem aufmerksamkeitsstark, als gesprochener Satz",
  "voiceoverSkript": "Vollständiges Voiceover-Skript mit Zeitmarkierungen [0:00], [0:15] etc., für Text-to-Speech geeignet",
  "callToAction": "Konkreter CTA am Ende (folgen, Link in Bio, etc.)",
  "thumbnailPrompt": "Bildgenerierungs-Prompt auf Englisch für ein Thumbnail ohne Text, thematisch passend"
}`;

  let inhalt: VideoInhalt;
  let completion: Awaited<ReturnType<typeof openai.chat.completions.create>>;
  try {
    completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `Du bist ein professioneller Faceless-Video-Skript-Autor für ${auftrag.marke}. Schreibe packende, konversionsstarke Voiceover-Skripte auf Deutsch.` },
        { role: "user", content: prompt },
      ],
      max_tokens: 900,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });
    inhalt = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  } catch (err) {
    const { istApiKeyFehler } = handleOpenAIFehler(err, AGENT_NAME);
    if (istApiKeyFehler) {
      setzeSmartPause(agentId, AGENT_NAME, "OpenAI 401 — API-Key ungültig");
      await protokolliere("Faceless-Video Generierung", "fehler", "⚠️ API-Key ungültig (401) — Agent smart-pausiert", Date.now() - startzeit);
      return null;
    }
    await protokolliere("Faceless-Video Generierung", "fehler", `Fehler bei OpenAI-Aufruf: ${err instanceof Error ? err.message : String(err)}`, Date.now() - startzeit);
    return null;
  }

  // Thumbnail-Bild generieren (best effort, blockiert den Skript-Erfolg nicht)
  let thumbnailUrl: string | null = null;
  try {
    const bildResp = await openai.images.generate({
      model: "gpt-image-1",
      prompt: inhalt.thumbnailPrompt || `Modern thumbnail about ${auftrag.thema}, no text`,
      n: 1,
      size: "1024x1024",
    });
    const b64 = bildResp.data?.[0]?.b64_json;
    if (b64) {
      const buffer = Buffer.from(b64, "base64");
      const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
      const putResp = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: buffer });
      if (putResp.ok) {
        const objectPath = objectStorageService.normalizeObjectEntityPath(uploadUrl);
        await objectStorageService.enforceUploadCompliance(objectPath, {
          allowedContentTypes: new Set(["image/png", "image/jpeg", "image/webp"]),
          maxSizeBytes: 15 * 1024 * 1024,
        });
        await objectStorageService.trySetObjectEntityAclPolicy(objectPath, { owner: "system", visibility: "public" });
        thumbnailUrl = `/api${objectPath.replace("/objects/", "/storage/objects/")}`;
      }
    }
  } catch (err) {
    logger.warn({ err }, "Faceless-Video: Thumbnail-Generierung fehlgeschlagen — Video läuft ohne Thumbnail weiter");
  }

  const dauer = Date.now() - startzeit;
  const [video] = await db.insert(facelessVideosTable).values({
    marke: auftrag.marke,
    plattform: auftrag.plattform,
    thema: auftrag.thema,
    hook: inhalt.hook,
    voiceoverSkript: inhalt.voiceoverSkript,
    callToAction: inhalt.callToAction,
    thumbnailPrompt: inhalt.thumbnailPrompt,
    thumbnailUrl,
    status: "entwurf",
    quelle: "openai",
    metadaten: JSON.stringify({ model: "gpt-4o-mini", tokens: completion.usage?.total_tokens }),
  }).returning();

  await protokolliere(
    "Faceless-Video generiert",
    "erfolgreich",
    `"${auftrag.thema}" für ${auftrag.marke} auf ${auftrag.plattform}${thumbnailUrl ? " (mit Thumbnail)" : ""}`,
    dauer,
    { marke: auftrag.marke, plattform: auftrag.plattform },
  );
  logger.info({ thema: auftrag.thema, marke: auftrag.marke }, "Faceless-Video-Agent: Video generiert");
  return video ?? null;
}

// ─── Phase 2: Scheduling/Posting ─────────────────────────────────────────────

export async function veroeffentlicheFaelligeVideos(): Promise<{ veroeffentlicht: number; uebersprungen: number; details: string[] }> {
  const entwuerfe = await db.select().from(facelessVideosTable)
    .where(eq(facelessVideosTable.status, "entwurf"))
    .limit(20);

  if (entwuerfe.length === 0) {
    return { veroeffentlicht: 0, uebersprungen: 0, details: ["Keine Video-Entwürfe vorhanden"] };
  }

  const aktivePlattformen = await db.select().from(influencerPlatformenTable)
    .where(eq(influencerPlatformenTable.aktiv, true));

  const details: string[] = [];
  let veroeffentlicht = 0;
  let uebersprungen = 0;

  for (const video of entwuerfe) {
    const plattform = aktivePlattformen.find(p => p.name === video.plattform);
    if (!plattform || !plattform.webhookUrl) {
      uebersprungen++;
      continue;
    }

    // Rate-Limit: Plattform-eigenes Tageslimit (postingsProTag) respektieren —
    // verhindert Spam/AGB-Verstöße und Überlastung der Ziel-Plattform.
    if ((plattform.postingsHeute ?? 0) >= (plattform.postingsProTag ?? 3)) {
      details.push(`${video.plattform}: Tageslimit erreicht — "${video.thema}" wartet`);
      uebersprungen++;
      continue;
    }

    const basisUrl = process.env["PUBLIC_APP_URL"]?.replace(/\/$/, "");
    const thumbnailAbsolut = video.thumbnailUrl && basisUrl ? `${basisUrl}${video.thumbnailUrl}` : video.thumbnailUrl;

    const payload = {
      plattform: plattform.name,
      anzeigeName: plattform.anzeigeName,
      marke: video.marke,
      typ: "faceless_video",
      thema: video.thema,
      hook: video.hook,
      voiceoverSkript: video.voiceoverSkript,
      callToAction: video.callToAction,
      thumbnailUrl: thumbnailAbsolut,
      videoId: video.id,
      zeitstempel: new Date().toISOString(),
      system: "CyberSarah Revenue OS — Faceless-Video-Agent",
    };

    let status = "fehler";
    let webhookResponse: string | null = null;
    try {
      const resp = await fetch(plattform.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12_000),
      });
      webhookResponse = `HTTP ${resp.status}`;
      status = resp.ok ? "veroeffentlicht" : "fehler";
    } catch (err) {
      webhookResponse = err instanceof Error ? err.message : "Verbindungsfehler";
    }

    await db.update(facelessVideosTable)
      .set({
        status,
        webhookResponse,
        veroeffentlichtAm: status === "veroeffentlicht" ? new Date() : null,
      })
      .where(eq(facelessVideosTable.id, video.id));

    if (status === "veroeffentlicht") {
      veroeffentlicht++;
      await db.update(influencerPlatformenTable)
        .set({ postingsHeute: (plattform.postingsHeute ?? 0) + 1, postingsGesamt: (plattform.postingsGesamt ?? 0) + 1, letzterPost: new Date() })
        .where(eq(influencerPlatformenTable.id, plattform.id));
      details.push(`${video.plattform}: "${video.thema}" veröffentlicht`);
    } else {
      uebersprungen++;
      details.push(`${video.plattform}: "${video.thema}" fehlgeschlagen — ${webhookResponse}`);
    }
  }

  await protokolliere(
    "Faceless-Video Veröffentlichung",
    "erfolgreich",
    `${veroeffentlicht} veröffentlicht, ${uebersprungen} übersprungen`,
    undefined,
    { veroeffentlicht, uebersprungen },
  );

  return { veroeffentlicht, uebersprungen, details };
}

// ─── Phase 3: Daten-Analyse/Optimierung ──────────────────────────────────────

/** Wird von einem externen Analytics-Callback (Webhook) aufgerufen, sobald echte Aufrufe/Klicks vorliegen. */
export async function erfasseAnalyseDaten(videoId: number, aufrufe: number, klicks: number): Promise<FacelessVideo | null> {
  const [video] = await db.update(facelessVideosTable)
    .set({ aufrufe, klicks })
    .where(eq(facelessVideosTable.id, videoId))
    .returning();
  return video ?? null;
}

export async function analysiereUndOptimiere(): Promise<{ analysiert: number; pausiert: number; details: string[] }> {
  const veroeffentlicht = await db.select().from(facelessVideosTable)
    .where(and(eq(facelessVideosTable.status, "veroeffentlicht"), eq(facelessVideosTable.analysiert, 0)));

  if (veroeffentlicht.length === 0) {
    return { analysiert: 0, pausiert: 0, details: ["Keine unanalysierten veröffentlichten Videos"] };
  }

  const details: string[] = [];
  let pausiert = 0;

  for (const video of veroeffentlicht) {
    // Performance-Score: einfache Heuristik aus Klicks/Aufrufe (Click-Through-Rate * 100)
    const score = video.aufrufe > 0 ? Math.round((video.klicks / video.aufrufe) * 100) : 0;
    // Videos ohne jede Interaktion nach ausreichend Reichweite (>=50 Aufrufe) werden pausiert,
    // damit das Format/Thema nicht wiederholt reproduziert wird (Ressourcenschonung).
    const sollPausieren = video.aufrufe >= 50 && video.klicks === 0;

    await db.update(facelessVideosTable)
      .set({ analysiert: 1, performanceScore: score, status: sollPausieren ? "pausiert" : video.status })
      .where(eq(facelessVideosTable.id, video.id));

    if (sollPausieren) {
      pausiert++;
      details.push(`"${video.thema}" pausiert — 0 Klicks bei ${video.aufrufe} Aufrufen`);
    } else {
      details.push(`"${video.thema}" analysiert — Score ${score}`);
    }
  }

  await protokolliere(
    "Faceless-Video Analyse",
    "erfolgreich",
    `${veroeffentlicht.length} Videos analysiert, ${pausiert} unterperformende pausiert`,
    undefined,
    { analysiert: veroeffentlicht.length, pausiert },
  );

  return { analysiert: veroeffentlicht.length, pausiert, details };
}

// ─── Übersicht ────────────────────────────────────────────────────────────────

export async function ladeVideoUebersicht(): Promise<{
  videos: FacelessVideo[];
  stats: { gesamt: number; entwuerfe: number; veroeffentlicht: number; pausiert: number; gesamtAufrufe: number; gesamtKlicks: number; heutigeGenerierungen: number };
}> {
  const videos = await db.select().from(facelessVideosTable).orderBy(sql`${facelessVideosTable.createdAt} DESC`).limit(100);
  const heutigeGenerierungen = await zaehleHeutigeGenerierungen();
  return {
    videos,
    stats: {
      gesamt: videos.length,
      entwuerfe: videos.filter(v => v.status === "entwurf").length,
      veroeffentlicht: videos.filter(v => v.status === "veroeffentlicht").length,
      pausiert: videos.filter(v => v.status === "pausiert").length,
      gesamtAufrufe: videos.reduce((sum, v) => sum + v.aufrufe, 0),
      gesamtKlicks: videos.reduce((sum, v) => sum + v.klicks, 0),
      heutigeGenerierungen,
    },
  };
}
