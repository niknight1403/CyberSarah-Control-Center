/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LOYALTY & REFERRAL API (Sprint 4.2)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  loyaltyProgramsTable, loyaltyCardsTable, loyaltyTransactionsTable,
  referralsTable, couponsTable
} from "@workspace/db";
import { eq, desc, and, sql, gte } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ─── Programm-Status ─────────────────────────────────────────────────────────
router.get("/loyalty/program", async (_req, res) => {
  const [program] = await db.select().from(loyaltyProgramsTable).limit(1);
  res.json({ programm: program ?? null, konfiguriert: !!program });
});

// ─── Alle Kundenkarten ──────────────────────────────────────────────────────
router.get("/loyalty/cards", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 200);
  const cards = await db.select().from(loyaltyCardsTable).orderBy(desc(loyaltyCardsTable.punkte)).limit(limit);
  res.json({ cards, anzahl: cards.length });
});

// ─── Kundenkarte per Email ───────────────────────────────────────────────────
router.get("/loyalty/card/:email", async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const [card] = await db.select().from(loyaltyCardsTable).where(eq(loyaltyCardsTable.kundenEmail, email)).limit(1);

  if (!card) {
    res.json({ gefunden: false });
    return;
  }

  const transaktionen = await db.select().from(loyaltyTransactionsTable)
    .where(eq(loyaltyTransactionsTable.cardId, card.id))
    .orderBy(desc(loyaltyTransactionsTable.createdAt))
    .limit(50);

  res.json({ gefunden: true, card, transaktionen });
});

// ─── Karte erstellen / Punkte manuell hinzufügen ─────────────────────────────
router.post("/loyalty/card", async (req, res) => {
  const { email, telefon, name } = req.body as any;
  if (!email && !telefon) {
    res.status(400).json({ error: "email oder telefon erforderlich" });
    return;
  }

  const [program] = await db.select({ id: loyaltyProgramsTable.id, willkommensPunkte: loyaltyProgramsTable.willkommensPunkte })
    .from(loyaltyProgramsTable).limit(1);

  if (!program) {
    res.status(400).json({ error: "Kein Treueprogramm aktiv — bitte zuerst initialisieren" });
    return;
  }

  // Prüfen ob bereits existiert
  const [existing] = await db.select().from(loyaltyCardsTable)
    .where(eq(loyaltyCardsTable.kundenEmail, email ?? "")).limit(1);

  if (existing) {
    res.json({ erfolg: true, card: existing, neu: false });
    return;
  }

  const [card] = await db.insert(loyaltyCardsTable).values({
    programId: program.id,
    kundenEmail: email ?? null,
    kundenTelefon: telefon ?? null,
    punkte: program.willkommensPunkte,
    stufe: "bronze",
  }).returning();

  await db.insert(loyaltyTransactionsTable).values({
    cardId: card.id,
    typ: "willkommen",
    punkte: program.willkommensPunkte,
    grund: "Willkommens-Bonus",
  });

  res.json({ erfolg: true, card, neu: true });
});

// ─── Punkte manuell gutschreiben ─────────────────────────────────────────────
router.post("/loyalty/card/:id/punkte", async (req, res) => {
  const id = parseInt(req.params.id);
  const { punkte, grund } = req.body as any;

  if (!punkte || !grund) {
    res.status(400).json({ error: "punkte und grund erforderlich" });
    return;
  }

  await db.update(loyaltyCardsTable)
    .set({ punkte: sql`${loyaltyCardsTable.punkte} + ${punkte}`, updatedAt: new Date() })
    .where(eq(loyaltyCardsTable.id, id));

  await db.insert(loyaltyTransactionsTable).values({
    cardId: id,
    typ: "gutschrift",
    punkte,
    grund,
  });

  res.json({ erfolg: true });
});

// ─── Karten-Statistiken ──────────────────────────────────────────────────────
router.get("/loyalty/stats", async (_req, res) => {
  const [program] = await db.select().from(loyaltyProgramsTable).limit(1);
  const karten = await db.select().from(loyaltyCardsTable);

  const stufen: Record<string, number> = {};
  let punkteSumme = 0;
  for (const k of karten) {
    stufen[k.stufe] = (stufen[k.stufe] ?? 0) + 1;
    punkteSumme += k.punkte;
  }

  const referralCount = await db.select({ count: sql<number>`COUNT(*)` }).from(referralsTable);
  const praemienCount = await db.select({ count: sql<number>`COUNT(*)` }).from(referralsTable).where(eq(referralsTable.praemieGewaehrt, true));

  const vor30Tagen = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const neueKarten = await db.select({ count: sql<number>`COUNT(*)` }).from(loyaltyCardsTable).where(gte(loyaltyCardsTable.createdAt, vor30Tagen));

  res.json({
    programAktiv: !!program,
    kartenGesamt: karten.length,
    neueKarten: Number(neueKarten[0]?.count ?? 0),
    aktivePunkte: punkteSumme,
    stufenVerteilung: stufen,
    referralsGesamt: Number(referralCount[0]?.count ?? 0),
    praemienGewaehrt: Number(praemienCount[0]?.count ?? 0),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REFERRAL ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Alle Referrals ──────────────────────────────────────────────────────────
router.get("/loyalty/referrals", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 200);
  const referrals = await db.select().from(referralsTable).orderBy(desc(referralsTable.createdAt)).limit(limit);
  res.json({ referrals, anzahl: referrals.length });
});

// ─── Referral-Code erstellen ─────────────────────────────────────────────────
router.post("/loyalty/referrals", async (req, res) => {
  const { email, telefon } = req.body as any;
  const code = `CYBER${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const [ref] = await db.insert(referralsTable).values({
    code,
    werberEmail: email ?? null,
    werberTelefon: telefon ?? null,
    status: "offen",
  }).returning();

  res.json({ erfolg: true, referral: ref, code });
});

// ─── Referral per Code validieren ────────────────────────────────────────────
router.get("/loyalty/referrals/:code", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const [ref] = await db.select().from(referralsTable).where(eq(referralsTable.code, code)).limit(1);

  if (!ref || ref.status === "abgelaufen") {
    res.json({ gueltig: false, fehler: "Code ungültig oder abgelaufen" });
    return;
  }

  res.json({ gueltig: true, referral: { code: ref.code, status: ref.status } });
});

// ─── Referral einlösen (Geworbener registriert sich) ─────────────────────────
router.post("/loyalty/referrals/:code/einloesen", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const { email, name, telefon } = req.body as any;

  const [ref] = await db.select().from(referralsTable).where(eq(referralsTable.code, code)).limit(1);
  if (!ref) {
    res.status(404).json({ error: "Code nicht gefunden" });
    return;
  }

  if (ref.status !== "offen") {
    res.status(400).json({ error: `Code bereits ${ref.status}` });
    return;
  }

  await db.update(referralsTable)
    .set({
      status: "registriert",
      geworbenerEmail: email ?? null,
      geworbenerName: name ?? null,
      updatedAt: new Date(),
    })
    .where(eq(referralsTable.id, ref.id));

  // Coupon für Geworbenen erstellen
  const endDatum = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await db.insert(couponsTable).values({
    code: `WILLKOMMEN${Math.random().toString(36).substring(2, 4).toUpperCase()}`,
    typ: "prozent",
    wert: "10",
    maxUses: 1,
    aktiv: true,
    startDatum: new Date(),
    endDatum,
    erstelltVon: "agent",
    kiGeneriert: true,
    kiBegruendung: `Empfehlungs-Coupon für ${email ?? name}`,
  });

  res.json({ erfolg: true, nachricht: "Code eingelöst! Willkommens-Coupon wurde erstellt." });
});

export default router;
