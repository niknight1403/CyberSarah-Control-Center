import { Router } from "express";
import { db } from "@workspace/db";
import { contentTable, agentsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { generiereContent } from "../agents/contentAgent";

const router = Router();

function mapContent(c: typeof contentTable.$inferSelect) {
  return {
    id: c.id,
    campaignId: c.campaignId,
    marke: c.marke,
    typ: c.typ,
    plattform: c.plattform,
    titel: c.titel,
    inhalt: c.inhalt,
    status: c.status,
    veroeffentlichtAm: c.veroeffentlichtAm?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/content", async (req, res) => {
  const { brand, status, limit } = req.query;
  const limitNum = parseInt(String(limit ?? "50"));

  const conditions = [];
  if (brand) conditions.push(eq(contentTable.marke, String(brand)));
  if (status) conditions.push(eq(contentTable.status, String(status)));

  const items = await db.select().from(contentTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(contentTable.createdAt))
    .limit(Math.min(limitNum, 200));

  res.json(items.map(mapContent));
});

router.post("/content", async (req, res) => {
  const body = req.body as {
    marke: "CyberSarah" | "GeldPilot AI" | "UnternehmerGPT";
    typ: "kurzVideo" | "reel" | "tiktok" | "blogartikel";
    plattform: "TikTok" | "Instagram" | "YouTube" | "Google" | "Blog";
    thema: string;
    campaignId?: number;
  };

  const [agent] = await db.select().from(agentsTable)
    .where(eq(agentsTable.typ, "content_factory"))
    .limit(1);
  const agentId = agent?.id ?? 3;

  const contentId = await generiereContent(body, agentId);
  const [neuerContent] = await db.select().from(contentTable)
    .where(eq(contentTable.id, contentId))
    .limit(1);

  res.status(201).json(mapContent(neuerContent!));
});

router.post("/content/:id/publish", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  const [content] = await db.update(contentTable)
    .set({ status: "veroeffentlicht", veroeffentlichtAm: new Date(), updatedAt: new Date() })
    .where(eq(contentTable.id, id))
    .returning();

  if (!content) { res.status(404).json({ error: "Content nicht gefunden" }); return; }
  res.json(mapContent(content));
});

export default router;
