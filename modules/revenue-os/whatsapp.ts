/**
 * /api/whatsapp — WhatsApp Business Agent Routen
 */
import { Router } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@workspace/db";
import { systemConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  holeWhatsAppStatus,
  sendeTaeglichenTipp,
  ladeEmpfaengerliste,
  fuegeEmpfaengerHinzu,
  verarbeiteWhatsAppWebhook,
  generiereTaeglichenTipp,
} from "../agents/whatsappAgent";

const router = Router();

// Status
router.get("/whatsapp/status", async (_req, res) => {
  const status = await holeWhatsAppStatus();
  res.json(status);
});

// Heutigen Tipp generieren (Vorschau)
router.get("/whatsapp/tipp-vorschau", async (_req, res) => {
  const tipp = await generiereTaeglichenTipp();
  res.json({ tipp });
});

// Tipp jetzt senden
router.post("/whatsapp/tipp-senden", async (_req, res) => {
  const empfaenger = await ladeEmpfaengerliste();
  if (empfaenger.length === 0) {
    res.json({ gesendet: 0, nachricht: "Keine Empfänger in der Broadcast-Liste. Telefonnummern unter /whatsapp/empfaenger eintragen." });
    return;
  }
  const result = await sendeTaeglichenTipp(empfaenger);
  res.json({ ...result, nachricht: `${result.gesendet} Nachrichten gesendet` });
});

// Empfänger verwalten
router.get("/whatsapp/empfaenger", async (_req, res) => {
  const empfaenger = await ladeEmpfaengerliste();
  res.json({ empfaenger, anzahl: empfaenger.length });
});

router.post("/whatsapp/empfaenger", async (req, res) => {
  const { telefon } = req.body as { telefon: string };
  if (!telefon) { res.status(400).json({ error: "Telefonnummer fehlt (Format: 4917612345678)" }); return; }
  await fuegeEmpfaengerHinzu(telefon.replace(/[^0-9]/g, ""));
  const empfaenger = await ladeEmpfaengerliste();
  res.json({ erfolg: true, empfaenger });
});

// Meta Webhook Verifikation (GET) — Meta schickt bei Einrichtung eine Verifikationsanfrage
router.get("/whatsapp/webhook", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const [row] = await db.select({ wert: systemConfigTable.wert })
    .from(systemConfigTable).where(eq(systemConfigTable.schluessel, "whatsapp_webhook_secret"));
  const expectedToken = row?.wert ?? process.env["WHATSAPP_WEBHOOK_SECRET"] ?? "cybersarah_webhook";

  if (mode === "subscribe" && token === expectedToken) {
    logger.info("WhatsApp Webhook verifiziert");
    res.status(200).send(challenge);
  } else {
    res.status(403).json({ error: "Verifikation fehlgeschlagen" });
  }
});

// Meta Webhook Events (POST) — eingehende Nachrichten
// WICHTIG: Muss vor express.json() registriert werden (raw body)
router.post("/whatsapp/webhook", async (req, res) => {
  res.status(200).send("OK"); // Meta erwartet sofortige 200-Antwort
  // Async verarbeiten ohne den Response zu blockieren
  void verarbeiteWhatsAppWebhook(req.body);
});

export default router;
