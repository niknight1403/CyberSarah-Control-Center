/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ABANDONED CART RECOVERY API (Sprint 4.1)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { abandonedCartsTable, couponsTable } from "@workspace/db";
import { eq, desc, and, sql, gte } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ─── Alle abgebrochenen Carts ───────────────────────────────────────────────
router.get("/cart-recovery", async (req, res) => {
  const status = req.query.status as string | undefined;
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);

  let query = db.select().from(abandonedCartsTable).orderBy(desc(abandonedCartsTable.createdAt));

  if (status) {
    query = query.where(eq(abandonedCartsTable.status, status as any));
  }

  const carts = await query.limit(limit);
  res.json({ carts, anzahl: carts.length });
});

// ─── Cart-Statistiken ───────────────────────────────────────────────────────
router.get("/cart-recovery/stats", async (_req, res) => {
  const vor30Tagen = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const statusCounts = await db
    .select({
      status: abandonedCartsTable.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(abandonedCartsTable)
    .where(gte(abandonedCartsTable.createdAt, vor30Tagen))
    .groupBy(abandonedCartsTable.status);

  const gesamt = statusCounts.reduce((s, c) => s + c.count, 0);
  const wiederhergestellt = statusCounts.find(s => s.status === "wiederhergestellt")?.count ?? 0;
  const verloren = statusCounts.find(s => s.status === "verloren")?.count ?? 0;
  const offen = gesamt - wiederhergestellt - verloren;
  const rate = gesamt > 0 ? ((wiederhergestellt / gesamt) * 100).toFixed(1) : "0.0";

  // Wiederhergestellter Umsatz
  const umsatz = await db
    .select({ summe: sql<number>`COALESCE(SUM(gesamtbetrag::numeric), 0)` })
    .from(abandonedCartsTable)
    .where(
      and(
        eq(abandonedCartsTable.status, "wiederhergestellt"),
        gte(abandonedCartsTable.createdAt, vor30Tagen),
      ),
    );

  res.json({
    gesamt,
    wiederhergestellt,
    verloren,
    offen,
    recoveryRate: `${rate}%`,
    wiederhergestellterUmsatz: `${Number(umsatz[0]?.summe ?? 0).toFixed(2)}€`,
    statusCounts,
  });
});

// ─── Manuell einen abgebrochenen Cart erfassen ────────────────────────────────
router.post("/cart-recovery", async (req, res) => {
  const { kundenEmail, kundenTelefon, kundenName, produkte, gesamtbetrag, quelle } = req.body as any;

  if ((!kundenEmail && !kundenTelefon) || !produkte || !gesamtbetrag) {
    res.status(400).json({ error: "kundenEmail/kundenTelefon, produkte und gesamtbetrag sind erforderlich" });
    return;
  }

  const [cart] = await db.insert(abandonedCartsTable).values({
    kundenEmail: kundenEmail ?? null,
    kundenTelefon: kundenTelefon ?? null,
    kundenName: kundenName ?? null,
    produkte: JSON.stringify(produkte),
    gesamtbetrag: String(gesamtbetrag),
    quelle: quelle ?? "manual",
    status: "neu",
    erinnerungsKanaele: JSON.stringify(kundenEmail ? ["email"] : kundenTelefon ? ["whatsapp"] : ["push"]),
  }).returning();

  res.json({ erfolg: true, cart });
});

// ─── Cart als wiederhergestellt markieren ────────────────────────────────────
router.post("/cart-recovery/:id/wiederhergestellt", async (req, res) => {
  const id = parseInt(req.params.id);
  const { transaktionsId } = req.body as any;

  await db.update(abandonedCartsTable)
    .set({
      status: "wiederhergestellt",
      wiederhergestelltAm: new Date(),
      wiederhergestelltTransaktion: transaktionsId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(abandonedCartsTable.id, id));

  res.json({ erfolg: true });
});

// ─── Cart manuell löschen ────────────────────────────────────────────────────
router.delete("/cart-recovery/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(abandonedCartsTable).where(eq(abandonedCartsTable.id, id));
  res.json({ erfolg: true });
});

export default router;
