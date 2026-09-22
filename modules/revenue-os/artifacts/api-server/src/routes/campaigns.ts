import { Router } from "express";
import { db } from "@workspace/db";
import { campaignsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function mapCampaign(c: typeof campaignsTable.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    marke: c.marke,
    typ: c.typ,
    netzwerk: c.netzwerk,
    status: c.status,
    affiliateLink: c.affiliateLink,
    provision: c.provision ? parseFloat(c.provision) : null,
    klicks: c.klicks,
    konversionen: c.konversionen,
    umsatz: parseFloat(c.umsatz ?? "0"),
    startDatum: c.startDatum?.toISOString() ?? null,
    endDatum: c.endDatum?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/campaigns", async (req, res) => {
  const campaigns = await db.select().from(campaignsTable).orderBy(campaignsTable.createdAt);
  res.json(campaigns.map(mapCampaign));
});

router.post("/campaigns", async (req, res) => {
  const body = req.body as {
    name: string; marke: string; typ: string; netzwerk?: string;
    affiliateLink?: string; provision?: number; startDatum?: string; endDatum?: string;
  };

  const [campaign] = await db.insert(campaignsTable).values({
    name: body.name,
    marke: body.marke,
    typ: body.typ,
    netzwerk: body.netzwerk ?? "keins",
    affiliateLink: body.affiliateLink ?? null,
    provision: body.provision?.toString() ?? null,
    startDatum: body.startDatum ? new Date(body.startDatum) : new Date(),
    endDatum: body.endDatum ? new Date(body.endDatum) : null,
    status: "aktiv",
  }).returning();

  res.status(201).json(mapCampaign(campaign!));
});

router.patch("/campaigns/:id", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  const body = req.body as { name?: string; status?: string; affiliateLink?: string; provision?: number };

  const updates: Partial<typeof campaignsTable.$inferInsert> = {};
  if (body.name) updates.name = body.name;
  if (body.status) updates.status = body.status;
  if (body.affiliateLink !== undefined) updates.affiliateLink = body.affiliateLink;
  if (body.provision !== undefined) updates.provision = body.provision.toString();

  const [campaign] = await db.update(campaignsTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(campaignsTable.id, id))
    .returning();

  if (!campaign) { res.status(404).json({ error: "Kampagne nicht gefunden" }); return; }
  res.json(mapCampaign(campaign));
});

export default router;
