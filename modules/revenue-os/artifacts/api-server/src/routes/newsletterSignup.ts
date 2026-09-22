/**
 * Newsletter Signup API Route
 * Speichert E-Mails in der leadsTable für E-Mail-Marketing.
 * Funktioniert ohne externen Email-Provider (speichert in DB).
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable, emailSequenzenTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ─── Newsletter-Anmeldung ────────────────────────────────────────────────────
router.post("/newsletter/signup", async (req, res) => {
  try {
    const { email, marke, quelle } = req.body as {
      email?: string;
      marke?: string;
      quelle?: string;
    };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ success: false, error: "Ungültige E-Mail-Adresse" });
      return;
    }

    const safeEmail = email.toLowerCase().trim();
    const markeFinal = marke ?? "CyberSarah";
    const quelleFinal = quelle ?? "newsletter_landing";

    // Prüfen ob bereits vorhanden
    const [existing] = await db
      .select({ id: leadsTable.id, status: leadsTable.status })
      .from(leadsTable)
      .where(eq(leadsTable.email, safeEmail))
      .limit(1);

    if (existing) {
      if (existing.status === "abgemeldet") {
        // Wieder anmelden
        await db.update(leadsTable)
          .set({ status: "aktiv", aktuellerSchritt: 0, updatedAt: new Date() })
          .where(eq(leadsTable.id, existing.id));
        logger.info({ email: safeEmail }, "📧 Lead reaktiviert");
      }
      res.json({ success: true, message: "Bereits angemeldet!" });
      return;
    }

    // Neue Sequenz-ID holen (Willkommens-Sequenz)
    const [willkommensSeq] = await db
      .select({ id: emailSequenzenTable.id })
      .from(emailSequenzenTable)
      .where(eq(emailSequenzenTable.marke, markeFinal))
      .limit(1);

    await db.insert(leadsTable).values({
      email: safeEmail,
      marke: markeFinal,
      quelle: quelleFinal,
      status: "aktiv",
      sequenzId: willkommensSeq?.id ?? null,
      aktuellerSchritt: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    logger.info({ email: safeEmail, marke: markeFinal }, "📧 Neuer Newsletter-Abonnent!");

    res.json({
      success: true,
      message: "✅ Erfolgreich angemeldet! Du bekommst in Kürze exklusive KI-Tipps & Angebote.",
    });
  } catch (err) {
    logger.error({ err }, "Newsletter Signup Fehler");
    res.status(500).json({ success: false, error: "Anmeldung temporär nicht verfügbar" });
  }
});

// ─── Abmelden ────────────────────────────────────────────────────────────────
router.post("/newsletter/unsubscribe", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) { res.status(400).json({ error: "Email required" }); return; }

    await db.update(leadsTable)
      .set({ status: "abgemeldet", updatedAt: new Date() })
      .where(eq(leadsTable.email, email.toLowerCase().trim()));

    res.json({ success: true, message: "Du wurdest abgemeldet." });
  } catch {
    res.json({ success: true, message: "Abmeldung verarbeitet." });
  }
});

// ─── E-Mail-Sequenz-Status für Admin ─────────────────────────────────────────
router.get("/newsletter/stats", async (_req, res) => {
  try {
    const [aktive, abgemeldet] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(leadsTable).where(eq(leadsTable.status, "aktiv")),
      db.select({ count: sql<number>`COUNT(*)` }).from(leadsTable).where(eq(leadsTable.status, "abgemeldet")),
    ]);
    res.json({
      aktive: Number(aktive[0]?.count ?? 0),
      abgemeldet: Number(abgemeldet[0]?.count ?? 0),
    });
  } catch {
    res.json({ aktive: 0, abgemeldet: 0 });
  }
});

export default router;
