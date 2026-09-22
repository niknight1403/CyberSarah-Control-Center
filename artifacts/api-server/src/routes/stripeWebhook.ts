/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * STRIPE WEBHOOK ROUTE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Production-ready Stripe Webhook-Endpunkt mit:
 * - Raw Body Parsing (VOR express.json!)
 * - Kryptographische Signatur-Verifikation
 * - Sofortige 200-Response (async Verarbeitung)
 * - Event-Deduplizierung (verhindert Doppelverarbeitung)
 * - Vollständiges Audit-Logging in webhook_events-Tabelle
 * - Modularer Event-Router mit Fallback
 * - Idempotente Transaktionsbuchung
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import express, { Router } from "express";
import Stripe from "stripe";
import { getStripeClient, getWebhookSecret } from "../lib/stripeClient";
import { WebhookHandlers } from "../lib/webhookHandlers";
import { logger } from "../lib/logger";

const router = Router();

// ─── IP-Adresse ermitteln (Proxy-aware für Docker/Kubernetes/Nginx) ────────────
function holeIpAdresse(req: any): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  if (Array.isArray(forwarded)) return forwarded[0]!;
  return req.socket?.remoteAddress ?? "unbekannt";
}

/**
 * POST /api/stripe/webhook
 *
 * KRITISCH: Muss mit express.raw() registriert werden, NICHT express.json()!
 * Die Signatur-Verifikation benötigt den unveränderten Roh-Body als Buffer.
 *
 * Stripe erwartet innerhalb von 30 Sekunden eine 200-Response.
 * Verarbeitung läuft daher asynchron im Hintergrund.
 */
router.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const startZeit = Date.now();
    const ip = holeIpAdresse(req);

    // ── 1. Schnelle Pre-Checks (vor Signatur-Verifikation) ────────────────
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      logger.warn({ ip }, "Stripe Webhook: Fehlende Signatur");
      res.status(400).json({
        error: "Bad Request",
        message: "Missing stripe-signature header",
      });
      return;
    }

    const webhookSecret = getWebhookSecret();
    if (!webhookSecret) {
      logger.error("Stripe Webhook: STRIPE_WEBHOOK_SECRET nicht konfiguriert");
      res.status(500).json({
        error: "Server Configuration Error",
        message: "Webhook secret not configured",
      });
      return;
    }

    // ── 2. Payload-Validierung ─────────────────────────────────────────────
    if (!Buffer.isBuffer(req.body)) {
      logger.error({ ip }, "Stripe Webhook: Body ist kein Buffer");
      res.status(400).json({
        error: "Bad Request",
        message: "Request body must be a raw buffer",
      });
      return;
    }

    // ── 3. Signatur-Verifikation ───────────────────────────────────────────
    const sig = Array.isArray(signature) ? signature[0]! : signature;
    let event: Stripe.Event;

    try {
      const stripe = getStripeClient();
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      const fehlerMsg = err instanceof Error ? err.message : "Unbekannter Fehler";
      logger.error(
        { ip, fehler: fehlerMsg },
        "🚨 Stripe Webhook: SIGNATUR UNGÜLTIG — möglicherweise gefälschte Anfrage"
      );

      // Audit-Log für ungültige Signaturen
      await WebhookHandlers.logInvalidSignature(
        sig.substring(0, 30) + "...",
        fehlerMsg,
        ip
      );

      res.status(400).json({
        error: "Bad Request",
        message: "Invalid webhook signature",
      });
      return;
    }

    // ── 4. SOFORT 200 senden (Stripe-Timeout vermeiden) ────────────────────
    // Die Verarbeitung läuft asynchron im Hintergrund.
    // Stripe retryt bei keinem 200 innerhalb von 30s.
    res.status(200).json({ received: true });

    const dauer = Date.now() - startZeit;
    logger.info(
      {
        eventType: event.type,
        eventId: event.id,
        ip,
        verarbeitungsStart: `${dauer}ms`,
      },
      `✅ Stripe Webhook 200 gesendet — Verarbeitung startet async`
    );

    // ── 5. ASYNCHROME VERARBEITUNG ────────────────────────────────────────
    // Hier passiert die eigentliche Logik. Fehler werden NICHT an Stripe
    // zurückgegeben (Response ist bereits gesendet).
    try {
      await WebhookHandlers.processEventAsync(event, ip);
    } catch (err) {
      logger.error(
        { eventType: event.type, eventId: event.id, err },
        "❌ Stripe Webhook: Async-Verarbeitung fehlgeschlagen"
      );
    }
  }
);

/**
 * GET /api/stripe/webhook/test
 *
 * Hilfs-Endpoint zum Testen der Stripe-Verbindung und Webhook-Konfiguration.
 * Zeigt an, ob alle notwendigen Umgebungsvariablen gesetzt sind.
 */
router.get("/stripe/webhook/test", (_req, res) => {
  let webhookSecret: string = "";
  try { webhookSecret = getWebhookSecret(); } catch { /* not configured */ }
  const secretKey = process.env.STRIPE_SECRET_KEY;

  const status = {
    stripeClientInitialisiert: !!secretKey,
    webhookSecretKonfiguriert: !!webhookSecret,
    webhookSecretLaenge: webhookSecret?.length ?? 0,
    webhooksEndpoint: "/api/stripe/webhook",
    testBefehl: "stripe listen --forward-to localhost:3000/api/stripe/webhook",
    empfohleneEvents: [
      "checkout.session.completed",
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "payment_method.attached",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "customer.subscription.trial_will_end",
      "invoice.paid",
      "invoice.payment_failed",
      "setup_intent.succeeded",
      "setup_intent.setup_failed",
      "charge.refunded",
      "charge.dispute.created",
      "radar.early_fraud_warning.created",
    ],
  };

  res.json(status);
});

export default router;
