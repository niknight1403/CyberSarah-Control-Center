/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * STRIPE ZAHLUNGEN API
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * REST-API für Zahlungsabwicklung:
 *  - Checkout-Session erstellen (einmalig + Abo)
 *  - Payment-Intent erstellen (für Custom-Zahlungsformulare)
 *  - Zahlungsstatus abfragen
 *  - Transaktionshistorie abrufen
 *  - Kassen-URLs generieren
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { Router } from "express";
import { getStripeClient } from "../lib/stripeClient";
import { db } from "@workspace/db";
import { transactionsTable, produkteTable } from "@workspace/db";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ─── Typen ───────────────────────────────────────────────────────────────────

interface CheckoutBody {
  produktId: string;     // Stripe Price ID (price_xxx) oder Product ID
  preisId?: string;      // Optionale spezifische Preis-ID
  menge?: number;
  erfolgUrl?: string;
  abbrechUrl?: string;
  kundenEmail?: string;
  metadaten?: Record<string, string>;
  aboModus?: boolean;    // true = Abo, false = einmalig
}

interface ZahlungsStatusBody {
  sessionId?: string;
  paymentIntentId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/stripe/checkout — Checkout-Session für Zahlung erstellen
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/stripe/checkout", async (req, res) => {
  try {
    const body = req.body as CheckoutBody;

    if (!body.produktId) {
      res.status(400).json({ error: "produktId (Price-ID oder Product-ID) ist erforderlich" });
      return;
    }

    const stripe = getStripeClient();
    const appUrl = process.env["APP_URL"] ?? "https://cybersarah.ai";

    // Ist die produktId eine Price-ID oder Product-ID?
    let priceId = body.preisId;
    if (!priceId) {
      if (body.produktId.startsWith("price_")) {
        priceId = body.produktId;
      } else {
        // Produkt-ID: Standardpreis abrufen
        const produkt = await stripe.products.retrieve(body.produktId, {
          expand: ["default_price"],
        });
        const defaultPrice = produkt.default_price as any;
        if (!defaultPrice?.id) {
          res.status(400).json({ error: "Kein aktiver Preis für dieses Produkt gefunden" });
          return;
        }
        priceId = defaultPrice.id;
      }
    }

    // Session erstellen
    const session = await stripe.checkout.sessions.create({
      mode: body.aboModus ? "subscription" : "payment",
      line_items: [{
        price: priceId,
        quantity: body.menge ?? 1,
      }],
      customer_email: body.kundenEmail,
      success_url: body.erfolgUrl ?? `${appUrl}/zahlung-erfolgreich?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: body.abbrechUrl ?? `${appUrl}/zahlung-abgebrochen`,
      metadata: {
        quelle: "cybersarah_api",
        ...body.metadaten,
      },
    });

    req.log.info(
      { sessionId: session.id, modus: body.aboModus ? "abo" : "einmalig" },
      "💰 Stripe Checkout-Session erstellt"
    );

    // In DB als anstehende Transaktion vormerken
    if (db) {
      try {
        await db.insert(transactionsTable).values({
          transaktionsId: `checkout_${session.id}`,
          quelle: "stripe_checkout",
          typ: body.aboModus ? "abo_anstehend" : "einmalig_anstehend",
          betrag: "0",
          waehrung: "EUR",
          beschreibung: `Checkout-Session: ${session.id}`,
          stripeEventId: session.id,
          metadaten: JSON.stringify({
            sessionId: session.id,
            priceId,
            mode: body.aboModus ? "subscription" : "payment",
          }),
        });
      } catch { /* nicht kritisch */ }
    }

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url,
      modus: body.aboModus ? "abo" : "einmalig",
    });
  } catch (err) {
    req.log.error({ err, body: req.body }, "Fehler beim Erstellen der Checkout-Session");
    res.status(500).json({ error: "Checkout-Session konnte nicht erstellt werden" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/stripe/payment-intent — Payment-Intent für Custom-Formulare
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/stripe/payment-intent", async (req, res) => {
  try {
    const body = req.body as {
      betrag: number;
      waehrung?: string;
      beschreibung?: string;
      metadaten?: Record<string, string>;
    };

    if (!body.betrag || body.betrag <= 0) {
      res.status(400).json({ error: "Betrag (>0) ist erforderlich" });
      return;
    }

    const stripe = getStripeClient();
    const betragInCent = Math.round(body.betrag * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: betragInCent,
      currency: body.waehrung ?? "eur",
      description: body.beschreibung ?? "CyberSarah Produkt",
      metadata: {
        quelle: "cybersarah_api",
        ...body.metadaten,
      },
      automatic_payment_methods: { enabled: true },
    });

    req.log.info(
      { paymentIntentId: paymentIntent.id, betrag: body.betrag },
      "💰 Stripe PaymentIntent erstellt"
    );

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      betrag: body.betrag,
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Erstellen des PaymentIntents");
    res.status(500).json({ error: "PaymentIntent konnte nicht erstellt werden" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/stripe/zahlungs-status — Status einer Zahlung prüfen
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/stripe/zahlungs-status", async (req, res) => {
  try {
    const body = req.body as ZahlungsStatusBody;
    const stripe = getStripeClient();

    let status: any = {};

    if (body.sessionId) {
      const session = await stripe.checkout.sessions.retrieve(body.sessionId);
      status = {
        id: session.id,
        typ: "checkout_session",
        modus: session.mode,
        status: session.status,
        zahlungStatus: session.payment_status,
        betrag: session.amount_total ? (session.amount_total / 100).toFixed(2) : null,
        waehrung: session.currency?.toUpperCase(),
        kundenEmail: session.customer_details?.email,
        zahlungIntentionId: session.payment_intent,
        aboId: session.subscription,
        abgeschlossen: session.status === "complete",
        zahlungErhalten: session.payment_status === "paid",
      };
    } else if (body.paymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(body.paymentIntentId);
      status = {
        id: pi.id,
        typ: "payment_intent",
        status: pi.status,
        betrag: (pi.amount / 100).toFixed(2),
        waehrung: pi.currency?.toUpperCase(),
        kundenEmail: pi.receipt_email,
        zahlungMethode: pi.payment_method_types?.join(", "),
        abgeschlossen: pi.status === "succeeded",
      };
    } else {
      res.status(400).json({ error: "sessionId oder paymentIntentId erforderlich" });
      return;
    }

    res.json({ success: true, status });
  } catch (err) {
    req.log.error({ err, body: req.body }, "Fehler beim Abfragen des Zahlungsstatus");
    res.status(500).json({ error: "Status konnte nicht abgerufen werden" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/stripe/transaktionen — Transaktionshistorie
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/stripe/transaktionen", async (req, res) => {
  try {
    if (!db) {
      res.json({ transaktionen: [], anzahl: 0 });
      return;
    }

    const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
    const von = req.query.von as string | undefined;
    const bis = req.query.bis as string | undefined;
    const typ = req.query.typ as string | undefined;

    let query = db
      .select()
      .from(transactionsTable)
      .orderBy(desc(transactionsTable.createdAt));

    if (typ) {
      query = query.where(eq(transactionsTable.typ, typ)) as any;
    }
    if (von) {
      const vonDatum = new Date(von);
      query = query.where(gte(transactionsTable.createdAt, vonDatum)) as any;
    }

    const transaktionen = await query.limit(limit);

    // Statistik
    const gesamt = transaktionen.reduce((sum, t) => sum + parseFloat(t.betrag ?? "0"), 0);
    const erfolgreich = transaktionen.filter(t => t.typ !== "fehlgeschlagen" && t.typ !== "storno");
    const gesamtErfolgreich = erfolgreich.reduce((sum, t) => sum + parseFloat(t.betrag ?? "0"), 0);

    // Nach Quelle gruppieren
    const nachQuelle: Record<string, number> = {};
    for (const t of transaktionen) {
      const q = t.quelle ?? "unbekannt";
      nachQuelle[q] = (nachQuelle[q] ?? 0) + parseFloat(t.betrag ?? "0");
    }

    res.json({
      transaktionen: transaktionen.map(t => ({
        id: t.id,
        transaktionsId: t.transaktionsId,
        quelle: t.quelle,
        typ: t.typ,
        betrag: t.betrag,
        waehrung: t.waehrung,
        beschreibung: t.beschreibung,
        createdAt: t.createdAt?.toISOString(),
      })),
      anzahl: transaktionen.length,
      statistik: {
        gesamtUmsatz: gesamt.toFixed(2),
        erfolgreicherUmsatz: gesamtErfolgreich.toFixed(2),
        anzahlTransaktionen: transaktionen.length,
        anzahlErfolgreich: erfolgreich.length,
      },
      aufteilung: nachQuelle,
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Laden der Transaktionen");
    res.status(500).json({ error: "Transaktionen konnten nicht geladen werden" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/stripe/checkout-links/:produktId — Direkten Payment-Link generieren
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/stripe/checkout-links/:produktId", async (req, res) => {
  try {
    const { produktId } = req.params;
    const stripe = getStripeClient();
    const appUrl = process.env["APP_URL"] ?? "https://cybersarah.ai";

    // Produkt mit Standardpreis abrufen
    const produkt = await stripe.products.retrieve(produktId, {
      expand: ["default_price"],
    });

    const defaultPrice = produkt.default_price as any;
    if (!defaultPrice?.id) {
      res.status(404).json({ error: "Kein aktiver Preis gefunden" });
      return;
    }

    // Prüfen ob bereits ein Payment-Link existiert
    let paymentLink: string | null = null;
    const bestehendeLinks = await stripe.paymentLinks.list({ limit: 10 });
    for (const link of bestehendeLinks.data) {
      const hatProdukt = link.line_items?.some(item => item.price === defaultPrice.id);
      if (hatProdukt) {
        paymentLink = link.url;
        break;
      }
    }

    // Neuen Link erstellen, falls keiner existiert
    if (!paymentLink) {
      const neuLink = await stripe.paymentLinks.create({
        line_items: [{ price: defaultPrice.id, quantity: 1 }],
        after_completion: {
          type: "redirect",
          redirect: { url: `${appUrl}/danke` },
        },
        metadata: { produktId, quelle: "api_direct_link" },
      });
      paymentLink = neuLink.url;
    }

    // Checkout-Session (einmalig, zum testen)
    const session = await stripe.checkout.sessions.create({
      mode: defaultPrice.recurring ? "subscription" : "payment",
      line_items: [{ price: defaultPrice.id, quantity: 1 }],
      success_url: `${appUrl}/zahlung-erfolgreich`,
      cancel_url: `${appUrl}/zahlung-abgebrochen`,
      metadata: { produktId, quelle: "api_direct_link" },
    });

    res.json({
      success: true,
      produkt: {
        id: produkt.id,
        name: produkt.name,
        preis: defaultPrice.unit_amount ? (defaultPrice.unit_amount / 100).toFixed(2) : null,
        waehrung: defaultPrice.currency?.toUpperCase(),
        intervall: defaultPrice.recurring?.interval ?? null,
      },
      paymentLink,
      checkoutUrl: session.url,
      stripeDashboardUrl: `https://dashboard.stripe.com/products/${produkt.id}`,
    });
  } catch (err) {
    req.log.error({ err, produktId: req.params.produktId }, "Fehler beim Generieren des Checkout-Links");
    res.status(500).json({ error: "Checkout-Link konnte nicht generiert werden" });
  }
});

export default router;
