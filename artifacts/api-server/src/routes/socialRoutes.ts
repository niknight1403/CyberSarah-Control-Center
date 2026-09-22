/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOCIAL MEDIA API (Sprint 3.2)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * REST-API für Social-Media-Distribution:
 *  - Plattform-Status und Konfiguration
 *  - Content posten (einmalig oder geplant)
 *  - Content-Kalender (geplante Posts)
 *  - Posting-Historie + Performance
 *  - OAuth-Authentifizierung
 *  - Content aus der Content-Factory abrufen
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  contentTable, influencerPlatformenTable, influencerPostingsTable,
} from "@workspace/db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  postToSocialMedia, getPlatformConfigs, getOAuthUrls,
  type SocialPlatform, type SocialPostResult,
} from "../lib/socialMediaClient";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/social/status — Plattform-Status + Konfiguration
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/social/status", async (_req, res) => {
  const configs = getPlatformConfigs();
  const oauthUrls = getOAuthUrls();

  // DB-Plattformen laden (zusätzliche Konfiguration)
  let dbPlatforms: any[] = [];
  if (db) {
    dbPlatforms = await db.select().from(influencerPlatformenTable);
  }

  const plattformen = configs.map(c => {
    const dbP = dbPlatforms.find(p => p.name === c.name);
    return {
      ...c,
      dbId: dbP?.id ?? null,
      postingsHeute: dbP?.postingsHeute ?? 0,
      postingsGesamt: dbP?.postingsGesamt ?? 0,
      letzterPost: dbP?.letzterPost ?? null,
      oauthUrl: oauthUrls[c.name],
    };
  });

  res.json({ plattformen });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/social/content — Verfügbaren Content für Social Media abrufen
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/social/content", async (req, res) => {
  if (!db) { res.json({ content: [] }); return; }

  const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 50);
  const marke = req.query.marke as string | undefined;

  let query = db
    .select()
    .from(contentTable)
    .orderBy(desc(contentTable.createdAt));

  if (marke) {
    query = query.where(eq(contentTable.marke, marke)) as any;
  }

  const content = await query.limit(limit);

  res.json({
    content: content.map(c => ({
      id: c.id, titel: c.titel, marke: c.marke,
      inhalt: c.inhalt, kategorie: c.kategorie, typ: c.typ,
      bildUrl: c.bildUrl, videoUrl: c.videoUrl,
      status: c.status, erstellt: c.createdAt,
    })),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/social/post — Content auf einer Plattform posten
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/social/post", async (req, res) => {
  try {
    const body = req.body as {
      platform: SocialPlatform;
      contentId?: number;
      caption?: string;
      title?: string;
      videoUrl?: string;
      imageUrl?: string;
      marke?: string;
    };

    if (!body.platform) {
      res.status(400).json({ error: "platform (tiktok|instagram|youtube) ist erforderlich" });
      return;
    }

    let caption = body.caption ?? "";
    let title = body.title;
    let videoUrl = body.videoUrl;
    let imageUrl = body.imageUrl;

    // Content aus DB laden falls contentId angegeben
    if (body.contentId && db) {
      const [content] = await db
        .select()
        .from(contentTable)
        .where(eq(contentTable.id, body.contentId))
        .limit(1);

      if (content) {
        caption = caption || content.inhalt || content.titel;
        title = title || content.titel;
        videoUrl = videoUrl || content.videoUrl || undefined;
        imageUrl = imageUrl || content.bildUrl || undefined;
      }
    }

    if (!caption) {
      res.status(400).json({ error: "caption oder contentId mit Inhalt erforderlich" });
      return;
    }

    // Posten
    const result = await postToSocialMedia({
      platform: body.platform,
      caption,
      title,
      videoUrl,
      imageUrl,
    });

    // In DB protokollieren
    if (db) {
      try {
        await db.insert(influencerPostingsTable).values({
          contentId: body.contentId ?? null,
          plattform: body.platform,
          status: result.success ? "gepostet" : "fehler",
          inhaltKurz: caption.slice(0, 500),
          webhookResponse: result.success ? `Post-ID: ${result.postId}` : result.error,
          fehler: result.error ?? null,
          gepostetAm: result.success ? new Date() : null,
        });

        // Plattform-Zähler aktualisieren
        if (result.success) {
          const [plattform] = await db
            .select()
            .from(influencerPlatformenTable)
            .where(eq(influencerPlatformenTable.name, body.platform))
            .limit(1);

          if (plattform) {
            await db.update(influencerPlatformenTable)
              .set({
                postingsHeute: (plattform.postingsHeute ?? 0) + 1,
                postingsGesamt: (plattform.postingsGesamt ?? 0) + 1,
                letzterPost: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(influencerPlatformenTable.id, plattform.id));
          }
        }
      } catch (dbErr) {
        logger.warn({ err: dbErr }, "DB-Protokollierung des Posts fehlgeschlagen");
      }
    }

    req.log.info({ platform: body.platform, erfolg: result.success }, "📱 Social Media Post abgeschlossen");

    res.json({
      success: result.success,
      post: result,
      plattform: body.platform,
    });

  } catch (err) {
    req.log.error({ err }, "Social Media Post fehlgeschlagen");
    res.status(500).json({ error: "Post fehlgeschlagen" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/social/post/alle — Auf ALLEN aktiven Plattformen posten
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/social/post/alle", async (req, res) => {
  try {
    const body = req.body as {
      contentId?: number;
      caption?: string;
      title?: string;
      videoUrl?: string;
      imageUrl?: string;
    };

    if (!body.caption && !body.contentId) {
      res.status(400).json({ error: "caption oder contentId erforderlich" });
      return;
    }

    const configs = getPlatformConfigs();
    const aktivePlattformen = configs.filter(p => p.connected);

    if (aktivePlattformen.length === 0) {
      res.json({ success: false, error: "Keine Plattformen verbunden", ergebnisse: [] });
      return;
    }

    const ergebnisse: SocialPostResult[] = [];
    for (const platform of aktivePlattformen) {
      const result = await postToSocialMedia({
        platform: platform.name,
        caption: body.caption ?? "",
        title: body.title,
        videoUrl: body.videoUrl,
        imageUrl: body.imageUrl,
      });
      ergebnisse.push(result);

      // Kurze Pause zwischen Plattformen (Rate-Limiting)
      await new Promise(r => setTimeout(r, 2000));
    }

    const erfolgreich = ergebnisse.filter(r => r.success).length;
    req.log.info({ erfolgreich, gesamt: ergebnisse.length }, "📱 Multi-Platform Post abgeschlossen");

    res.json({
      success: erfolgreich > 0,
      ergebnisse,
      zusammenfassung: `${erfolgreich}/${ergebnisse.length} Plattformen erfolgreich`,
    });

  } catch (err) {
    req.log.error({ err }, "Multi-Platform Post fehlgeschlagen");
    res.status(500).json({ error: "Multi-Platform Post fehlgeschlagen" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/social/posts — Posting-Historie
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/social/posts", async (req, res) => {
  if (!db) { res.json({ posts: [] }); return; }

  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
  const platform = req.query.platform as string | undefined;

  let query = db
    .select()
    .from(influencerPostingsTable)
    .orderBy(desc(influencerPostingsTable.createdAt));

  if (platform) {
    query = query.where(eq(influencerPostingsTable.plattform, platform)) as any;
  }

  const posts = await query.limit(limit);

  // Statistik
  const [stats] = await db
    .select({
      gesamt: sql<number>`COUNT(*)`,
      erfolgreich: sql<number>`SUM(CASE WHEN status = 'gepostet' THEN 1 ELSE 0 END)`,
      fehler: sql<number>`SUM(CASE WHEN status = 'fehler' THEN 1 ELSE 0 END)`,
    })
    .from(influencerPostingsTable);

  res.json({
    posts: posts.map(p => ({
      id: p.id, contentId: p.contentId, plattform: p.plattform,
      status: p.status, inhaltKurz: p.inhaltKurz,
      fehler: p.fehler, gepostetAm: p.gepostetAm?.toISOString(),
      createdAt: p.createdAt?.toISOString(),
    })),
    statistik: {
      gesamt: Number(stats?.gesamt ?? 0),
      erfolgreich: Number(stats?.erfolgreich ?? 0),
      fehler: Number(stats?.fehler ?? 0),
      erfolgsrate: stats?.gesamt
        ? ((Number(stats.erfolgreich) / Number(stats.gesamt)) * 100).toFixed(1)
        : "0",
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/social/content/:id — Content-Status ändern (für Planung)
// ═══════════════════════════════════════════════════════════════════════════════

router.patch("/social/content/:id", async (req, res) => {
  if (!db) { res.status(503).json({ error: "Keine DB" }); return; }
  const id = parseInt(req.params.id);
  if (!id) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const body = req.body as { status?: string };
  await db.update(contentTable)
    .set({ status: body.status ?? "veroeffentlicht", updatedAt: new Date() })
    .where(eq(contentTable.id, id));

  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/social/analytics — Content-Performance-Übersicht
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/social/analytics", async (req, res) => {
  if (!db) { res.json({}); return; }

  // Content nach Status
  const contentStats = await db
    .select({
      status: contentTable.status,
      anzahl: sql<number>`COUNT(*)`,
    })
    .from(contentTable)
    .groupBy(contentTable.status);

  // Postings nach Plattform
  const platformStats = await db
    .select({
      plattform: influencerPostingsTable.plattform,
      gesamt: sql<number>`COUNT(*)`,
      erfolgreich: sql<number>`SUM(CASE WHEN status = 'gepostet' THEN 1 ELSE 0 END)`,
    })
    .from(influencerPostingsTable)
    .groupBy(influencerPostingsTable.plattform);

  // Heutige Posts
  const heuteStart = new Date();
  heuteStart.setHours(0, 0, 0, 0);
  const [heuteCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(influencerPostingsTable)
    .where(sql`${influencerPostingsTable.createdAt} >= ${heuteStart}`);

  res.json({
    content: contentStats.map(s => ({ status: s.status, anzahl: Number(s.anzahl) })),
    plattformen: platformStats.map(p => ({
      name: p.plattform,
      gesamt: Number(p.gesamt),
      erfolgreich: Number(p.erfolgreich),
    })),
    heute: Number(heuteCount?.count ?? 0),
  });
});

export default router;
