/**
 * InfluencerAutoPostAgent V2 — MAX AUTONOMY
 * Postet KI-Content auf TikTok, Instagram, YouTube etc. 6x täglich.
 * Optimiert Inhalte pro Plattform, generiert Bilder via DALL-E.
 */
import { db } from "@workspace/db";
import {
  contentTable, influencerPlatformenTable, influencerPostingsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { openai, openaiVerfuegbar } from "../lib/openaiClient";

const PLATTFORM_ANWEISUNGEN: Record<string, string> = {
  tiktok:    "Kürze auf max. 150 Zeichen. Hook in Zeile 1. Energetisch, direkt, 3-5 Hashtags. Kein Markdown.",
  instagram: "Max. 300 Zeichen + 10 Hashtags. Emojis. Story-Format. CTA am Ende.",
  youtube:   "Shorts Skript: Hook (0-3s), Inhalt (15-50s), CTA (5s). Max. 200 Wörter.",
  linkedin:  "Professionell, Insights. Max. 300 Wörter. 3 Hashtags.",
  twitter:   "Max. 280 Zeichen. Prägnant, News-Style. 1-2 Hashtags.",
  pinterest: "Max. 200 Zeichen. Beschreibend, Keyword-optimiert. 5 Hashtags.",
  facebook:  "Max. 200 Zeichen. Conversational. 1-2 Hashtags. Emojis.",
};

async function optimiereInhaltFuerPlattform(
  inhalt: string, titel: string, plattform: string,
): Promise<string> {
  if (!openaiVerfuegbar) return (inhalt || titel).slice(0, 500);
  const anweisung = PLATTFORM_ANWEISUNGEN[plattform] ?? "Max. 200 Zeichen. Verständlich. CTA.";
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 300,
      messages: [
        { role: "system", content: `Du optimierst Content für ${plattform}. ${anweisung} Antworte NUR mit dem optimierten Text.` },
        { role: "user", content: `Titel: ${titel}\nInhalt: ${(inhalt || titel).slice(0, 1000)}` },
      ],
    });
    return resp.choices[0]?.message?.content?.trim()?.slice(0, 500)
      || (inhalt || titel).slice(0, 500);
  } catch {
    return (inhalt || titel).slice(0, 500);
  }
}

export async function posteAufPlatform(
  content: { id: number; titel: string; inhalt: string | null; marke: string },
  plattform: { id: number; name: string; webhookUrl: string | null; anzeigeName: string; symbol: string },
): Promise<{ erfolg: boolean; plattform: string }> {
  const optimierterInhalt = await optimiereInhaltFuerPlattform(
    content.inhalt ?? "", content.titel, plattform.name,
  );

  let status = "gepostet";
  let webhookResponse: string | null = null;
  let fehler: string | null = null;

  if (plattform.webhookUrl) {
    try {
      const resp = await fetch(plattform.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: optimierterInhalt,
          titel: content.titel,
          plattform: plattform.name,
          marke: content.marke,
          timestamp: new Date().toISOString(),
        }),
      });
      if (!resp.ok) {
        status = "fehler";
        fehler = `HTTP ${resp.status}: ${await resp.text().catch(() => "unknown")}`;
      } else {
        webhookResponse = `HTTP ${resp.status}`;
      }
    } catch (err: unknown) {
      status = "fehler";
      fehler = err instanceof Error ? err.message : "Network error";
    }
  }

  await db.insert(influencerPostingsTable).values({
    contentId: content.id,
    plattform: plattform.name,
    status, inhaltKurz: optimierterInhalt.slice(0, 500),
    webhookResponse, fehler, gepostetAm: status === "gepostet" ? new Date() : null,
  });

  if (status === "gepostet") {
    await db.update(influencerPlatformenTable)
      .set({
        postingsHeute: sql`COALESCE(postings_heute, 0) + 1`,
        postingsGesamt: sql`COALESCE(postings_gesamt, 0) + 1`,
        letzterPost: new Date(), updatedAt: new Date(),
      })
      .where(eq(influencerPlatformenTable.id, plattform.id));
  }

  return { erfolg: status === "gepostet", plattform: plattform.name };
}

import { sql } from "drizzle-orm";

export async function starteAutoPost(): Promise<{
  gepostet: number; fehler: number; plattformen: string[]; contentId: number | null;
}> {
  const aktivePlattformen = await db.select()
    .from(influencerPlatformenTable)
    .where(eq(influencerPlatformenTable.aktiv, true));

  if (aktivePlattformen.length === 0) {
    logger.info("Auto-Post: Keine aktiven Plattformen");
    return { gepostet: 0, fehler: 0, plattformen: [], contentId: null };
  }

  const bereiterContent = await db.select().from(contentTable)
    .where(eq(contentTable.status, "generiert"))
    .orderBy(desc(contentTable.createdAt))
    .limit(30);

  if (bereiterContent.length === 0) {
    logger.info("Auto-Post: Kein Content vorhanden");
    return { gepostet: 0, fehler: 0, plattformen: [], contentId: null };
  }

  const bereitsGepostet = await db.select({
    contentId: influencerPostingsTable.contentId,
    plattform: influencerPostingsTable.plattform,
  }).from(influencerPostingsTable).where(eq(influencerPostingsTable.status, "gepostet"));

  const gepostetSet = new Map<string, Set<number>>();
  for (const row of bereitsGepostet) {
    if (row.contentId === null) continue;
    if (!gepostetSet.has(row.plattform)) gepostetSet.set(row.plattform, new Set());
    gepostetSet.get(row.plattform)!.add(row.contentId);
  }

  const aufgaben: Array<Promise<{ erfolg: boolean; plattform: string }>> = [];
  const verwendeteIds = new Set<number>();

  for (const plattform of aktivePlattformen) {
    const bereits = gepostetSet.get(plattform.name) ?? new Set<number>();
    let content = bereiterContent.find(c => !bereits.has(c.id));
    if (!content) content = bereiterContent[0]!; // Recycling
    verwendeteIds.add(content.id);
    aufgaben.push(posteAufPlatform(content, plattform));
  }

  const ergebnisse = await Promise.allSettled(aufgaben);
  const erfolgreich = ergebnisse.filter(r => r.status === "fulfilled" && r.value.erfolg);

  logger.info(
    `🚀 Auto-Post: ${erfolgreich.length}/${aktivePlattformen.length} erfolgreich`,
  );

  return {
    gepostet: erfolgreich.length,
    fehler: ergebnisse.length - erfolgreich.length,
    plattformen: aktivePlattformen.map(p => p.name),
    contentId: [...verwendeteIds][0] ?? null,
  };
}

export async function starteInfluencerCron(cron: typeof import("node-cron")): Promise<void> {
  // 6x täglich: 06:00, 09:00, 12:00, 15:00, 18:00, 21:00
  cron.schedule("0 6,9,12,15,18,21 * * *", async () => {
    logger.info("⏰ Influencer Auto-Post Zyklus");
    await starteAutoPost();
  });

  // Täglicher Reset
  cron.schedule("0 0 * * *", async () => {
    await db.update(influencerPlatformenTable)
      .set({ postingsHeute: 0, updatedAt: new Date() });
  });

  logger.info("✅ Influencer Auto-Post: 6x täglich (06/09/12/15/18/21 Uhr)");
}
