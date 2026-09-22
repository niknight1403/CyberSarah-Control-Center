import { Router } from "express";
import { db } from "@workspace/db";
import { influencerPlatformenTable, influencerPostingsTable, contentTable } from "@workspace/db";
import { eq, desc, gte, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { posteAufPlatform } from "../agents/InfluencerAutoPostAgent";

const router = Router();

const STANDARD_PLATTFORMEN = [
  { name: "tiktok",    anzeigeName: "TikTok",     symbol: "📱", besteZeiten: "19:00,20:00,21:00", postingsProTag: 3 },
  { name: "instagram", anzeigeName: "Instagram",  symbol: "📸", besteZeiten: "08:00,12:00,19:00", postingsProTag: 3 },
  { name: "youtube",   anzeigeName: "YouTube",     symbol: "🎥", besteZeiten: "15:00,18:00,20:00", postingsProTag: 1 },
  { name: "linkedin",  anzeigeName: "LinkedIn",   symbol: "💼", besteZeiten: "08:00,12:00,17:00", postingsProTag: 2 },
  { name: "pinterest", anzeigeName: "Pinterest",  symbol: "📌", besteZeiten: "20:00,21:00,22:00", postingsProTag: 2 },
  { name: "twitter",   anzeigeName: "Twitter / X", symbol: "🐦", besteZeiten: "09:00,13:00,17:00", postingsProTag: 5 },
];

async function sicherePlatformen() {
  for (const p of STANDARD_PLATTFORMEN) {
    const vorhanden = await db.select().from(influencerPlatformenTable)
      .where(eq(influencerPlatformenTable.name, p.name)).limit(1);
    if (vorhanden.length === 0) {
      await db.insert(influencerPlatformenTable).values({
        name: p.name, anzeigeName: p.anzeigeName, symbol: p.symbol,
        besteZeiten: p.besteZeiten, postingsProTag: p.postingsProTag,
        aktiv: false,
      });
    }
  }
}

// GET /api/influencer/plattformen
router.get("/influencer/plattformen", async (_req, res) => {
  await sicherePlatformen();
  const plattformen = await db.select().from(influencerPlatformenTable).orderBy(influencerPlatformenTable.id);
  res.json({ plattformen });
});

// POST /api/influencer/plattformen/:name — Webhook + Toggle setzen
router.post("/influencer/plattformen/:name", async (req, res) => {
  const { name } = req.params;
  const { webhookUrl, aktiv } = req.body as { webhookUrl?: string; aktiv?: boolean };

  const [updated] = await db.update(influencerPlatformenTable)
    .set({
      ...(webhookUrl !== undefined && { webhookUrl }),
      ...(aktiv !== undefined && { aktiv }),
      updatedAt: new Date(),
    })
    .where(eq(influencerPlatformenTable.name, name!))
    .returning();

  if (!updated) { res.status(404).json({ fehler: "Plattform nicht gefunden" }); return; }
  req.log.info({ name, aktiv }, `Influencer-Plattform aktualisiert: ${name}`);
  res.json({ gespeichert: true, plattform: updated });
});

// GET /api/influencer/postings — Posting-Historie
router.get("/influencer/postings", async (req, res) => {
  const limit = Math.min(parseInt(req.query["limit"] as string ?? "50"), 100);
  const postings = await db.select().from(influencerPostingsTable)
    .orderBy(desc(influencerPostingsTable.createdAt)).limit(limit);
  res.json({ postings });
});

// GET /api/influencer/stats — Statistiken
router.get("/influencer/stats", async (_req, res) => {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const dieseWoche = new Date(); dieseWoche.setDate(dieseWoche.getDate() - 7);

  const [postingsHeute, postingsWoche, aktivePlattformen] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(influencerPostingsTable)
      .where(and(gte(influencerPostingsTable.createdAt, heute), eq(influencerPostingsTable.status, "gepostet"))),
    db.select({ count: sql<number>`count(*)` }).from(influencerPostingsTable)
      .where(and(gte(influencerPostingsTable.createdAt, dieseWoche), eq(influencerPostingsTable.status, "gepostet"))),
    db.select({ count: sql<number>`count(*)` }).from(influencerPlatformenTable)
      .where(and(eq(influencerPlatformenTable.aktiv, true))),
  ]);

  const contentBereit = await db.select({ count: sql<number>`count(*)` })
    .from(contentTable).where(eq(contentTable.status, "generiert"));

  res.json({
    postingsHeute: Number(postingsHeute[0]?.count ?? 0),
    postingsWoche: Number(postingsWoche[0]?.count ?? 0),
    aktivePlattformen: Number(aktivePlattformen[0]?.count ?? 0),
    contentBereit: Number(contentBereit[0]?.count ?? 0),
  });
});

// POST /api/influencer/posten/:contentId — Manuell auf alle aktiven Plattformen posten
router.post("/influencer/posten/:contentId", async (req, res) => {
  const contentId = parseInt(req.params["contentId"] ?? "0");
  const { plattform } = req.body as { plattform?: string };

  const [content] = await db.select().from(contentTable).where(eq(contentTable.id, contentId));
  if (!content) { res.status(404).json({ fehler: "Content nicht gefunden" }); return; }

  const plattformenQuery = db.select().from(influencerPlatformenTable)
    .where(eq(influencerPlatformenTable.aktiv, true));
  const aktive = plattform
    ? (await db.select().from(influencerPlatformenTable).where(eq(influencerPlatformenTable.name, plattform)))
    : await plattformenQuery;

  if (aktive.length === 0) {
    res.status(400).json({ fehler: "Keine aktiven Plattformen — bitte Webhook-URL eingeben und aktivieren" });
    return;
  }

  const ergebnisse = await Promise.allSettled(aktive.map(p => posteAufPlatform(content, p)));
  const erfolgreich = ergebnisse.filter(r => r.status === "fulfilled").length;

  req.log.info({ contentId, plattformen: aktive.length, erfolgreich }, "Manueller Post ausgeführt");
  res.json({ erfolg: true, gepostetAuf: erfolgreich, gesamt: aktive.length });
});

// POST /api/influencer/auto-post — Auto-Posting-Zyklus starten
router.post("/influencer/auto-post", async (req, res) => {
  const { starteAutoPost } = await import("../agents/InfluencerAutoPostAgent");
  const ergebnis = await starteAutoPost();
  req.log.info(ergebnis, "Auto-Post-Zyklus ausgeführt");
  res.json(ergebnis);
});

export default router;
