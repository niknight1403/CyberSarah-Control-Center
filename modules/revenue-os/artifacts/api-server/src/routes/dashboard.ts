import { Router } from "express";
import { db } from "@workspace/db";
import { transactionsTable, campaignsTable, contentTable, agentsTable } from "@workspace/db";
import { eq, gte, sql } from "drizzle-orm";

const router = Router();

router.get("/dashboard/kpis", async (req, res) => {
  if (!db) {
    return res.json({
      umsatzHeute: 0, umsatzWoche: 0, umsatzMonat: 0,
      aktiveCampaigns: 0, contentPieces: 0,
      conversionRate: null, roi: null,
      systemStatus: "OFFLINE — DB nicht verbunden",
      aktiviertAgenten: 0,
    });
  }
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const vorWoche = new Date(); vorWoche.setDate(vorWoche.getDate() - 7);
  const vorMonat = new Date(); vorMonat.setDate(vorMonat.getDate() - 30);

  const [[heuteRes], [wocheRes], [monatRes], [gesamtEinnahmenRes], [ausgabenRes]] = await Promise.all([
    db.select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
      .from(transactionsTable)
      .where(sql`created_at >= ${heute} AND typ = 'einnahme'`),
    db.select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
      .from(transactionsTable)
      .where(sql`created_at >= ${vorWoche} AND typ = 'einnahme'`),
    db.select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
      .from(transactionsTable)
      .where(sql`created_at >= ${vorMonat} AND typ = 'einnahme'`),
    db.select({ s: sql<string>`COALESCE(SUM(betrag),0)`, n: sql<number>`COUNT(*)` })
      .from(transactionsTable)
      .where(sql`typ = 'einnahme'`),
    db.select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
      .from(transactionsTable)
      .where(sql`typ = 'ausgabe'`),
  ]);

  const [aktiveCampaigns, contentAnzahl, aktiviertAgenten, kampagnenStats] = await Promise.all([
    db.select({ n: sql<number>`COUNT(*)` }).from(campaignsTable).where(eq(campaignsTable.status, "aktiv")),
    db.select({ n: sql<number>`COUNT(*)` }).from(contentTable),
    db.select({ n: sql<number>`COUNT(*)` }).from(agentsTable).where(eq(agentsTable.status, "aktiv")),
    db.select({
      gesamtKlicks: sql<number>`COALESCE(SUM(klicks), 0)`,
      gesamtKonversionen: sql<number>`COALESCE(SUM(konversionen), 0)`,
    }).from(campaignsTable).where(eq(campaignsTable.status, "aktiv")),
  ]);

  const einnahmen = parseFloat(gesamtEinnahmenRes?.s ?? "0");
  const ausgaben = parseFloat(ausgabenRes?.s ?? "0");
  const roi = ausgaben > 0
    ? Math.round(((einnahmen - ausgaben) / ausgaben) * 10000) / 100
    : null;

  const klicks = kampagnenStats[0]?.gesamtKlicks ?? 0;
  const konversionen = kampagnenStats[0]?.gesamtKonversionen ?? 0;
  const conversionRate = klicks > 0
    ? Math.round((konversionen / klicks) * 10000) / 100
    : null;

  res.json({
    umsatzHeute: parseFloat(heuteRes?.s ?? "0"),
    umsatzWoche: parseFloat(wocheRes?.s ?? "0"),
    umsatzMonat: parseFloat(monatRes?.s ?? "0"),
    aktiveCampaigns: Number(aktiveCampaigns[0]?.n ?? 0),
    contentPieces: Number(contentAnzahl[0]?.n ?? 0),
    conversionRate,
    roi,
    systemStatus: "ONLINE",
    aktiviertAgenten: Number(aktiviertAgenten[0]?.n ?? 0),
  });
});

export default router;
