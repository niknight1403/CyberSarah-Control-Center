import { db } from "@workspace/db";
import { transactionsTable, agentLogsTable, agentsTable, campaignsTable } from "@workspace/db";
import { eq, gte, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface UmsatzReport {
  umsatzHeute: number;
  umsatzWoche: number;
  umsatzMonat: number;
  gesamtEinnahmen: number;
  gesamtAusgaben: number;
  transaktionenAnzahl: number;
  roi: number | null;
  cac: number | null;
  wachstumsrate: number | null;
  topKampagne: string | null;
}

export async function analysiereUmsatz(agentId: number): Promise<UmsatzReport> {
  const startzeit = Date.now();

  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const vor7Tage = new Date(); vor7Tage.setDate(vor7Tage.getDate() - 7);
  const vor30Tage = new Date(); vor30Tage.setDate(vor30Tage.getDate() - 30);
  const vor60Tage = new Date(); vor60Tage.setDate(vor60Tage.getDate() - 60);

  const [
    [heuteRes],
    [wocheRes],
    [monatRes],
    [vormonatRes],
    [gesamtEinnahmenRes],
    [gesamtAusgabenRes],
  ] = await Promise.all([
    db.select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
      .from(transactionsTable).where(sql`created_at >= ${heute} AND typ = 'einnahme'`),
    db.select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
      .from(transactionsTable).where(sql`created_at >= ${vor7Tage} AND typ = 'einnahme'`),
    db.select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
      .from(transactionsTable).where(sql`created_at >= ${vor30Tage} AND typ = 'einnahme'`),
    // Vormonat (30-60 Tage zurück) für echte Wachstumsrate
    db.select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
      .from(transactionsTable)
      .where(sql`created_at >= ${vor60Tage} AND created_at < ${vor30Tage} AND typ = 'einnahme'`),
    db.select({ s: sql<string>`COALESCE(SUM(betrag),0)`, n: sql<number>`COUNT(*)` })
      .from(transactionsTable).where(sql`typ = 'einnahme'`),
    db.select({ s: sql<string>`COALESCE(SUM(betrag),0)` })
      .from(transactionsTable).where(sql`typ = 'ausgabe'`),
  ]);

  const topKampagneRes = await db
    .select({ name: campaignsTable.name })
    .from(campaignsTable)
    .orderBy(sql`CAST(umsatz AS NUMERIC) DESC`)
    .limit(1);

  const einnahmen = parseFloat(gesamtEinnahmenRes?.s ?? "0");
  const ausgaben = parseFloat(gesamtAusgabenRes?.s ?? "0");
  const monatUmsatz = parseFloat(monatRes?.s ?? "0");
  const vormonatUmsatz = parseFloat(vormonatRes?.s ?? "0");

  // Echte Wachstumsrate: aktueller Monat vs. Vormonat
  const wachstumsrate = vormonatUmsatz > 0
    ? Math.round(((monatUmsatz - vormonatUmsatz) / vormonatUmsatz) * 10000) / 100
    : null;

  // Echter ROI — nur wenn Ausgaben erfasst
  const roi = ausgaben > 0
    ? Math.round(((einnahmen - ausgaben) / ausgaben) * 10000) / 100
    : null;

  // Echter CAC — Ausgaben / Konversionen aus Kampagnen
  const [kampagnenStats] = await db
    .select({ konversionen: sql<number>`COALESCE(SUM(konversionen), 0)` })
    .from(campaignsTable);
  const konversionen = kampagnenStats?.konversionen ?? 0;
  const cac = ausgaben > 0 && konversionen > 0
    ? Math.round((ausgaben / konversionen) * 100) / 100
    : null;

  const report: UmsatzReport = {
    umsatzHeute: parseFloat(heuteRes?.s ?? "0"),
    umsatzWoche: parseFloat(wocheRes?.s ?? "0"),
    umsatzMonat: monatUmsatz,
    gesamtEinnahmen: einnahmen,
    gesamtAusgaben: ausgaben,
    transaktionenAnzahl: gesamtEinnahmenRes?.n ?? 0,
    roi,
    cac,
    wachstumsrate,
    topKampagne: topKampagneRes[0]?.name ?? null,
  };

  const dauer = Date.now() - startzeit;
  const roiText = roi !== null ? `${roi}%` : "keine Ausgaben erfasst";
  const wachstumText = wachstumsrate !== null ? `${wachstumsrate > 0 ? "+" : ""}${wachstumsrate}%` : "n/v";

  await db.insert(agentLogsTable).values({
    agentId,
    agentName: "Revenue Optimizer Agent",
    aktion: "Umsatz-Analyse durchgeführt",
    status: "erfolgreich",
    nachricht: `Einnahmen heute: €${report.umsatzHeute.toFixed(2)} | Monat: €${report.umsatzMonat.toFixed(2)} | Wachstum: ${wachstumText} | ROI: ${roiText}`,
    metadaten: JSON.stringify(report),
    dauer,
  });

  await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
  logger.info(report, "Revenue Agent Analyse abgeschlossen");
  return report;
}
