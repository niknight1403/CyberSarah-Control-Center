/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * E-MAIL AUTOMATION API (Sprint 3.1)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * REST-API für:
 *  - E-Mail-Konfiguration testen
 *  - Transaktions-E-Mails senden (Bestellbestätigung, Zahlungseingang)
 *  - E-Mail-Sequenzen verwalten (CRUD)
 *  - Leads verwalten (importieren, Status ändern, exportieren)
 *  - Einzel-E-Mails versenden (für Kampagnen/Newsletter)
 *  - E-Mail an Kunden nach Bestellung
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { Router } from "express";
import { sendEmail, testEmailConfig } from "../lib/emailClient";
import {
  orderConfirmation, paymentReceived, welcomeEmail,
  adminOrderNotification, nurtureEmail,
} from "../lib/emailTemplates";
import { db } from "@workspace/db";
import { emailSequenzenTable, leadsTable, transactionsTable, produkteTable, agentLogsTable } from "@workspace/db";
import { eq, desc, and, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { klassifiziereEingangsAntwort, fuegeZurBlacklistHinzu } from "../lib/emailCompliance";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/email/status — E-Mail-Konfiguration prüfen
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/email/status", async (_req, res) => {
  const config = await testEmailConfig();
  res.json(config);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/email/sequenzen — Alle E-Mail-Sequenzen abrufen
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/email/sequenzen", async (_req, res) => {
  if (!db) { res.json([]); return; }
  const sequenzen = await db.select().from(emailSequenzenTable).orderBy(desc(emailSequenzenTable.createdAt));
  res.json(sequenzen.map(s => ({
    id: s.id, marke: s.marke, name: s.name, leadMagnet: s.leadMagnet,
    emailAnzahl: (s.emails as any[])?.length ?? 0, aktiv: s.aktiv, klicks: s.klicks ?? 0,
    produktId: s.produktId, createdAt: s.createdAt,
  })));
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/email/sequenzen/:id — Einzelne Sequenz mit Details
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/email/sequenzen/:id", async (req, res) => {
  if (!db) { res.status(503).json({ error: "Keine DB" }); return; }
  const id = parseInt(req.params.id);
  if (!id) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const [seq] = await db.select().from(emailSequenzenTable).where(eq(emailSequenzenTable.id, id));
  if (!seq) { res.status(404).json({ error: "Sequenz nicht gefunden" }); return; }

  // Leads in dieser Sequenz zählen
  const [leadCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(leadsTable)
    .where(eq(leadsTable.sequenzId, id));

  res.json({ ...seq, leadAnzahl: Number(leadCount?.count ?? 0) });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/email/senden — Einzel-E-Mail versenden
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/email/senden", async (req, res) => {
  try {
    const body = req.body as {
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
      replyTo?: string;
      tags?: Record<string, string>;
    };

    if (!body.to || !body.subject) {
      res.status(400).json({ error: "to und subject sind erforderlich" });
      return;
    }

    const result = await sendEmail({
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
      replyTo: body.replyTo,
      tags: body.tags,
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Fehler beim E-Mail-Versand");
    res.status(500).json({ error: "E-Mail-Versand fehlgeschlagen" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/email/bestellbestaetigung — Bestellbestätigung senden
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/email/bestellbestaetigung", async (req, res) => {
  try {
    const body = req.body as {
      to: string;
      kundenName?: string;
      produktName: string;
      betrag: number;
      transaktionsId?: string;
      downloadLink?: string;
      marke: string;
    };

    if (!body.to || !body.produktName || !body.betrag || !body.marke) {
      res.status(400).json({ error: "to, produktName, betrag und marke sind erforderlich" });
      return;
    }

    const email = orderConfirmation(body);
    const result = await sendEmail({
      to: body.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: { type: "order_confirmation", marke: body.marke },
    });

    req.log.info({ to: body.to, produkt: body.produktName }, "📧 Bestellbestätigung gesendet");
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Fehler beim Senden der Bestellbestätigung");
    res.status(500).json({ error: "Fehler beim Senden" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/email/willkommen — Willkommens-E-Mail senden
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/email/willkommen", async (req, res) => {
  try {
    const body = req.body as {
      to: string;
      kundenName?: string;
      marke: string;
      leadMagnet?: string;
      downloadLink?: string;
    };

    if (!body.to || !body.marke) {
      res.status(400).json({ error: "to und marke sind erforderlich" });
      return;
    }

    const email = welcomeEmail(body);
    const result = await sendEmail({
      to: body.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: { type: "welcome", marke: body.marke },
    });

    req.log.info({ to: body.to, marke: body.marke }, "📧 Willkommens-E-Mail gesendet");
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Fehler beim Senden der Willkommens-E-Mail");
    res.status(500).json({ error: "Fehler beim Senden" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/email/leads — Alle Leads abrufen
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/email/leads", async (req, res) => {
  if (!db) { res.json([]); return; }
  const marke = req.query.marke as string | undefined;
  const status = req.query.status as string | undefined;

  let query = db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt));
  if (marke) query = query.where(eq(leadsTable.marke, marke)) as any;
  if (status) query = query.where(eq(leadsTable.status, status)) as any;

  const leads = await query.limit(200);

  // Statistik
  const [gesamtCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(leadsTable);
  const [aktivCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(leadsTable).where(eq(leadsTable.status, "aktiv"));

  res.json({
    leads: leads.map(l => ({
      id: l.id, email: l.email, marke: l.marke, quelle: l.quelle,
      status: l.status, aktuellerSchritt: l.aktuellerSchritt,
      letzteEmailAm: l.letzteEmailAm?.toISOString(),
      createdAt: l.createdAt?.toISOString(),
    })),
    gesamt: Number(gesamtCount?.count ?? 0),
    aktiv: Number(aktivCount?.count ?? 0),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/email/leads — Neuen Lead anlegen
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/email/leads", async (req, res) => {
  if (!db) { res.status(503).json({ error: "Keine DB" }); return; }

  const body = req.body as {
    email: string; marke: string;
    quelle?: string; sequenzId?: number;
  };

  if (!body.email || !body.marke) {
    res.status(400).json({ error: "email und marke erforderlich" });
    return;
  }

  // Prüfen ob Lead existiert
  const [existing] = await db.select().from(leadsTable).where(eq(leadsTable.email, body.email));
  if (existing) {
    res.json({ success: true, lead: existing, bereitsVorhanden: true });
    return;
  }

  // Automatisch passende Sequenz finden
  let sequenzId = body.sequenzId;
  if (!sequenzId) {
    const [seq] = await db
      .select()
      .from(emailSequenzenTable)
      .where(and(eq(emailSequenzenTable.marke, body.marke), eq(emailSequenzenTable.aktiv, true)))
      .limit(1);
    if (seq) sequenzId = seq.id;
  }

  const [lead] = await db.insert(leadsTable).values({
    email: body.email,
    marke: body.marke,
    quelle: body.quelle,
    sequenzId,
    status: "aktiv",
    aktuellerSchritt: 0,
  }).returning();

  // Automatisch Willkommens-E-Mail senden
  try {
    const seq = sequenzId ? (await db.select().from(emailSequenzenTable).where(eq(emailSequenzenTable.id, sequenzId)).limit(1))[0] : null;
    const email = welcomeEmail({
      kundenName: body.email.split("@")[0],
      marke: body.marke,
      leadMagnet: seq?.leadMagnet,
    });
    await sendEmail({
      to: body.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: { type: "welcome_auto", marke: body.marke },
    });
  } catch (err) {
    logger.warn({ err, email: body.email }, "Willkommens-E-Mail nicht gesendet");
  }

  req.log.info({ email: body.email, marke: body.marke, sequenzId }, "📧 Neuer Lead angelegt");
  res.status(201).json({ success: true, lead });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/email/leads/:id — Lead-Status ändern
// ═══════════════════════════════════════════════════════════════════════════════

router.patch("/email/leads/:id", async (req, res) => {
  if (!db) { res.status(503).json({ error: "Keine DB" }); return; }
  const id = parseInt(req.params.id);
  if (!id) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const body = req.body as { status?: string; sequenzId?: number };
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (body.status) updates.status = body.status;
  if (body.sequenzId) updates.sequenzId = body.sequenzId;

  const [lead] = await db.update(leadsTable).set(updates).where(eq(leadsTable.id, id)).returning();
  res.json({ success: true, lead });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/email/sequenzen/:id/nurture — Nurture-E-Mail aus Sequenz senden
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/email/sequenzen/:id/nurture", async (req, res) => {
  if (!db) { res.status(503).json({ error: "Keine DB" }); return; }
  const id = parseInt(req.params.id);

  const [seq] = await db.select().from(emailSequenzenTable).where(eq(emailSequenzenTable.id, id));
  if (!seq) { res.status(404).json({ error: "Sequenz nicht gefunden" }); return; }

  const emails = seq.emails as Array<{ betreff: string; inhalt: string; tagNachAnmeldung: number }>;
  const leads = await db.select().from(leadsTable)
    .where(and(eq(leadsTable.sequenzId, id), eq(leadsTable.status, "aktiv")));

  let gesendet = 0;
  let fehler = 0;

  for (const lead of leads) {
    const naechsterSchritt = lead.aktuellerSchritt;
    if (naechsterSchritt >= emails.length) continue;

    const email = emails[naechsterSchritt];
    if (!email) continue;

    try {
      const emailContent = nurtureEmail({
        marke: seq.marke,
        betreff: email.betreff,
        inhalt: email.inhalt || "Hier steht dein persönlicher Content...",
        ctaText: "Zum Angebot",
        ctaLink: "https://cybersarah.ai/produkte",
        schritt: naechsterSchritt + 1,
        gesamt: emails.length,
      });

      const result = await sendEmail({
        to: lead.email,
        subject: email.betreff,
        html: emailContent.html,
        text: emailContent.text,
        tags: { type: "nurture", sequenzId: String(id), schritt: String(naechsterSchritt) },
      });

      if (result.success) {
        await db.update(leadsTable).set({
          aktuellerSchritt: naechsterSchritt + 1,
          letzteEmailAm: new Date(),
          updatedAt: new Date(),
        }).where(eq(leadsTable.id, lead.id));

        await db.update(emailSequenzenTable)
          .set({ klicks: sql`${emailSequenzenTable.klicks} + 1` })
          .where(eq(emailSequenzenTable.id, id));

        gesendet++;
      } else {
        fehler++;
      }
    } catch (err) {
      fehler++;
      logger.warn({ err, email: lead.email }, "Nurture-E-Mail fehlgeschlagen");
    }
  }

  req.log.info({ sequenzId: id, gesendet, fehler }, "📧 Nurture-Sequenz verarbeitet");
  res.json({ success: true, gesendet, fehler, gesamt: leads.length });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/email/transaktions-test — Test-E-Mail senden (für Setup)
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/email/test", async (req, res) => {
  try {
    const body = req.body as { to: string };
    if (!body.to) { res.status(400).json({ error: "E-Mail-Adresse erforderlich" }); return; }

    const result = await sendEmail({
      to: body.to,
      subject: "🧪 Test-E-Mail von CyberSarah Revenue OS",
      html: `<h1>Test-E-Mail</h1><p>Wenn du diese E-Mail siehst, funktioniert der E-Mail-Versand!</p>
             <p>Provider: ${(await testEmailConfig()).provider}</p>
             <p>Gesendet am: ${new Date().toLocaleString("de-DE")}</p>`,
      text: `Test-E-Mail von CyberSarah Revenue OS.\nE-Mail-Versand funktioniert!\nProvider: ${(await testEmailConfig()).provider}`,
      tags: { type: "test" },
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Test-E-Mail fehlgeschlagen");
    res.status(500).json({ error: "Test-E-Mail fehlgeschlagen" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SPRING 63: DSGVO INBOUND CLASSIFICATION & OPT-OUT
// ═══════════════════════════════════════════════════════════════════════════════

// ── POST /api/email/inbound — Eingehende Antworten verarbeiten ────────────────
// Webhook-Endpoint für Inbound-Forwarding (Resend/Mailgun/IMAP-Bridge).
// Erkennt Opt-out-Schlüsselwörter ("Stopp", "Unsubscribe", "Kein Interesse",
// "Austragen", ...) und fügt die E-Mail/Domain SOFORT ohne menschlichen
// Zwischenschritt zur Blacklist hinzu + bricht laufende Sequenzen ab.
router.post("/email/inbound", async (req, res) => {
  try {
    const body = req.body as {
      from?: string;
      fromEmail?: string;
      subject?: string;
      text?: string;
      messageId?: string;
    };

    const fromEmail = body.fromEmail ?? body.from ?? "";
    if (!fromEmail || !fromEmail.includes("@")) {
      res.status(400).json({ error: "fromEmail (gültige E-Mail) ist erforderlich" });
      return;
    }

    const ergebnis = await klassifiziereEingangsAntwort(
      fromEmail,
      body.text ?? "",
      body.subject ?? "",
      body.messageId,
    );

    res.json({
      empfangen: true,
      klassifiziert: ergebnis.istOptOut ? "opt_out" : "neutral",
      blacklisted: ergebnis.istOptOut,
      abgebrocheneSequenzen: ergebnis.betroffeneLeads,
    });
  } catch (err) {
    req.log.error({ err }, "Inbound-Classification fehlgeschlagen");
    res.status(500).json({ error: "Inbound-Classification fehlgeschlagen" });
  }
});

// ── GET /api/email/abmelden — Opt-out-Link aus dem Footer ─────────────────────
// Ziel des dynamischen Abmeldelinks. Trägt die E-Mail sofort in die
// Blacklist ein (ohne menschlichen Zwischenschritt) und bestätigt visuell.
router.get("/email/abmelden", async (req, res) => {
  try {
    const email = String(req.query.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      res.status(400).send("<h3>Ungültiger Abmeldelink.</h3>");
      return;
    }

    await fuegeZurBlacklistHinzu(email, "inbound_reply", "Opt-out über Abmeldelink (DSGVO)");

    res.send(`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Abmeldung bestätigt</title></head>
      <body style="font-family:system-ui;text-align:center;padding:60px 20px;color:#333">
        <h2>Abmeldung bestätigt ✅</h2>
        <p>Du wirst keine weiteren Outreach-E-Mails von CyberSarah erhalten.</p>
      </body></html>`);
  } catch (err) {
    req.log.error({ err }, "Abmeldung fehlgeschlagen");
    res.status(500).send("<h3>Abmeldung derzeit nicht möglich — bitte später erneut versuchen oder mit \"Stopp\" antworten.</h3>");
  }
});

// ── POST /api/email/blacklist — Manueller Blacklist-Eintrag (Admin) ───────────
router.post("/email/blacklist", async (req, res) => {
  try {
    const body = req.body as { email?: string; domain?: string; grund?: string };
    const wert = body.email ?? body.domain;
    if (!wert) {
      res.status(400).json({ error: "email oder domain erforderlich" });
      return;
    }
    await fuegeZurBlacklistHinzu(wert, "manuell", body.grund);
    res.json({ erfolgreich: true, wert: wert.toLowerCase() });
  } catch (err) {
    req.log.error({ err }, "Blacklist-Eintrag fehlgeschlagen");
    res.status(500).json({ error: "Blacklist-Eintrag fehlgeschlagen" });
  }
});

export default router;
