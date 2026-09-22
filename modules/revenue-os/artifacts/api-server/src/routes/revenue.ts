import { Router } from "express";
import { db } from "@workspace/db";
import { revenueOpportunitiesTable, transactionsTable } from "@workspace/db";
import { desc, eq, gte, sql } from "drizzle-orm";
import { fuehreAlleAgentanAus } from "../agents/orchestrator";

const router = Router();


// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE SUMMARY — Für Mobile Dashboard
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/revenue", async (_req, res) => {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const vor30Tagen = new Date();
  vor30Tagen.setDate(vor30Tagen.getDate() - 30);

  const [heuteResult, monatResult, transaktionen] = await Promise.all([
    db.select({ summe: sql<number>`COALESCE(SUM(betrag), 0)` })
      .from(transactionsTable)
      .where(gte(transactionsTable.createdAt, heute)),
    db.select({ summe: sql<number>`COALESCE(SUM(betrag), 0)` })
      .from(transactionsTable)
      .where(gte(transactionsTable.createdAt, vor30Tagen)),
    db.select()
      .from(transactionsTable)
      .orderBy(desc(transactionsTable.createdAt))
      .limit(20),
  ]);

  res.json({
    heute: Number(heuteResult[0]?.summe ?? 0),
    letzte30Tage: Number(monatResult[0]?.summe ?? 0),
    summe: Number(monatResult[0]?.summe ?? 0),
    transaktionen: transaktionen.map(t => ({
      id: t.id, betrag: t.betrag, produktName: t.produktName,
      beschreibung: t.beschreibung, quelle: t.quelle,
      createdAt: t.createdAt,
    })),
  });
});

// GET /revenue/opportunities

router.get("/revenue/opportunities", async (req, res) => {
  try {
    if (!db) { res.json([]); return; }
    const chancen = await db
      .select()
      .from(revenueOpportunitiesTable)
      .orderBy(desc(revenueOpportunitiesTable.geschaetzterMonatsumsatz))
      .limit(50);

    res.json(chancen.map(c => ({
      id: c.id,
      titel: c.titel,
      beschreibung: c.beschreibung,
      kanal: c.kanal,
      marke: c.marke,
      status: c.status,
      geschaetzterMonatsumsatz: Number(c.geschaetzterMonatsumsatz ?? 0),
      tatsaechlicherUmsatz: Number(c.tatsaechlicherUmsatz ?? 0),
      konversionsrate: Number(c.konversionsrate ?? 0),
      stripePaymentLink: c.stripePaymentLink,
      affiliateUrl: c.affiliateUrl,
      prioritaet: c.prioritaet,
      gefundenVon: c.gefundenVon,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })));
  } catch (err) {
    req.log.error({ err }, "Fehler beim Laden der Revenue-Chancen");
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// PATCH /revenue/opportunities/:id
router.patch("/revenue/opportunities/:id", async (req, res) => {
    if (!db) { res.json([]); return; }
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const body = req.body as { status?: string; prioritaet?: number; tatsaechlicherUmsatz?: number; stripePaymentLink?: string };

    if (!db) { res.json([]); return; }
  try {
    await db.update(revenueOpportunitiesTable)
      .set({
        ...(body.status !== undefined && { status: body.status }),
        ...(body.prioritaet !== undefined && { prioritaet: body.prioritaet }),
        ...(body.tatsaechlicherUmsatz !== undefined && { tatsaechlicherUmsatz: body.tatsaechlicherUmsatz.toString() }),
        ...(body.stripePaymentLink !== undefined && { stripePaymentLink: body.stripePaymentLink }),
        updatedAt: new Date(),
      })
      .where(eq(revenueOpportunitiesTable.id, id));

    const [updated] = await db.select().from(revenueOpportunitiesTable).where(eq(revenueOpportunitiesTable.id, id)).limit(1);
    if (!updated) { res.status(404).json({ error: "Chance nicht gefunden" }); return; }

    res.json({
      id: updated.id,
      titel: updated.titel,
      status: updated.status,
      prioritaet: updated.prioritaet,
      geschaetzterMonatsumsatz: Number(updated.geschaetzterMonatsumsatz ?? 0),
      tatsaechlicherUmsatz: Number(updated.tatsaechlicherUmsatz ?? 0),
      stripePaymentLink: updated.stripePaymentLink,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Aktualisieren");
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// POST /revenue/start-all — Startet ALLE Agenten sofort
router.post("/revenue/start-all", async (req, res) => {
  try {
    const ergebnis = await fuehreAlleAgentanAus();
    res.json({
      success: true,
      message: `Autonomes Revenue-System gestartet — ${ergebnis.gestartet} Agenten aktiv`,
      gestartet: ergebnis.gestartet,
      jobIds: ergebnis.jobIds,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Starten aller Agenten");
    res.status(500).json({ error: "Start fehlgeschlagen" });
  }
});

// GET /revenue/status
router.get("/revenue/status", async (req, res) => {
    if (!db) { res.json([]); return; }
    if (!db) { res.json([]); return; }
  try {
    const chancen = await db.select().from(revenueOpportunitiesTable);
    const aktiv = chancen.filter(c => c.status === "aktiv");
    res.json({
      gesamtChancen: chancen.length,
      aktiveChancen: aktiv.length,
      offeneChancen: chancen.filter(c => c.status === "entdeckt").length,
      geschaetzterMonatsumsatz: aktiv.reduce((s, c) => s + Number(c.geschaetzterMonatsumsatz ?? 0), 0),
      tatsaechlicherUmsatz: chancen.reduce((s, c) => s + Number(c.tatsaechlicherUmsatz ?? 0), 0),
      mitStripeLink: chancen.filter(c => c.stripePaymentLink).length,
      mitAffiliateLink: chancen.filter(c => c.affiliateUrl).length,
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Laden des Revenue-Status");
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

export default router;
