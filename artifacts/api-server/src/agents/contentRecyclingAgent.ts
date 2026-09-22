import { openai, openaiVerfuegbar } from "../lib/openaiClient";
import { db } from "@workspace/db";
import { contentTable, seoContentTable, contentRecyclingTable, agentLogsTable, agentsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

async function holeAgentId(): Promise<number | null> {
  if (!db) return null;
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.typ, "content_recycling"))
    .limit(1);
  return agent?.id ?? null;
}

// ─── Konfiguration ──────────────────────────────────────────────────────────

interface RecyclingKandidat {
  quelleTyp: "content" | "seo_content";
  quelleId: number;
  quelleTitel: string;
  quelleInhalt: string;
  quelleAufrufe: number;
  marke: string;
  quellePlattform: string;
  quelleTypName: string;
}

const TRANSFORMATIONEN: Array<{
  vonPlattform: string[];
  vonTyp: string[];
  zuPlattform: string;
  zuTyp: string;
  beschreibung: string;
}> = [
  {
    vonPlattform: ["TikTok", "Instagram"],
    vonTyp: ["tiktok", "reel", "kurzVideo"],
    zuPlattform: "Blog",
    zuTyp: "blogartikel",
    beschreibung: "Short-Video-Script → ausführlicher Blogartikel",
  },
  {
    vonPlattform: ["Blog"],
    vonTyp: ["blogartikel"],
    zuPlattform: "TikTok",
    zuTyp: "tiktok",
    beschreibung: "Blogartikel → TikTok-Hook-Video",
  },
  {
    vonPlattform: ["Blog"],
    vonTyp: ["blogartikel"],
    zuPlattform: "Instagram",
    zuTyp: "reel",
    beschreibung: "Blogartikel → Instagram Reel",
  },
  {
    vonPlattform: ["TikTok", "Instagram", "YouTube"],
    vonTyp: ["tiktok", "reel", "kurzVideo"],
    zuPlattform: "YouTube",
    zuTyp: "kurzVideo",
    beschreibung: "Short-Form → YouTube Shorts",
  },
  {
    vonPlattform: ["Blog"],
    vonTyp: ["blogartikel"],
    zuPlattform: "YouTube",
    zuTyp: "kurzVideo",
    beschreibung: "Blogartikel → YouTube-Videokonzept",
  },
];

// ─── Hauptfunktion ──────────────────────────────────────────────────────────

export async function recycleContent(): Promise<{
  recycelt: number;
  details: string[];
}> {
  logger.info("♻️ ContentRecyclingAgent: Scan gestartet");
  const details: string[] = [];
  let recycelt = 0;

  if (!db) {
    logger.warn("♻️ ContentRecyclingAgent: Keine DB — übersprungen");
    return { recycelt: 0, details: ["Keine DB verfügbar"] };
  }

  const agentId = await holeAgentId();

  // ── Phase 1: Top-Performer aus contentTable ──
  const topContent = await db
    .select({
      id: contentTable.id,
      titel: contentTable.titel,
      inhalt: contentTable.inhalt,
      marke: contentTable.marke,
      typ: contentTable.typ,
      plattform: contentTable.plattform,
      status: contentTable.status,
    })
    .from(contentTable)
    .where(
      and(
        eq(contentTable.status, "veroeffentlicht"),
        sql`LENGTH(${contentTable.inhalt}) > 100`
      )
    )
    .orderBy(desc(contentTable.createdAt))
    .limit(30);

  // ── Phase 2: Top-Performer aus seoContentTable ──
  const topSeo = await db
    .select({
      id: seoContentTable.id,
      titel: seoContentTable.titel,
      inhalt: seoContentTable.body,
      marke: seoContentTable.marke,
      aufrufe: seoContentTable.aufrufe,
    })
    .from(seoContentTable)
    .where(eq(seoContentTable.status, "veroeffentlicht"))
    .orderBy(desc(seoContentTable.aufrufe))
    .limit(10);

  const kandidaten: RecyclingKandidat[] = [
    ...topContent.map((c) => ({
      quelleTyp: "content" as const,
      quelleId: c.id,
      quelleTitel: c.titel,
      quelleInhalt: c.inhalt ?? "",
      quelleAufrufe: 0,
      marke: c.marke,
      quellePlattform: c.plattform,
      quelleTypName: c.typ,
    })),
    ...topSeo.map((s) => ({
      quelleTyp: "seo_content" as const,
      quelleId: s.id,
      quelleTitel: s.titel,
      quelleInhalt: s.inhalt ?? "",
      quelleAufrufe: s.aufrufe ?? 0,
      marke: s.marke,
      quellePlattform: "Blog",
      quelleTypName: "blogartikel",
    })),
  ];

  if (kandidaten.length === 0) {
    logger.info("♻️ ContentRecyclingAgent: Keine Kandidaten gefunden");
    return { recycelt: 0, details: ["Keine Kandidaten gefunden"] };
  }

  // ── Phase 3: Bereits recycelte Quellen laden ──
  const bereitsRecycelt = await db
    .select({ quelleTyp: contentRecyclingTable.quelleTyp, quelleId: contentRecyclingTable.quelleId })
    .from(contentRecyclingTable);

  const recyceltSet = new Set(
    bereitsRecycelt.map((r) => `${r.quelleTyp}:${r.quelleId}`)
  );

  // ── Phase 4: Max 3 Recycling-Varianten pro Durchlauf ──
  let bearbeitet = 0;
  const MAX_PRO_RUNDE = 3;

  for (const kandidat of kandidaten) {
    if (bearbeitet >= MAX_PRO_RUNDE) break;
    if (recyceltSet.has(`${kandidat.quelleTyp}:${kandidat.quelleId}`)) continue;

    const transformation = TRANSFORMATIONEN.find(
      (t) =>
        t.vonPlattform.includes(kandidat.quellePlattform) &&
        t.vonTyp.includes(kandidat.quelleTypName)
    );

    if (!transformation) continue;

    try {
      let neuerInhalt: string;

      if (openaiVerfuegbar) {
        neuerInhalt = await generiereRecyceltenContent(kandidat, transformation.beschreibung);
      } else {
        neuerInhalt = erzeugeFallbackRecycling(kandidat, transformation);
      }

      const [neuerContent] = await db
        .insert(contentTable)
        .values({
          marke: kandidat.marke,
          typ: transformation.zuTyp,
          plattform: transformation.zuPlattform,
          titel: `[Recycled] ${kandidat.quelleTitel}`.substring(0, 490),
          inhalt: neuerInhalt,
          status: "entwurf",
          metadaten: JSON.stringify({
            quelleTyp: kandidat.quelleTyp,
            quelleId: kandidat.quelleId,
            quelleTitel: kandidat.quelleTitel,
            recyclingGrund: transformation.beschreibung,
            quelleAufrufe: kandidat.quelleAufrufe,
          }),
        })
        .returning();

      await db.insert(contentRecyclingTable).values({
        quelleTyp: kandidat.quelleTyp,
        quelleId: kandidat.quelleId,
        quelleTitel: kandidat.quelleTitel,
        quelleAufrufe: kandidat.quelleAufrufe,
        neuerContentId: neuerContent?.id ?? null,
        marke: kandidat.marke,
        neuePlattform: transformation.zuPlattform,
        neuerTyp: transformation.zuTyp,
        begruendung: transformation.beschreibung,
        status: "recycelt",
      });

      recycelt++;
      bearbeitet++;
      const detail = `${kandidat.quelleTitel.substring(0, 30)} → ${transformation.zuPlattform} (${transformation.zuTyp})`;
      details.push(detail);
      recyceltSet.add(`${kandidat.quelleTyp}:${kandidat.quelleId}`);

      logger.info(
        { quelleId: kandidat.quelleId, quelleTitel: kandidat.quelleTitel.substring(0, 40) },
        "♻️ Content recycelt"
      );
    } catch (err) {
      logger.error({ quelleId: kandidat.quelleId, fehler: err }, "♻️ Recycling fehlgeschlagen");
    }
  }

  // ── Agent-Log ──
  if (recycelt > 0 && agentId) {
    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "Content-Recycling-Agent",
      aktion: "Content-Recycling durchgeführt",
      status: "erfolgreich",
      nachricht: `${recycelt} Variante(n) erstellt: ${details.join("; ")}`,
      metadaten: JSON.stringify({ recycelt, details, kandidatenGeprueft: kandidaten.length }),
      dauer: 0,
    });
    await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
  }

  logger.info({ recycelt, details }, "♻️ ContentRecyclingAgent: Scan abgeschlossen");
  return { recycelt, details };
}

// ─── KI-generierte Recycling-Variante ───────────────────────────────────────

async function generiereRecyceltenContent(
  kandidat: RecyclingKandidat,
  beschreibung: string
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Du bist ein Content-Repurposing-Experte für die Marke "${kandidat.marke}". Du nimmst bestehenden Content und transformierst ihn kreativ für eine neue Plattform. Schreibe immer auf Deutsch.Keine Platzhalter.`,
      },
      {
        role: "user",
        content: `Transformiere diesen Content: "${kandidat.quelleTitel}" (${kandidat.quellePlattform} → neue Plattform).

Transformation: ${beschreibung}

Original-Inhalt (gekürzt):
${kandidat.quelleInhalt.substring(0, 1500)}

Erstelle den neuen Content komplett für die Zielplattform. Berücksichtige die typischen Formate und Tonalität der Zielplattform.`,
      },
    ],
    max_tokens: 1500,
    temperature: 0.8,
  });

  return completion.choices[0]?.message?.content ?? `[Recycling-Fallback für: ${kandidat.quelleTitel}]`;
}

// ─── Fallback ohne KI ───────────────────────────────────────────────────────

function erzeugeFallbackRecycling(
  kandidat: RecyclingKandidat,
  transformation: (typeof TRANSFORMATIONEN)[number]
): string {
  const quelle = kandidat.quelleInhalt.substring(0, 800);

  switch (transformation.zuTyp) {
    case "blogartikel":
      return `# ${kandidat.quelleTitel}\n\n## Einleitung\nDieser Artikel basiert auf unserem beliebten ${kandidat.quellePlattform}-Content.\n\n## Die wichtigsten Erkenntnisse\n\n${quelle}\n\n## Fazit\nMehr Tipps findest du in unserem KI-Automatisierungs-Guide.`;
    case "tiktok":
      return `# ${kandidat.quelleTitel} — TikTok\n\n[HOOK 0-3s] Wusstest du das?\n[INHALT 3-45s] ${kandidat.quelleTitel} — hier die Key-Points:\n1. ...\n2. ...\n3. ...\n[CTA] Folge für mehr!\n\n#KI #CyberSarah #Automatisierung`;
    case "reel":
      return `🔥 ${kandidat.quelleTitel}\n\n📌 Was ist das?\n${quelle.substring(0, 200)}\n\n💡 Tipp: Speichern und Teilen!`;
    case "kurzVideo":
      return `# ${kandidat.quelleTitel} — YouTube Shorts\n\n[0-5s] Intro-Hook\n[5-45s] Hauptinhalt: ${quelle.substring(0, 300)}\n[45-60s] CTA: Abo + Like`;
    default:
      return `# ${kandidat.quelleTitel}\n\n${quelle}`;
  }
}
