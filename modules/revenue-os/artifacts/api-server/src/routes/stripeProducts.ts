/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * STRIPE PRODUKTE API
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Vollständige REST-API für Stripe-Produkte:
 *  - Liste alle Produkte (aus Stripe + lokaler DB synchronisiert)
 *  - Erstelle Produkt + Preis + Payment-Link in einem Aufruf
 *  - Aktualisiere Produkt-Metadaten
 *  - Deaktiviere/Archive Produkte
 *  - Erstelle Preis-Varianten (A/B-Testing)
 *  - Hole einzelnes Produkt mit vollständigen Stripe-Details
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { Router } from "express";
import { getStripeClient } from "../lib/stripeClient";
import { db } from "@workspace/db";
import { produkteTable, revenueOpportunitiesTable, transactionsTable, agentLogsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ─── Typen ───────────────────────────────────────────────────────────────────

interface ProduktErstellungBody {
  name: string;
  beschreibung?: string;
  preis: number;           // in EUR (z.B. 19.99)
  kategorie?: string;
  marke?: string;
  aboIntervall?: "month" | "year" | null; // null = einmalig
  aboIntervallCount?: number;
  bildUrl?: string;
  metadata?: Record<string, string>;
}

interface PreisBody {
  preis: number;
  aboIntervall?: "month" | "year" | null;
  aboIntervallCount?: number;
  metadaten?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/stripe/produkte — Alle Produkte (Stripe + lokale DB synchronisiert)
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/stripe/produkte", async (req, res) => {
  try {
    // 1. Alle Stripe-Produkte abrufen
    let stripeProdukte: any[] = [];
    try {
      const stripe = getStripeClient();
      const produkte = await stripe.products.list({
        active: true,
        limit: 100,
        expand: ["data.default_price"],
      });
      stripeProdukte = produkte.data;
    } catch (err) {
      req.log.warn({ err }, "Stripe-Produkte konnten nicht abgerufen werden");
    }

    // 2. Lokale DB-Produkte abrufen
    const lokaleProdukte = db
      ? await db.select().from(produkteTable).orderBy(desc(produkteTable.createdAt))
      : [];

    // 3. Synchronisieren: Stripe-Produkte mit lokalen Metadaten anreichern
    const lokaleMap = new Map(lokaleProdukte.map(p => [p.name, p]));

    // Stripe-Produkte + lokale kombinieren
    const kombiniert = stripeProdukte.map(sp => {
      const defaultPrice = sp.default_price as any;
      const lokal = lokaleMap.get(sp.name);

      return {
        id: sp.id,
        name: sp.name,
        beschreibung: sp.description,
        preis: defaultPrice?.unit_amount ? (defaultPrice.unit_amount / 100).toFixed(2) : null,
        waehrung: defaultPrice?.currency?.toUpperCase() ?? "EUR",
        aboIntervall: defaultPrice?.type === "recurring" ? defaultPrice.recurring?.interval : null,
        aktiv: sp.active,
        bild: sp.images?.[0] ?? null,
        metadaten: sp.metadata,
        lokaleDaten: lokal ? {
          id: lokal.id,
          kategorie: lokal.kategorie,
          stripePaymentLink: lokal.stripePaymentLink,
          verkauft: lokal.verkauft,
          verkaeufeAnzahl: lokal.verkaeufeAnzahl,
          createdAt: lokal.createdAt,
        } : null,
        erstelltAm: new Date(sp.created * 1000).toISOString(),
      };
    });

    // Nur lokale Produkte (falls Stripe nicht verfügbar)
    const nurLokale = stripeProdukte.length === 0
      ? lokaleProdukte.map(p => ({
          id: p.stripeProduktId ?? `local_${p.id}`,
          name: p.name,
          beschreibung: p.beschreibung,
          preis: p.preis,
          waehrung: "EUR",
          aboIntervall: null,
          aktiv: p.aktiv,
          bild: null,
          metadaten: {},
          lokaleDaten: {
            id: p.id,
            kategorie: p.kategorie,
            stripePaymentLink: p.stripePaymentLink,
            verkauft: p.verkauft,
            verkaeufeAnzahl: p.verkaeufeAnzahl,
            createdAt: p.createdAt,
          },
          erstelltAm: p.createdAt?.toISOString(),
        }))
      : [];

    const alleProdukte = kombiniert.length > 0 ? kombiniert : nurLokale;

    res.json({
      produkte: alleProdukte,
      anzahl: alleProdukte.length,
      stripeVerfuegbar: stripeProdukte.length > 0,
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Laden der Produkte");
    res.status(500).json({ error: "Fehler beim Laden der Produkte" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/stripe/produkte/:id — Einzelnes Produkt mit Details
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/stripe/produkte/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const stripe = getStripeClient();

    // Stripe-Produkt mit Preisen abrufen
    const produkt = await stripe.products.retrieve(id, {
      expand: ["default_price"],
    });

    // Alle Preise für dieses Produkt
    const preise = await stripe.prices.list({
      product: id,
      limit: 10,
      active: true,
    });

    // Transaktionshistorie aus DB
    let transaktionen: any[] = [];
    if (db) {
      transaktionen = await db
        .select()
        .from(transactionsTable)
        .where(sql`${transactionsTable.beschreibung} LIKE ${"%" + produkt.name + "%"}`)
        .orderBy(desc(transactionsTable.createdAt))
        .limit(20);
    }

    // Lokale DB-Daten
    let lokal = null;
    if (db) {
      const [found] = await db
        .select()
        .from(produkteTable)
        .where(eq(produkteTable.stripeProduktId, id))
        .limit(1);
      lokal = found;
    }

    const defaultPrice = produkt.default_price as any;

    res.json({
      stripe: {
        id: produkt.id,
        name: produkt.name,
        beschreibung: produkt.description,
        aktiv: produkt.active,
        bilder: produkt.images,
        metadaten: produkt.metadata,
        erstelltAm: new Date(produkt.created * 1000).toISOString(),
        aktuellerPreis: defaultPrice ? {
          id: defaultPrice.id,
          betrag: (defaultPrice.unit_amount / 100).toFixed(2),
          waehrung: defaultPrice.currency.toUpperCase(),
          intervall: defaultPrice.recurring?.interval ?? null,
        } : null,
      },
      allePreise: preise.data.map(p => ({
        id: p.id,
        betrag: (p.unit_amount! / 100).toFixed(2),
        waehrung: p.currency.toUpperCase(),
        intervall: p.recurring?.interval ?? null,
        aktiv: p.active,
      })),
      transaktionen: transaktionen.map(t => ({
        id: t.id,
        betrag: t.betrag,
        waehrung: t.waehrung,
        typ: t.typ,
        createdAt: t.createdAt,
      })),
      lokaleDaten: lokal ? {
        id: lokal.id,
        paymentLink: lokal.stripePaymentLink,
        verkauft: lokal.verkauft,
        kategorie: lokal.kategorie,
      } : null,
    });
  } catch (err) {
    req.log.error({ err, id: req.params.id }, "Fehler beim Laden des Produkts");
    res.status(500).json({ error: "Produkt nicht gefunden oder Stripe-Fehler" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/stripe/produkte — Neues Produkt + Preis + Payment-Link erstellen
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/stripe/produkte", async (req, res) => {
  try {
    const body = req.body as ProduktErstellungBody;

    if (!body.name || !body.preis || body.preis <= 0) {
      res.status(400).json({ error: "Name und Preis (>0) sind erforderlich" });
      return;
    }

    const stripe = getStripeClient();

    // 1. Produkt in Stripe erstellen
    const produkt = await stripe.products.create({
      name: body.name,
      description: body.beschreibung ?? "",
      metadata: {
        quelle: "api",
        kategorie: body.kategorie ?? "allgemein",
        marke: body.marke ?? "CyberSarah",
        system: "CyberSarah-OS",
        ...body.metadata,
      },
    });

    // 2. Preis erstellen
    const preisInCent = Math.round(body.preis * 100);
    const preisParam: any = {
      product: produkt.id,
      unit_amount: preisInCent,
      currency: "eur",
      metadata: { produktApi: "true" },
    };

    if (body.aboIntervall) {
      preisParam.recurring = {
        interval: body.aboIntervall,
        interval_count: body.aboIntervallCount ?? 1,
      };
    }

    const preis = await stripe.prices.create(preisParam);

    // 3. Als Standardpreis setzen
    await stripe.products.update(produkt.id, { default_price: preis.id });

    // 4. Payment-Link erstellen (für einmalige Zahlungen)
    let paymentLink: string | null = null;
    if (!body.aboIntervall) {
      const link = await stripe.paymentLinks.create({
        line_items: [{ price: preis.id, quantity: 1 }],
        after_completion: {
          type: "redirect",
          redirect: { url: "https://cybersarah.de/danke" },
        },
        metadata: {
          produktId: produkt.id,
          quelle: "api",
          system: "CyberSarah-OS",
        },
      });
      paymentLink = link.url;
    }

    // 5. In lokaler DB speichern
    if (db) {
      try {
        const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        await db.insert(produkteTable).values({
          name: body.name,
          beschreibung: body.beschreibung ?? "",
          preis: body.preis.toFixed(2),
          kategorie: body.kategorie ?? "allgemein",
          slug: `${slug}-${Date.now()}`,
          stripeProduktId: produkt.id,
          stripePreisId: preis.id,
          stripePaymentLink: paymentLink,
          aktiv: true,
          quelle: "stripe_api",
        });

        // Auch als Revenue-Opportunity
        await db.insert(revenueOpportunitiesTable).values({
          titel: body.name.slice(0, 200),
          beschreibung: (body.beschreibung ?? "").slice(0, 500),
          kanal: body.aboIntervall ? "abo" : "eigenes_produkt",
          marke: body.marke ?? "CyberSarah",
          status: "aktiv",
          stripePaymentLink: paymentLink,
          geschaetzterMonatsumsatz: String(body.preis * 30),
          gefundenVon: "stripe_api",
        });
      } catch (dbErr) {
        req.log.warn({ err: dbErr }, "DB-Speicherung des Stripe-Produkts fehlgeschlagen");
      }
    }

    req.log.info({ name: body.name, preis: body.preis, id: produkt.id }, "✅ Stripe-Produkt erstellt");

    res.status(201).json({
      success: true,
      produkt: {
        id: produkt.id,
        name: produkt.name,
        preis: body.preis,
        waehrung: "EUR",
        paymentLink,
        aboIntervall: body.aboIntervall,
      },
      stripeDashboard: `https://dashboard.stripe.com/products/${produkt.id}`,
    });
  } catch (err) {
    req.log.error({ err, body: req.body }, "Fehler beim Erstellen des Stripe-Produkts");
    res.status(500).json({ error: "Produkt-Erstellung fehlgeschlagen" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/stripe/produkte/:id — Produkt aktualisieren
// ═══════════════════════════════════════════════════════════════════════════════

router.patch("/stripe/produkte/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const stripe = getStripeClient();
    const body = req.body as {
      name?: string;
      beschreibung?: string;
      aktiv?: boolean;
      bildUrl?: string;
      metadaten?: Record<string, string>;
    };

    const updateData: any = {};
    if (body.name) updateData.name = body.name;
    if (body.beschreibung !== undefined) updateData.description = body.beschreibung;
    if (body.aktiv !== undefined) updateData.active = body.aktiv;
    if (body.bildUrl) updateData.images = [body.bildUrl];
    if (body.metadaten) updateData.metadata = body.metadaten;

    const updated = await stripe.products.update(id, updateData);

    // Auch in lokaler DB aktualisieren
    if (db && body.name) {
      await db.update(produkteTable)
        .set({
          name: body.name,
          beschreibung: body.beschreibung,
          aktiv: body.aktiv,
          updatedAt: new Date(),
        })
        .where(eq(produkteTable.stripeProduktId, id));
    }

    res.json({
      success: true,
      produkt: {
        id: updated.id,
        name: updated.name,
        aktiv: updated.active,
      },
    });
  } catch (err) {
    req.log.error({ err, id: req.params.id }, "Fehler beim Aktualisieren des Produkts");
    res.status(500).json({ error: "Update fehlgeschlagen" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/stripe/produkte/:id/preise — Neuen Preis (Variante) hinzufügen
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/stripe/produkte/:id/preise", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as PreisBody;

    if (!body.preis || body.preis <= 0) {
      res.status(400).json({ error: "Preis (>0) ist erforderlich" });
      return;
    }

    const stripe = getStripeClient();

    const preisInCent = Math.round(body.preis * 100);
    const preisParam: any = {
      product: id,
      unit_amount: preisInCent,
      currency: "eur",
      metadata: { ...body.metadaten, variante: "true" },
    };

    if (body.aboIntervall) {
      preisParam.recurring = {
        interval: body.aboIntervall,
        interval_count: body.aboIntervallCount ?? 1,
      };
    }

    const preis = await stripe.prices.create(preisParam);

    res.status(201).json({
      success: true,
      preis: {
        id: preis.id,
        betrag: body.preis,
        waehrung: "EUR",
        intervall: body.aboIntervall,
      },
    });
  } catch (err) {
    req.log.error({ err, id: req.params.id }, "Fehler beim Erstellen des Preises");
    res.status(500).json({ error: "Preis-Erstellung fehlgeschlagen" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/stripe/produkte/:id — Produkt deaktivieren (archivieren)
// ═══════════════════════════════════════════════════════════════════════════════

router.delete("/stripe/produkte/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const stripe = getStripeClient();

    // Stripe hat kein DELETE — wir archivieren (deaktivieren)
    await stripe.products.update(id, { active: false });

    // In lokaler DB als inaktiv markieren
    if (db) {
      await db.update(produkteTable)
        .set({ aktiv: false, pausiertAm: new Date(), updatedAt: new Date() })
        .where(eq(produkteTable.stripeProduktId, id));
    }

    res.json({ success: true, message: "Produkt deaktiviert" });
  } catch (err) {
    req.log.error({ err, id: req.params.id }, "Fehler beim Deaktivieren des Produkts");
    res.status(500).json({ error: "Deaktivierung fehlgeschlagen" });
  }
});

export default router;
