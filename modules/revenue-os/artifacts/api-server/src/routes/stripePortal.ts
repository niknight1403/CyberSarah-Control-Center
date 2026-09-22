/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * STRIPE CUSTOMER PORTAL API
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Verwaltung von Kunden, Abonnements und Abrechnungsinformationen:
 *  - Kunden erstellen/suchen
 *  - Abonnements auflisten
 *  - Abo kündigen/pausieren/reaktivieren
 *  - Portal-Session-Link generieren (Kunde verwaltet selbst)
 *  - Zahlungsmethoden verwalten
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { Router } from "express";
import { getStripeClient } from "../lib/stripeClient";
import { db } from "@workspace/db";
import { transactionsTable, agentLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/stripe/customer — Kunden in Stripe anlegen/suchen
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/stripe/customer", async (req, res) => {
  try {
    const body = req.body as {
      email: string;
      name?: string;
      beschreibung?: string;
      metadaten?: Record<string, string>;
    };

    if (!body.email) {
      res.status(400).json({ error: "E-Mail ist erforderlich" });
      return;
    }

    const stripe = getStripeClient();

    // Existierenden Kunden suchen
    const existing = await stripe.customers.list({
      email: body.email,
      limit: 1,
    });

    let customer: any;
    if (existing.data.length > 0) {
      customer = existing.data[0];
      // Metadaten aktualisieren
      if (body.name || body.metadaten) {
        customer = await stripe.customers.update(customer.id, {
          name: body.name ?? customer.name,
          metadata: { ...customer.metadata, ...body.metadaten },
        });
      }
    } else {
      customer = await stripe.customers.create({
        email: body.email,
        name: body.name,
        description: body.beschreibung,
        metadata: {
          quelle: "cybersarah_api",
          ...body.metadaten,
        },
      });
    }

    res.json({
      success: true,
      kunde: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        erstellt: new Date(customer.created * 1000).toISOString(),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Erstellen/Suchen des Kunden");
    res.status(500).json({ error: "Kunden-Operation fehlgeschlagen" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/stripe/abos — Alle Abonnements abrufen
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/stripe/abos", async (req, res) => {
  try {
    const stripe = getStripeClient();
    const status = (req.query.status as string) ?? "all";

    const params: any = { limit: 50, expand: ["data.customer", "data.plan.product"] };
    if (status !== "all") {
      params.status = status;
    }

    const subscriptions = await stripe.subscriptions.list(params);

    res.json({
      abos: subscriptions.data.map(sub => ({
        id: sub.id,
        kunde: {
          id: sub.customer?.id,
          email: (sub.customer as any)?.email,
          name: (sub.customer as any)?.name,
        },
        status: sub.status,
        produkt: (sub.items.data[0]?.plan?.product as any)?.name ?? "Unbekannt",
        betrag: sub.items.data.reduce((s, item) => s + (item.price?.unit_amount ?? 0), 0) / 100,
        waehrung: sub.currency?.toUpperCase(),
        intervall: sub.items.data[0]?.price?.recurring?.interval,
        aktuellerZyklusStart: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
        aktuellerZyklusEnde: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        probeAb: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
        probeBis: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        abgeschlossen: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : null,
        zahlungsMethode: sub.default_payment_method ?? sub.collection_method,
        verlassenAm: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
        gekuendigt: sub.cancel_at_period_end,
        erstellt: new Date(sub.created * 1000).toISOString(),
      })),
      anzahl: subscriptions.data.length,
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Abrufen der Abonnements");
    res.status(500).json({ error: "Abonnements konnten nicht abgerufen werden" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/stripe/abos/:id/kuendigen — Abo kündigen
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/stripe/abos/:id/kuendigen", async (req, res) => {
  try {
    const { id } = req.params;
    const stripe = getStripeClient();

    const body = req.body as {
      sofort?: boolean;
    };

    if (body.sofort) {
      // Sofort kündigen
      const cancelled = await stripe.subscriptions.cancel(id);
      res.json({
        success: true,
        message: "Abo sofort gekündigt",
        abo: {
          id: cancelled.id,
          status: cancelled.status,
          endDatum: new Date(cancelled.ended_at! * 1000).toISOString(),
        },
      });
    } else {
      // Am Ende des Zyklus kündigen
      const updated = await stripe.subscriptions.update(id, {
        cancel_at_period_end: true,
      });
      res.json({
        success: true,
        message: "Abo wird am Ende des aktuellen Zyklus gekündigt",
        abo: {
          id: updated.id,
          status: updated.status,
          endDatum: new Date(updated.current_period_end * 1000).toISOString(),
        },
      });
    }
  } catch (err) {
    req.log.error({ err, id: req.params.id }, "Fehler beim Kündigen des Abos");
    res.status(500).json({ error: "Kündigung fehlgeschlagen" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/stripe/abos/:id/reaktivieren — Abo reaktivieren (vor Zyklusende)
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/stripe/abos/:id/reaktivieren", async (req, res) => {
  try {
    const { id } = req.params;
    const stripe = getStripeClient();

    const updated = await stripe.subscriptions.update(id, {
      cancel_at_period_end: false,
    });

    res.json({
      success: true,
      message: "Abo reaktiviert",
      abo: {
        id: updated.id,
        status: updated.status,
      },
    });
  } catch (err) {
    req.log.error({ err, id: req.params.id }, "Fehler beim Reaktivieren des Abos");
    res.status(500).json({ error: "Reaktivierung fehlgeschlagen" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/stripe/portal — Kunden-Portal-Link generieren
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/stripe/portal", async (req, res) => {
  try {
    const body = req.body as { kundeId: string; returnUrl?: string };

    if (!body.kundeId) {
      res.status(400).json({ error: "kundeId ist erforderlich" });
      return;
    }

    const stripe = getStripeClient();
    const appUrl = process.env["APP_URL"] ?? "https://cybersarah.ai";

    const session = await stripe.billingPortal.sessions.create({
      customer: body.kundeId,
      return_url: body.returnUrl ?? `${appUrl}/einstellungen`,
    });

    res.json({
      success: true,
      url: session.url,
      kundeId: body.kundeId,
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Erstellen des Portal-Links");
    res.status(500).json({ error: "Portal-Link konnte nicht erstellt werden" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/stripe/kunden/:id — Kundendetails abrufen
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/stripe/kunden/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const stripe = getStripeClient();

    const customer = await stripe.customers.retrieve(id, {
      expand: ["subscriptions", "default_source"],
    });

    if (customer.deleted) {
      res.status(404).json({ error: "Kunde wurde gelöscht" });
      return;
    }

    // Zahlungsmethoden abrufen
    const paymentMethods = await stripe.paymentMethods.list({
      customer: id,
      type: "card",
    });

    // Letzte Rechnungen
    const invoices = await stripe.invoices.list({
      customer: id,
      limit: 10,
    });

    res.json({
      kunde: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        telefon: customer.phone,
        erstellt: new Date(customer.created * 1000).toISOString(),
      },
      zahlungsMethoden: paymentMethods.data.map(pm => ({
        id: pm.id,
        marke: (pm as any).card?.brand,
        letzte4: (pm as any).card?.last4,
        ablauf: (pm as any).card?.exp_month
          ? `${(pm as any).card.exp_month}/${(pm as any).card.exp_year}`
          : null,
      })),
      letzteRechnungen: invoices.data.map(inv => ({
        id: inv.id,
        betrag: (inv.amount_paid / 100).toFixed(2),
        status: inv.status,
        zahlungsversuch: new Date(inv.created * 1000).toISOString(),
        zahlungsLink: inv.hosted_invoice_url,
        pdfUrl: inv.invoice_pdf,
      })),
      subCount: (customer.subscriptions as any)?.data?.length ?? 0,
    });
  } catch (err) {
    req.log.error({ err, id: req.params.id }, "Fehler beim Abrufen des Kunden");
    res.status(500).json({ error: "Kunde konnte nicht abgerufen werden" });
  }
});

export default router;
