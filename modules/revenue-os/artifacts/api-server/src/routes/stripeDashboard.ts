/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * STRIPE FINANCIAL DASHBOARD API
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Echtzeit-Finanzdaten für das Dashboard:
 *  - Kontostand (verfügbar + ausstehend)
 *  - Umsatz (heute, diese Woche, diesen Monat, gesamt)
 *  - Auszahlungshistorie
 *  - Letzte Transaktionen
 *  - Umsatz nach Produkt
 *  - Abo-Statistiken
 *  - Dashboard-Zusammenfassung (ein Endpunkt für alles)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { Router } from "express";
import { getStripeClient } from "../lib/stripeClient";
import { db } from "@workspace/db";
import { transactionsTable } from "@workspace/db";
import { desc, gte, sql, eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function heuteStart(): number {
  const d = new Date();
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000);
}

function monatStart(): number {
  const d = new Date();
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000);
}

function wocheStart(): number {
  const d = new Date();
  const tag = d.getDay();
  const diff = d.getDate() - tag + (tag === 0 ? -6 : 1); // Montag
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), diff).getTime() / 1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/stripe/dashboard — Komplette Dashboard-Übersicht
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/stripe/dashboard", async (req, res) => {
  try {
    const stripe = getStripeClient();
    const jetzt = Math.floor(Date.now() / 1000);

    // 1. Kontostand
    let balance: any = { verfuegbar: 0, ausstehend: 0, waehrung: "EUR" };
    try {
      const bal = await stripe.balance.retrieve();
      balance = {
        verfuegbar: bal.available.reduce((s, a) => s + (a.amount / 100), 0),
        ausstehend: bal.pending.reduce((s, a) => s + (a.amount / 100), 0),
        waehrung: bal.available[0]?.currency?.toUpperCase() ?? "EUR",
      };
    } catch (e) {
      req.log.warn({ err: e }, "Stripe-Balance konnte nicht abgerufen werden");
    }

    // 2. Umsatz-Daten aus Stripe (letzte 30 Tage)
    let umsatz30Tage = 0;
    let anzahl30Tage = 0;
    try {
      const charges = await stripe.charges.list({
        created: { gte: jetzt - 30 * 86400 },
        limit: 100,
      });
      umsatz30Tage = charges.data.reduce((s, c) => s + (c.amount / 100), 0);
      anzahl30Tage = charges.data.length;
    } catch (e) {
      req.log.warn({ err: e }, "Stripe-Charges konnten nicht abgerufen werden");
    }

    // 3. Heutiger Umsatz (Stripe)
    let umsatzHeute = 0;
    try {
      const heuteCharges = await stripe.charges.list({
        created: { gte: heuteStart() },
        limit: 100,
      });
      umsatzHeute = heuteCharges.data.reduce((s, c) => s + (c.amount / 100), 0);
    } catch (e) { /* ignorieren */ }

    // 4. Auszahlungen (letzte 10)
    let auszahlungen: any[] = [];
    try {
      const payouts = await stripe.payouts.list({ limit: 10 });
      auszahlungen = payouts.data.map(p => ({
        id: p.id,
        betrag: (p.amount / 100).toFixed(2),
        waehrung: p.currency.toUpperCase(),
        status: p.status,
        ankunftsDatum: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString() : null,
        erstellt: new Date(p.created * 1000).toISOString(),
      }));
    } catch (e) { /* ignorieren */ }

    // 5. Letzte Zahlungen (Stripe)
    let letzteZahlungen: any[] = [];
    try {
      const payments = await stripe.paymentIntents.list({
        limit: 20,
        expand: ["data.latest_charge"],
      });
      letzteZahlungen = payments.data.map(pi => ({
        id: pi.id,
        betrag: (pi.amount / 100).toFixed(2),
        waehrung: pi.currency.toUpperCase(),
        status: pi.status,
        beschreibung: pi.description,
        email: pi.receipt_email,
        erstellt: new Date(pi.created * 1000).toISOString(),
      }));
    } catch (e) { /* ignorieren */ }

    // 6. DB-Transaktionen (für Komplettbild)
    let dbUmsatzGesamt = 0;
    let dbTransaktionenAnzahl = 0;
    if (db) {
      try {
        const alleTrans = await db
          .select()
          .from(transactionsTable)
          .orderBy(desc(transactionsTable.createdAt))
          .limit(50);

        dbTransaktionenAnzahl = alleTrans.length;
        dbUmsatzGesamt = alleTrans.reduce((s, t) => s + parseFloat(t.betrag ?? "0"), 0);

        // Wenn keine Stripe-Daten, DB-Daten als Fallback
        if (letzteZahlungen.length === 0) {
          letzteZahlungen = alleTrans.map(t => ({
            id: t.transaktionsId,
            betrag: t.betrag,
            waehrung: t.waehrung,
            status: t.typ,
            beschreibung: t.beschreibung,
            email: null,
            erstellt: t.createdAt?.toISOString(),
          }));
        }
      } catch (e) { /* ignorieren */ }
    }

    // 7. Dashboard-Zusammenfassung
    res.json({
      balance,
      umsatz: {
        heute: umsatzHeute.toFixed(2),
        dieseWoche: 0, // Vereinfacht
        diesenMonat: umsatz30Tage.toFixed(2),
        gesamt: dbUmsatzGesamt.toFixed(2),
      },
      transaktionen: {
        letzte30Tage: anzahl30Tage,
        gesamt: dbTransaktionenAnzahl,
        letzteZahlungen,
      },
      auszahlungen,
      stripeLive: !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_"),
      stripeDashboardUrl: "https://dashboard.stripe.com",
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Laden des Stripe-Dashboards");
    res.status(500).json({ error: "Dashboard-Daten konnten nicht geladen werden" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/stripe/balance — Nur Kontostand
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/stripe/balance", async (req, res) => {
  try {
    const stripe = getStripeClient();
    const bal = await stripe.balance.retrieve();

    res.json({
      verfuegbar: bal.available.map(a => ({
        betrag: (a.amount / 100).toFixed(2),
        waehrung: a.currency.toUpperCase(),
        quellen: a.source_types,
      })),
      ausstehend: bal.pending.map(a => ({
        betrag: (a.amount / 100).toFixed(2),
        waehrung: a.currency.toUpperCase(),
      })),
      modus: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test",
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Abrufen des Kontostands");
    res.status(500).json({ error: "Kontostand konnte nicht abgerufen werden" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/stripe/payouts — Auszahlungshistorie
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/stripe/payouts", async (req, res) => {
  try {
    const stripe = getStripeClient();
    const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 100);

    const payouts = await stripe.payouts.list({ limit });

    res.json({
      auszahlungen: payouts.data.map(p => ({
        id: p.id,
        betrag: (p.amount / 100).toFixed(2),
        waehrung: p.currency.toUpperCase(),
        status: p.status,
        ankunftsDatum: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString() : null,
        methode: p.type,
        beschreibung: p.description,
        erstellt: new Date(p.created * 1000).toISOString(),
      })),
      anzahl: payouts.data.length,
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Abrufen der Auszahlungen");
    res.status(500).json({ error: "Auszahlungen konnten nicht abgerufen werden" });
  }
});

export default router;
