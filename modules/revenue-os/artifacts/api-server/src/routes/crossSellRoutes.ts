/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CROSS-SELL API (Sprint 8)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  crossSellRulesTable, crossSellRecommendationsTable,
  crossSellCampaignsTable, transactionsTable, produkteTable,
} from "@workspace/db";
import { eq, desc, and, sql, gte } from "drizzle-orm";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// REGELN
// ═══════════════════════════════════════════════════════════════════════════════

// Alle aktiven Cross-Sell-Regeln
router.get("/cross-sell/rules", async (_req, res) => {
  const regeln = await db.select()
    .from(crossSellRulesTable)
    .where(eq(crossSellRulesTable.aktiv, true))
    .orderBy(desc(crossSellRulesTable.wahrscheinlichkeit));
  res.json({ regeln, anzahl: regeln.length });
});

// Neue Regel erstellen
router.post("/cross-sell/rules", async (req, res) => {
  const { quellProdukt, zielProdukt, regelTyp, rabattProzent, kategorie } = req.body;
  const neu = await db.insert(crossSellRulesTable).values({
    quellProdukt, zielProdukt,
    regelTyp: regelTyp ?? "manuell",
    rabattProzent: rabattProzent ?? 0,
    kategorie: kategorie ?? "cross_sell",
    wahrscheinlichkeit: "0.50",
    aktiv: true,
  }).returning();
  res.json({ success: true, regel: neu[0] });
});

// Regel aktualisieren (z.B. Rabatt ändern)
router.patch("/cross-sell/rules/:id", async (req, res) => {
  const { id } = req.params;
  const updates: Record<string, unknown> = {};
  if (req.body.rabattProzent !== undefined) updates.rabattProzent = req.body.rabattProzent;
  if (req.body.aktiv !== undefined) updates.aktiv = req.body.aktiv;
  if (req.body.kategorie !== undefined) updates.kategorie = req.body.kategorie;

  await db.update(crossSellRulesTable).set(updates).where(eq(crossSellRulesTable.id, Number(id)));
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMPFEHLUNGEN
// ═══════════════════════════════════════════════════════════════════════════════

// Letzte 50 Empfehlungen
router.get("/cross-sell/recommendations", async (_req, res) => {
  const empfehlungen = await db.select()
    .from(crossSellRecommendationsTable)
    .orderBy(desc(crossSellRecommendationsTable.createdAt))
    .limit(50);
  res.json({ empfehlungen, anzahl: empfehlungen.length });
});

// Empfehlungen filtern nach Status
router.get("/cross-sell/recommendations/:status", async (req, res) => {
  const { status } = req.params;
  const empfehlungen = await db.select()
    .from(crossSellRecommendationsTable)
    .where(eq(crossSellRecommendationsTable.status, status))
    .orderBy(desc(crossSellRecommendationsTable.createdAt))
    .limit(50);
  res.json({ empfehlungen, anzahl: empfehlungen.length });
});

// ═══════════════════════════════════════════════════════════════════════════════
// KAMPAGNEN
// ═══════════════════════════════════════════════════════════════════════════════

// Alle Kampagnen
router.get("/cross-sell/campaigns", async (_req, res) => {
  const kampagnen = await db.select()
    .from(crossSellCampaignsTable)
    .orderBy(desc(crossSellCampaignsTable.createdAt));
  res.json({ kampagnen, anzahl: kampagnen.length });
});

// Neue Kampagne erstellen + sofort ausführen
router.post("/cross-sell/campaigns", async (req, res) => {
  const { name, beschreibung, kanaele, zielProdukte } = req.body;
  const neu = await db.insert(crossSellCampaignsTable).values({
    name, beschreibung: beschreibung ?? "",
    kanaele: kanaele ?? ["email"],
    zielProdukte: zielProdukte ?? null,
    status: "aktiv",
    startedAm: new Date(),
  }).returning();

  // Queue Cross-Sell Job
  const { globalQueue } = await import("../agents/JobQueue");
  globalQueue.fuegeHinzu("cross_sell_full", { aktion: "full_scan" }, { prioritaet: 1 });

  res.json({ success: true, kampagne: neu[0] });
});

// Kampagne pausieren/beenden
router.patch("/cross-sell/campaigns/:id", async (req, res) => {
  const { id } = req.params;
  const updates: Record<string, unknown> = {};
  if (req.body.status) updates.status = req.body.status;
  if (req.body.status === "beendet") updates.endedAm = new Date();
  await db.update(crossSellCampaignsTable).set(updates).where(eq(crossSellCampaignsTable.id, Number(id)));
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTIKEN
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/cross-sell/stats", async (_req, res) => {
  const [regelnAktiv, empfehlungenGesendet, empfehlungenKonvertiert] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(crossSellRulesTable).where(eq(crossSellRulesTable.aktiv, true)),
    db.select({ count: sql<number>`COUNT(*)` }).from(crossSellRecommendationsTable).where(eq(crossSellRecommendationsTable.status, "gesendet")),
    db.select({ count: sql<number>`COUNT(*)` }).from(crossSellRecommendationsTable).where(eq(crossSellRecommendationsTable.status, "konvertiert")),
  ]);

  const konversionsRate = Number(empfehlungenGesendet[0]?.count ?? 0) > 0
    ? (Number(empfehlungenKonvertiert[0]?.count ?? 0) / Number(empfehlungenGesendet[0]?.count ?? 1) * 100).toFixed(1)
    : "0.0";

  // Top-Regeln nach Conversion
  const topRegeln = await db.select()
    .from(crossSellRulesTable)
    .where(eq(crossSellRulesTable.aktiv, true))
    .orderBy(desc(crossSellRulesTable.konversionsRate))
    .limit(5);

  const statusVerteilung = await db
    .select({ status: crossSellRecommendationsTable.status, count: sql<number>`COUNT(*)` })
    .from(crossSellRecommendationsTable)
    .groupBy(crossSellRecommendationsTable.status);

  res.json({
    regelnAktiv: Number(regelnAktiv[0]?.count ?? 0),
    empfehlungenGesendet: Number(empfehlungenGesendet[0]?.count ?? 0),
    empfehlungenKonvertiert: Number(empfehlungenKonvertiert[0]?.count ?? 0),
    konversionsRate: `${konversionsRate}%`,
    topRegeln,
    statusVerteilung,
  });
});

export default router;
