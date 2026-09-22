import { Router } from "express";
import { db } from "@workspace/db";
import { transactionsTable, campaignsTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";

const router = Router();

router.get("/finance/transactions", async (req, res) => {
  const limitNum = Math.min(parseInt(String(req.query.limit ?? "100")), 500);
  const quelle = req.query.quelle as string | undefined;

  let query = db.select().from(transactionsTable);

  if (quelle) {
    const { eq } = await import("drizzle-orm");
    query = query.where(eq(transactionsTable.quelle, quelle));
  }

  const transactions = await query
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limitNum);

  res.json(transactions.map(t => ({
    id: t.id,
    transaktionsId: t.transaktionsId,
    quelle: t.quelle,
    typ: t.typ,
    betrag: parseFloat(t.betrag),
    waehrung: t.waehrung,
    beschreibung: t.beschreibung,
    campaignId: t.campaignId,
    createdAt: t.createdAt.toISOString(),
  })));
});

router.get("/finance/summary", async (_req, res) => {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const vorWoche = new Date(); vorWoche.setDate(vorWoche.getDate() - 7);
  const vorMonat = new Date(); vorMonat.setDate(vorMonat.getDate() - 30);

  // Einnahmen nach Zeitraum (nur typ = 'einnahme' und 'verkauf' und 'provision')
  const [heuteRes] = await db
    .select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
    .from(transactionsTable)
    .where(sql`created_at >= ${heute} AND typ IN ('einnahme', 'verkauf', 'provision')`);
  const [wocheRes] = await db
    .select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
    .from(transactionsTable)
    .where(sql`created_at >= ${vorWoche} AND typ IN ('einnahme', 'verkauf', 'provision')`);
  const [monatRes] = await db
    .select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
    .from(transactionsTable)
    .where(sql`created_at >= ${vorMonat} AND typ IN ('einnahme', 'verkauf', 'provision')`);
  const [gesamtEinnahmenRes] = await db
    .select({ s: sql<string>`COALESCE(SUM(betrag),0)`, n: sql<number>`COUNT(*)` })
    .from(transactionsTable)
    .where(sql`typ IN ('einnahme', 'verkauf', 'provision')`);

  // Echte Ausgaben
  const [ausgabenRes] = await db
    .select({ s: sql<string>`COALESCE(SUM(betrag),0)`, n: sql<number>`COUNT(*)` })
    .from(transactionsTable)
    .where(sql`typ = 'ausgabe'`);

  // Echte Konversionen aus Kampagnen für CAC
  const [kampagnenStats] = await db
    .select({
      gesamtKonversionen: sql<number>`COALESCE(SUM(konversionen), 0)`,
    })
    .from(campaignsTable)
    .where(sql`status = 'aktiv'`);

  // Umsatz nach Quelle (Stripe vs Digistore24)
  const [stripeSumme] = await db
    .select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
    .from(transactionsTable)
    .where(sql`quelle = 'Stripe' AND typ IN ('einnahme', 'verkauf', 'provision')`);
  const [ds24Summe] = await db
    .select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
    .from(transactionsTable)
    .where(sql`(quelle LIKE 'digistore24%') AND typ IN ('einnahme', 'verkauf', 'provision')`);

  const einnahmen = parseFloat(gesamtEinnahmenRes?.s ?? "0");
  const ausgaben = parseFloat(ausgabenRes?.s ?? "0");
  const konversionen = kampagnenStats?.gesamtKonversionen ?? 0;

  const roi = ausgaben > 0
    ? Math.round(((einnahmen - ausgaben) / ausgaben) * 10000) / 100
    : null;

  const cac = ausgaben > 0 && konversionen > 0
    ? Math.round((ausgaben / konversionen) * 100) / 100
    : null;

  res.json({
    umsatzHeute: parseFloat(heuteRes?.s ?? "0"),
    umsatzWoche: parseFloat(wocheRes?.s ?? "0"),
    umsatzMonat: parseFloat(monatRes?.s ?? "0"),
    gesamtUmsatz: einnahmen,
    gesamtAusgaben: ausgaben,
    umsatzStripe: parseFloat(stripeSumme?.s ?? "0"),
    umsatzDigistore24: parseFloat(ds24Summe?.s ?? "0"),
    roi,
    cac,
    transaktionenAnzahl: Number(gesamtEinnahmenRes?.n ?? 0),
  });
});

export default router;
