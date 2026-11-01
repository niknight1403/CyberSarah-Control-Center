/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AI CONVERSION OPTIMIZATION API (Sprint 9)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  abTestCampaignsTable, abTestResultsTable, abTestEventsTable,
  optimizationSuggestionsTable,
} from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// A/B-TEST KAMPAGNEN
// ═══════════════════════════════════════════════════════════════════════════════

// Alle Tests
router.get("/conversion/tests", async (_req, res) => {
  const tests = await db.select()
    .from(abTestCampaignsTable)
    .orderBy(desc(abTestCampaignsTable.createdAt));
  res.json({ tests, anzahl: tests.length });
});

// Aktive Tests
router.get("/conversion/tests/active", async (_req, res) => {
  const tests = await db.select()
    .from(abTestCampaignsTable)
    .where(eq(abTestCampaignsTable.status, "aktiv"))
    .orderBy(desc(abTestCampaignsTable.createdAt));
  res.json({ tests, anzahl: tests.length });
});

// Einzelner Test mit Ergebnissen
router.get("/conversion/tests/:id", async (req, res) => {
  const test = await db.select()
    .from(abTestCampaignsTable)
    .where(eq(abTestCampaignsTable.id, Number(req.params.id)))
    .limit(1);

  if (test.length === 0) return res.status(404).json({ error: "Test nicht gefunden" });

  const ergebnisse = await db.select()
    .from(abTestResultsTable)
    .where(eq(abTestResultsTable.campaignId, Number(req.params.id)));

  res.json({ test: test[0], ergebnisse });
});

// Neuen Test erstellen
router.post("/conversion/tests", async (req, res) => {
  const { name, beschreibung, testTyp, zielElement, kanal,
    varianteAInhalt, varianteBInhalt, mindestStichprobe, autoApply } = req.body;

  const neu = await db.insert(abTestCampaignsTable).values({
    name, beschreibung: beschreibung ?? "",
    testTyp, zielElement, kanal: kanal ?? "all",
    status: "aktiv",
    varianteAInhalt, varianteBInhalt,
    mindestStichprobe: mindestStichprobe ?? 100,
    autoApply: autoApply ?? true,
    gestartetAm: new Date(),
  }).returning();

  // Ergebnis-Einträge anlegen
  if (neu[0]) {
    await db.insert(abTestResultsTable).values([
      { campaignId: neu[0].id, variante: "a" },
      { campaignId: neu[0].id, variante: "b" },
    ]);
  }

  res.json({ success: true, test: neu[0] });
});

// Test pausieren/beenden
router.patch("/conversion/tests/:id", async (req, res) => {
  const { id } = req.params;
  const updates: Record<string, unknown> = {};
  if (req.body.status) updates.status = req.body.status;
  if (req.body.status === "beendet") updates.beendetAm = new Date();
  if (req.body.status === "aktiv") updates.gestartetAm = new Date();
  if (req.body.autoApply !== undefined) updates.autoApply = req.body.autoApply;

  await db.update(abTestCampaignsTable).set(updates).where(eq(abTestCampaignsTable.id, Number(id)));
  res.json({ success: true });
});

// Event tracken (Impression, Click, Conversion)
router.post("/conversion/track", async (req, res) => {
  const { campaignId, variante, eventTyp, kundenIdent, metadaten } = req.body;

  // Event speichern
  await db.insert(abTestEventsTable).values({
    campaignId, variante, eventTyp,
    kundenIdent: kundenIdent ?? null,
    metadaten: metadaten ?? null,
  });

  // Ergebnis aktualisieren
  const resultField = eventTyp === "impression" ? "impressions"
    : eventTyp === "click" ? "klicks"
    : "conversions";

  await db.update(abTestResultsTable)
    .set({ [resultField]: sql`${sql.raw(resultField)} + 1` })
    .where(and(
      eq(abTestResultsTable.campaignId, campaignId),
      eq(abTestResultsTable.variante, variante),
    ));

  if (eventTyp === "conversion") {
    const umsatz = Number(metadaten?.umsatz ?? 0);
    if (umsatz > 0) {
      await db.update(abTestResultsTable)
        .set({ umsatz: sql`COALESCE(umsatz, 0) + ${umsatz}` })
        .where(and(
          eq(abTestResultsTable.campaignId, campaignId),
          eq(abTestResultsTable.variante, variante),
        ));
    }
  }

  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OPTIMIERUNGS-VORSCHLÄGE
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/conversion/suggestions", async (_req, res) => {
  const vorschlaege = await db.select()
    .from(optimizationSuggestionsTable)
    .orderBy(desc(optimizationSuggestionsTable.prioritaet));
  res.json({ vorschlaege, anzahl: vorschlaege.length });
});

router.patch("/conversion/suggestions/:id", async (req, res) => {
  const { id } = req.params;
  await db.update(optimizationSuggestionsTable)
    .set({ status: req.body.status })
    .where(eq(optimizationSuggestionsTable.id, Number(id)));
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTIKEN
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/conversion/stats", async (_req, res) => {
  const [aktiveTests, abgeschlosseneTests, gewinnerA, gewinnerB, offeneVorschlaege] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(abTestCampaignsTable).where(eq(abTestCampaignsTable.status, "aktiv")),
    db.select({ count: sql<number>`COUNT(*)` }).from(abTestCampaignsTable).where(eq(abTestCampaignsTable.status, "abgeschlossen")),
    db.select({ count: sql<number>`COUNT(*)` }).from(abTestCampaignsTable).where(and(eq(abTestCampaignsTable.status, "abgeschlossen"), eq(abTestCampaignsTable.gewinner, "a"))),
    db.select({ count: sql<number>`COUNT(*)` }).from(abTestCampaignsTable).where(and(eq(abTestCampaignsTable.status, "abgeschlossen"), eq(abTestCampaignsTable.gewinner, "b"))),
    db.select({ count: sql<number>`COUNT(*)` }).from(optimizationSuggestionsTable).where(eq(optimizationSuggestionsTable.status, "offen")),
  ]);

  // Durchschnittliche Verbesserung
  const avgVerbesserung = await db
    .select({ avg: sql<number>`AVG(COALESCE(verbesserung_prozent::numeric, 0))` })
    .from(abTestCampaignsTable)
    .where(and(
      eq(abTestCampaignsTable.status, "abgeschlossen"),
      sql`verbesserung_prozent IS NOT NULL`,
    ));

  // Tests nach Typ
  const testsNachTyp = await db
    .select({ typ: abTestCampaignsTable.testTyp, count: sql<number>`COUNT(*)` })
    .from(abTestCampaignsTable)
    .groupBy(abTestCampaignsTable.testTyp);

  res.json({
    aktiveTests: Number(aktiveTests[0]?.count ?? 0),
    abgeschlosseneTests: Number(abgeschlosseneTests[0]?.count ?? 0),
    gewinnerA: Number(gewinnerA[0]?.count ?? 0),
    gewinnerB: Number(gewinnerB[0]?.count ?? 0),
    offeneVorschlaege: Number(offeneVorschlaege[0]?.count ?? 0),
    durchschnittlicheVerbesserung: Number(avgVerbesserung[0]?.avg ?? 0).toFixed(1) + "%",
    testsNachTyp,
  });
});

export default router;
