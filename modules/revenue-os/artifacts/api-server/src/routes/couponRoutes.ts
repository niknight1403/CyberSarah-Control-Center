/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * COUPON & RABATT-API (Sprint 4.1)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { couponsTable, couponUsesTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ─── Alle aktiven Coupons ───────────────────────────────────────────────────
router.get("/coupons", async (_req, res) => {
  const coupons = await db
    .select()
    .from(couponsTable)
    .where(
      and(
        eq(couponsTable.aktiv, true),
        sql`(${couponsTable.endDatum} IS NULL OR ${couponsTable.endDatum} > NOW())`,
      ),
    )
    .orderBy(desc(couponsTable.createdAt));

  res.json({ coupons, anzahl: coupons.length });
});

// ─── Alle Coupons (auch inaktive) ────────────────────────────────────────────
router.get("/coupons/alle", async (_req, res) => {
  const coupons = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
  res.json({ coupons, anzahl: coupons.length });
});

// ─── Coupon per Code validieren ──────────────────────────────────────────────
router.get("/coupons/validieren/:code", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const [coupon] = await db
    .select()
    .from(couponsTable)
    .where(
      and(
        eq(couponsTable.code, code),
        eq(couponsTable.aktiv, true),
        sql`(${couponsTable.endDatum} IS NULL OR ${couponsTable.endDatum} > NOW())`,
      ),
    );

  if (!coupon) {
    res.json({ gueltig: false, fehler: "Coupon nicht gefunden oder abgelaufen" });
    return;
  }

  if (coupon.maxUses && coupon.maxUses > 0 && coupon.uses >= coupon.maxUses) {
    res.json({ gueltig: false, fehler: "Coupon bereits aufgebraucht" });
    return;
  }

  res.json({
    gueltig: true,
    coupon: {
      code: coupon.code,
      typ: coupon.typ,
      wert: coupon.wert,
      mindestbestellwert: coupon.mindestbestellwert,
      kiGeneriert: coupon.kiGeneriert,
      kiBegruendung: coupon.kiBegruendung,
    },
  });
});

// ─── Coupon manuell erstellen ────────────────────────────────────────────────
router.post("/coupons", async (req, res) => {
  const { code, typ, wert, mindestbestellwert, maxUses, giltFuerProdukte, laufzeitStunden } = req.body as any;

  if (!code || !typ || wert === undefined) {
    res.status(400).json({ error: "code, typ und wert sind erforderlich" });
    return;
  }

  const endDatum = laufzeitStunden ? new Date(Date.now() + laufzeitStunden * 60 * 60 * 1000) : null;

  const [coupon] = await db.insert(couponsTable).values({
    code: code.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    typ,
    wert: String(wert),
    mindestbestellwert: mindestbestellwert ? String(mindestbestellwert) : "0",
    maxUses: maxUses ?? 0,
    aktiv: true,
    startDatum: new Date(),
    endDatum,
    erstelltVon: "admin",
    giltFuerProdukte: giltFuerProdukte ?? "all",
  }).returning();

  res.json({ erfolg: true, coupon });
});

// ─── Coupon deaktivieren ─────────────────────────────────────────────────────
router.delete("/coupons/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(couponsTable).set({ aktiv: false, updatedAt: new Date() }).where(eq(couponsTable.id, id));
  res.json({ erfolg: true });
});

// ─── Coupon-Nutzungsstatistik ────────────────────────────────────────────────
router.get("/coupons/statistik", async (_req, res) => {
  const coupons = await db.select().from(couponsTable).orderBy(desc(couponsTable.uses));

  const gesamt = coupons.reduce((s, c) => s + (c.maxUses && c.maxUses > 0 ? (c.uses / c.maxUses) * 100 : c.uses > 0 ? 100 : 0), 0);
  const aktiv = coupons.filter(c => c.aktiv).length;

  res.json({
    gesamtCoupons: coupons.length,
    aktiv,
    inaktiv: coupons.length - aktiv,
    gesamtNutzungen: coupons.reduce((s, c) => s + c.uses, 0),
    kiCoupons: coupons.filter(c => c.kiGeneriert).length,
    coupons,
  });
});

export default router;
