/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AFFILIATE PARTNER API (Sprint 5.1)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  affiliatePartnersTable, affiliateLinksTable, affiliateClicksTable,
  affiliatePayoutsTable
} from "@workspace/db";
import { eq, desc, and, sql, gte } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// PARTNER
// ═══════════════════════════════════════════════════════════════════════════════

// Partner-Liste
router.get("/affiliates/partners", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 200);
  const partners = await db.select().from(affiliatePartnersTable).orderBy(desc(affiliatePartnersTable.gesamtUmsatz)).limit(limit);
  res.json({ partners, anzahl: partners.length });
});

// Partner erfassen
router.post("/affiliates/partners", async (req, res) => {
  const { email, name, telefon, website, provisionProzentsatz, cookieTage, paypalEmail } = req.body as any;
  if (!email) { res.status(400).json({ error: "email erforderlich" }); return; }

  const [existing] = await db.select({ id: affiliatePartnersTable.id }).from(affiliatePartnersTable).where(eq(affiliatePartnersTable.email, email)).limit(1);
  if (existing) { res.status(409).json({ error: "Partner existiert bereits" }); return; }

  const [partner] = await db.insert(affiliatePartnersTable).values({
    email, name: name ?? null, telefon: telefon ?? null,
    website: website ?? null,
    provisionProzentsatz: provisionProzentsatz ?? "10",
    cookieTage: cookieTage ?? 30,
    paypalEmail: paypalEmail ?? null,
  }).returning();

  res.json({ erfolg: true, partner });
});

// Partner aktualisieren
router.put("/affiliates/partners/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body as any;
  await db.update(affiliatePartnersTable).set({ ...updates, updatedAt: new Date() }).where(eq(affiliatePartnersTable.id, id));
  res.json({ erfolg: true });
});

// Partner-Statistiken
router.get("/affiliates/stats", async (_req, res) => {
  const partners = await db.select().from(affiliatePartnersTable);

  const gesamtUmsatz = partners.reduce((s, p) => s + parseFloat(p.gesamtUmsatz), 0);
  const gesamtProvision = partners.reduce((s, p) => s + parseFloat(p.gesamtProvision), 0);
  const ausstehend = partners.reduce((s, p) => s + parseFloat(p.ausstehendProvision), 0);
  const ausgezahlt = partners.reduce((s, p) => s + parseFloat(p.ausgezahltProvision), 0);
  const klicks = partners.reduce((s, p) => s + p.klickAnzahl, 0);
  const konversionen = partners.reduce((s, p) => s + p.konversionAnzahl, 0);

  const stufen: Record<string, number> = {};
  for (const p of partners) stufen[p.stufe] = (stufen[p.stufe] ?? 0) + 1;

  const payoutCount = await db.select({ count: sql<number>`COUNT(*)` }).from(affiliatePayoutsTable);
  const linkCount = await db.select({ count: sql<number>`COUNT(*)` }).from(affiliateLinksTable);

  res.json({
    partnerGesamt: partners.length,
    aktivePartner: partners.filter(p => p.status === "aktiv").length,
    gesamtUmsatz: gesamtUmsatz.toFixed(2),
    gesamtProvision: gesamtProvision.toFixed(2),
    ausstehendProvision: ausstehend.toFixed(2),
    ausgezahltProvision: ausgezahlt.toFixed(2),
    stufenVerteilung: stufen,
    auszahlungen: Number(payoutCount[0]?.count ?? 0),
    linksGesamt: Number(linkCount[0]?.count ?? 0),
    klicks,
    konversionen,
    konversionsRate: klicks > 0 ? `${((konversionen / klicks) * 100).toFixed(1)}%` : "0%",
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LINKS
// ═══════════════════════════════════════════════════════════════════════════════

// Links für einen Partner
router.get("/affiliates/links/:partnerId", async (req, res) => {
  const partnerId = parseInt(req.params.partnerId);
  const links = await db.select().from(affiliateLinksTable)
    .where(eq(affiliateLinksTable.partnerId, partnerId))
    .orderBy(desc(affiliateLinksTable.createdAt));
  res.json({ links, anzahl: links.length });
});

// Link erstellen
router.post("/affiliates/links", async (req, res) => {
  const { partnerId, name, zielUrl, produktName, provisionAbweichend } = req.body as any;
  if (!partnerId || !zielUrl) { res.status(400).json({ error: "partnerId und zielUrl erforderlich" }); return; }

  const code = `REF${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const [link] = await db.insert(affiliateLinksTable).values({
    partnerId, code, name: name ?? null, zielUrl,
    produktName: produktName ?? null,
    provisionAbweichend: provisionAbweichend ?? null,
  }).returning();

  res.json({ erfolg: true, link, trackingUrl: `https://cybersarah.de/ref/${code}` });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

// Click tracken (wird von Redirect aufgerufen)
router.get("/affiliates/track/:code", async (req, res) => {
  const code = req.params.code;
  const [link] = await db.select().from(affiliateLinksTable)
    .where(and(eq(affiliateLinksTable.code, code), eq(affiliateLinksTable.aktiv, true)))
    .limit(1);

  if (!link) {
    res.redirect(302, "https://cybersarah.de/");
    return;
  }

  await db.insert(affiliateClicksTable).values({
    linkId: link.id,
    partnerId: link.partnerId,
    ipAdresse: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
    referrer: req.headers["referer"] ?? null,
    zielUrl: link.zielUrl,
  });

  await db.update(affiliateLinksTable)
    .set({ klickAnzahl: sql`${affiliateLinksTable.klickAnzahl} + 1` })
    .where(eq(affiliateLinksTable.id, link.id));

  await db.update(affiliatePartnersTable)
    .set({
      klickAnzahl: sql`${affiliatePartnersTable.klickAnzahl} + 1`,
      letzteAktivitaet: new Date(),
    })
    .where(eq(affiliatePartnersTable.id, link.partnerId));

  res.redirect(302, link.zielUrl);
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUSZAHLUNGEN
// ═══════════════════════════════════════════════════════════════════════════════

// Auszahlungen (alle oder pro Partner)
router.get("/affiliates/payouts", async (req, res) => {
  const partnerId = req.query.partnerId ? parseInt(req.query.partnerId as string) : undefined;
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 200);

  let query = db.select().from(affiliatePayoutsTable).orderBy(desc(affiliatePayoutsTable.createdAt));
  if (partnerId) query = query.where(eq(affiliatePayoutsTable.partnerId, partnerId));

  const payouts = await query.limit(limit);
  res.json({ payouts, anzahl: payouts.length });
});

// Auszahlung als bezahlt markieren
router.post("/affiliates/payouts/:id/bezahlt", async (req, res) => {
  const id = parseInt(req.params.id);
  const { referenzId } = req.body as any;
  await db.update(affiliatePayoutsTable)
    .set({ status: "bezahlt", referenzId: referenzId ?? null, bezahltAm: new Date(), updatedAt: new Date() })
    .where(eq(affiliatePayoutsTable.id, id));
  res.json({ erfolg: true });
});

export default router;
