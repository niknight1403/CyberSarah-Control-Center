/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SUBSCRIPTION & RECURRING REVENUE AGENT (Sprint 6.1)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Vollautomatisiertes Abo-Management:
 *  - Abo-Pläne verwalten (monatlich/jährlich/wöchentlich)
 *  - Stripe Subscriptions synchronisieren
 *  - Wiederkehrende Zahlungen überwachen
 *  - Dunning (fehlgeschlagene Zahlungen + Erinnerungen)
 *  - Abo-Kündigungen verarbeiten + Gründe erfassen
 *  - Revenue-Forecast für wiederkehrende Einnahmen
 *  - Automatische Stufen-Upgrades bei Umsatz
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { db } from "@workspace/db";
import {
  subscriptionPlansTable, customerSubscriptionsTable,
  subscriptionInvoicesTable, dunningEmailsTable, agentLogsTable
} from "@workspace/db";
import { eq, desc, gte, and, sql, lt, lte, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/emailClient";

const STANDARD_PLANS = [
  { name: "Lite", beschreibung: "Einstieg in autonome Umsatzgenerierung — eine KI-Persönlichkeit, alle Basis-Werkzeuge", preis: "29", intervall: "month", trialTage: 7, features: ["1 KI-Persönlichkeit (CyberSarah)", "500.000 LLM-Tokens/Monat (kostenlose Router-Priorität)", "100 Leads/Monat", "Basis-Dashboard & Health-Check", "E-Mail-Support"], populär: false, reihenfolge: 1 },
  { name: "Standard", beschreibung: "Für ernsthafte Selbstständige — 3 KI-Persönlichkeiten und alle Social-Connectoren", preis: "79", intervall: "month", trialTage: 7, features: ["3 KI-Persönlichkeiten", "2 Mio. LLM-Tokens/Monat", "1.000 Leads/Monat", "Alle Social-Connectoren (Bluesky, Threads, Telegram, X, LinkedIn)", "Autonomer Content-Recycling", "Affiliate-Engine", "Prioritäts-Support"], highlightFeatures: ["Alle Social-Connectoren", "Autonomer Content-Recycling"], populär: true, reihenfolge: 2 },
  { name: "Pro", beschreibung: "Vollautonomes Revenue-OS — kompletter Schwarm, API-Zugang und MCP-Integration", preis: "199", intervall: "month", trialTage: 7, features: ["Alle 4 KI-Persönlichkeiten (kompletter Schwarm)", "10 Mio. LLM-Tokens/Monat", "10.000 Leads/Monat", "API-Zugang & Webhooks", "MCP-Integration & eigene Skills", "Kostenloser LLM-Routing-Changer (Groq, Gemini, OpenRouter, Ollama)", "Autonomer API-Key-Rotierer", "Live-Problem-Löser-Agent", "Stripe-Abos & Digistore24"], highlightFeatures: ["API-Zugang & MCP", "Live-Problem-Löser"], populär: false, reihenfolge: 3 },
  { name: "Elite", beschreibung: "Agentur- und Enterprise-Layer — White-Label, SLA und unbegrenzte Skalierung", preis: "499", intervall: "month", trialTage: 14, features: ["Unbegrenzte KI-Persönlichkeiten & Tenants", "50 Mio. LLM-Tokens/Monat", "Unbegrenzte Leads", "White-Label & Multi-Tenant-Verwaltung", "Dedizierter Account-Manager", "99,9 %-SLA-Garantie", "Individuelle Integrationen", "24/7-Support mit Telefon-Eskalation"], highlightFeatures: ["White-Label", "99,9 %-SLA"], populär: false, reihenfolge: 4 },
  { name: "Jahres-Pro", beschreibung: "Pro im Jahresabo — 2 Monate gratis", preis: "1990", intervall: "year", trialTage: 7, features: ["Wie Pro", "2 Monate gratis gespart!"], highlightFeatures: ["2 Monate gratis!"], populär: false, reihenfolge: 5 },
];

export class SubscriptionAgent extends AgentBase {
  constructor() {
    super("Subscription & Revenue Agent", "subscription");
  }

  protected beschreibungText(): string {
    return "AUTONOM: Verwalte Abo-Pläne, wiederkehrende Zahlungen via Stripe, Dunning bei fehlgeschlagenen Zahlungen, Revenue-Forecasts";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const aktion = String(aufgabe.payload?.["aktion"] ?? "full_check");

    switch (aktion) {
      case "init_plans":
        return this.initialisierePlan();
      case "sync_subs":
        return this.synchronisiereSubscriptions();
      case "dunning":
        return this.verarbeiteDunning();
      case "forecast":
        return this.berechneForecast();
      case "stats":
        return this.holeStats();
      default:
        return this.fuehreVollCheckAus();
    }
  }

  private async fuehreVollCheckAus(): Promise<AufgabeErgebnis> {
    const plansResult = await this.initialisierePlan();
    const syncResult = await this.synchronisiereSubscriptions();
    const dunningResult = await this.verarbeiteDunning();

    return {
      success: true,
      message: `Abo-Check: ${plansResult.metadaten?.plans ?? 0} Pläne | ${syncResult.metadaten?.subs ?? 0} Subs | ${dunningResult.metadaten?.dunningEmails ?? 0} Dunning`,
      metadaten: { plans: plansResult.metadaten, sync: syncResult.metadaten, dunning: dunningResult.metadaten },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PLÄNE INITIALISIEREN + MIT STRIPE SYNCEN
  // ═════════════════════════════════════════════════════════════════════════════
  private async initialisierePlan(): Promise<AufgabeErgebnis> {
    const [existing] = await db.select({ id: subscriptionPlansTable.id }).from(subscriptionPlansTable).limit(1);
    let plansErstellt = 0;

    // Standard-Pläne anlegen falls nicht vorhanden
    for (const plan of STANDARD_PLANS) {
      const [existing] = await db.select({ id: subscriptionPlansTable.id })
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.name, plan.name))
        .limit(1);

      if (existing) continue;

      // Stripe-Produkt + Preis erstellen
      let stripePreisId = null;
      let stripeProduktId = null;
      try {
        const { getStripeClient } = await import("../lib/stripeClient");
        const stripe = getStripeClient();
        if (stripe) {
          const produkt = await stripe.products.create({
            name: plan.name,
            description: plan.beschreibung,
            metadata: { quelle: "subscription_agent", system: "cybersarah" },
          });
          stripeProduktId = produkt.id;

          const preis = await stripe.prices.create({
            product: produkt.id,
            unit_amount: Math.round(parseFloat(plan.preis) * 100),
            currency: "eur",
            recurring: { interval: plan.intervall as "month" | "year" },
          });
          stripePreisId = preis.id;
        }
      } catch (err) {
        logger.warn({ err, plan: plan.name }, "Stripe-Produkterstellung fehlgeschlagen");
      }

      await db.insert(subscriptionPlansTable).values({
        name: plan.name,
        beschreibung: plan.beschreibung,
        preis: plan.preis,
        intervall: plan.intervall,
        trialTage: plan.trialTage,
        stripePreisId,
        stripeProduktId,
        features: JSON.stringify(plan.features),
        highlightFeatures: JSON.stringify(plan.highlightFeatures ?? []),
        populär: plan.populär ?? false,
        reihenfolge: plan.reihenfolge,
      });

      plansErstellt++;
    }

    return {
      success: true,
      message: `${plansErstellt} Abo-Pläne initialisiert`,
      metadaten: { plans: plansErstellt, total: STANDARD_PLANS.length },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTIONS MIT STRIPE SYNCHRONISIEREN
  // ═════════════════════════════════════════════════════════════════════════════
  private async synchronisiereSubscriptions(): Promise<AufgabeErgebnis> {
    try {
      const { getStripeClient } = await import("../lib/stripeClient");
      const stripe = getStripeClient();
      if (!stripe) return { success: false, message: "Kein Stripe-Client" };

      const vor24h = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

      // Aktive Subscriptions von Stripe abrufen
      const subs = await stripe.subscriptions.list({
        limit: 50,
        status: "all",
        created: { gte: vor24h },
        expand: ["data.latest_invoice", "data.customer"],
      });

      let neu = 0;
      let aktualisiert = 0;

      for (const sub of subs.data) {
        const stripeSub = sub as any;
        const customerEmail = stripeSub.customer?.email ?? stripeSub.metadata?.email ?? "unbekannt@cybersarah.de";

        // Plan in DB finden
        const items = stripeSub.items.data;
        const stripePreisId = items[0]?.price?.id;
        const [plan] = await db
          .select({ id: subscriptionPlansTable.id })
          .from(subscriptionPlansTable)
          .where(eq(subscriptionPlansTable.stripePreisId, stripePreisId))
          .limit(1);

        if (!plan) continue;

        // Bestehende Subscription finden
        const [existing] = await db
          .select({ id: customerSubscriptionsTable.id })
          .from(customerSubscriptionsTable)
          .where(eq(customerSubscriptionsTable.stripeSubscriptionId, sub.id))
          .limit(1);

        const status = stripeSub.status === "active" ? "aktiv"
          : stripeSub.status === "past_due" ? "fehlgeschlagen"
          : stripeSub.status === "canceled" ? "gekuendigt"
          : stripeSub.status === "incomplete" ? "ausstehend"
          : stripeSub.status === "trialing" ? "aktiv"
          : "gekuendigt";

        const periodStart = stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : null;
        const periodEnd = stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : null;
        const trialEnd = stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null;

        // Rechnungsdaten
        const invoice = stripeSub.latest_invoice as any;
        const invoiceBetrag = invoice?.amount_due ? (invoice.amount_due / 100) : null;
        const invoiceStatus = invoice?.status ?? null;

        if (existing) {
          await db.update(customerSubscriptionsTable)
            .set({
              status: status as any,
              aktuellerPeriodStart: periodStart,
              aktuellerPeriodEnde: periodEnd,
              trialEnde: trialEnd,
              letzteRechnung: invoice?.status_transitioned_at ? new Date(invoice.status_transitioned_at * 1000) : new Date(),
              updatedAt: new Date(),
            })
            .where(eq(customerSubscriptionsTable.id, existing.id));
          aktualisiert++;
        } else {
          // Stripe-Customer-ID extrahieren
          const stripeCustomerId = typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id;

          const [neuSub] = await db.insert(customerSubscriptionsTable).values({
            planId: plan.id,
            kundenEmail: customerEmail,
            kundenName: stripeSub.customer?.name ?? null,
            stripeSubscriptionId: stripeSub.id,
            stripeCustomerId,
            status: status as any,
            aktuellerPeriodStart: periodStart,
            aktuellerPeriodEnde: periodEnd,
            trialEnde: trialEnd,
          }).returning();

          if (neuSub && invoiceBetrag) {
            await db.insert(subscriptionInvoicesTable).values({
              subscriptionId: neuSub.id,
              stripeInvoiceId: invoice?.id ?? `inv_${stripeSub.id}`,
              stripeRechnungUrl: invoice?.hosted_invoice_url ?? null,
              betrag: String(invoiceBetrag),
              status: invoiceStatus === "paid" ? "bezahlt" : "offen",
              bezahltAm: invoiceStatus === "paid" ? new Date() : null,
            });
          }
          neu++;
        }
      }

      return {
        success: true,
        message: `${neu} neue, ${aktualisiert} aktualisierte Abos von Stripe synchronisiert`,
        metadaten: { neu, aktualisiert, gesamt: subs.data.length },
      };
    } catch (err) {
      logger.error({ err }, "Stripe-Subscription-Sync fehlgeschlagen");
      return { success: false, message: `Fehler: ${(err as Error).message}` };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // DUNNING: Fehlgeschlagene Zahlungen erkennen + Erinnerungen
  // ═════════════════════════════════════════════════════════════════════════════
  private async verarbeiteDunning(): Promise<AufgabeErgebnis> {
    // Subscriptions mit fehlgeschlagenen Zahlungen finden
    const problemSubs = await db
      .select()
      .from(customerSubscriptionsTable)
      .where(
        or(
          eq(customerSubscriptionsTable.status, "fehlgeschlagen"),
          and(
            eq(customerSubscriptionsTable.status, "aktiv"),
            lt(customerSubscriptionsTable.aktuellerPeriodEnde, new Date()),
          ),
        ),
      )
      .limit(30);

    let dunningEmails = 0;
    let gekuendigt = 0;

    for (const sub of problemSubs) {
      // Prüfen ob bereits eine Dunning-Email gesendet wurde
      const [existing] = await db
        .select({ id: dunningEmailsTable.id })
        .from(dunningEmailsTable)
        .where(
          and(
            eq(dunningEmailsTable.ereignisTyp, "zahlung_fehlgeschlagen"),
            eq(dunningEmailsTable.email, sub.kundenEmail),
          ),
        )
        .limit(1);

      if (existing) continue;

      // Dunning-Email senden
      try {
        const plan = await db.select({ name: subscriptionPlansTable.name }).from(subscriptionPlansTable)
          .where(eq(subscriptionPlansTable.id, sub.planId)).limit(1).then(r => r[0]);

        await sendEmail({
          to: sub.kundenEmail,
          subject: "⚠️ Zahlung fehlgeschlagen — Dein Abo läuft bald ab",
          text: `Hallo${sub.kundenName ? " " + sub.kundenName : ""},

leider konnte die letzte Zahlung für dein Abo "${plan?.name ?? "Unbekannt"}" nicht verarbeitet werden.

Mögliche Gründe:
- Deine Zahlungsmethode ist abgelaufen
- Nicht genügend Deckung
- Die Karte wurde gesperrt

👉 Bitte aktualisiere deine Zahlungsmethode:
https://cybersarah.de/abo/verwalten

Dein Abo bleibt noch 7 Tage aktiv. Danach wird es automatisch gekündigt.

Bei Fragen: support@cybersarah.de

Dein CyberSarah-Team 💜`,
        });

        await db.insert(dunningEmailsTable).values({
          ereignisTyp: "zahlung_fehlgeschlagen",
          referenzId: sub.stripeSubscriptionId ?? `sub_${sub.id}`,
          email: sub.kundenEmail,
        });

        dunningEmails++;

        // Fehlerzähler erhöhen
        await db.update(customerSubscriptionsTable)
          .set({
            fehlgeschlageneZahlungen: sql`${customerSubscriptionsTable.fehlgeschlageneZahlungen} + 1`,
            letzterFehlgeschlagen: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(customerSubscriptionsTable.id, sub.id));

        // Nach 3 Fehlversuchen kündigen
        if (sub.fehlgeschlageneZahlungen >= 2) {
          await db.update(customerSubscriptionsTable)
            .set({
              status: "gekuendigt",
              gekuendigtAm: new Date(),
              grundKündigung: "Automatische Kündigung nach 3 fehlgeschlagenen Zahlungen",
              updatedAt: new Date(),
            })
            .where(eq(customerSubscriptionsTable.id, sub.id));

          // Stripe Subscription kündigen
          try {
            const { getStripeClient } = await import("../lib/stripeClient");
            const stripe = getStripeClient();
            if (stripe && sub.stripeSubscriptionId) {
              await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
            }
          } catch {}

          gekuendigt++;
          logger.info({ email: sub.kundenEmail }, "🔴 Abo automatisch gekündigt — 3 fehlgeschlagene Zahlungen");
        }
      } catch (err) {
        logger.warn({ err, email: sub.kundenEmail }, "Dunning-Email fehlgeschlagen");
      }
    }

    return {
      success: true,
      message: `${dunningEmails} Dunning-Mails gesendet, ${gekuendigt} Abos gekündigt`,
      metadaten: { problemSubs: problemSubs.length, dunningEmails, gekuendigt },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // REVENUE FORECAST
  // ═════════════════════════════════════════════════════════════════════════════
  private async berechneForecast(): Promise<AufgabeErgebnis> {
    const aktiveSubs = await db
      .select()
      .from(customerSubscriptionsTable)
      .where(eq(customerSubscriptionsTable.status, "aktiv"));

    const plans = await db.select().from(subscriptionPlansTable);

    let monatlichMRR = 0;
    let jaehrlichMRR = 0;
    let monatlichSubs = 0;
    let jaehrlichSubs = 0;

    for (const sub of aktiveSubs) {
      const plan = plans.find(p => p.id === sub.planId);
      if (!plan) continue;

      const preis = parseFloat(plan.preis);
      if (plan.intervall === "year") {
        jaehrlichMRR += preis / 12;
        jaehrlichSubs++;
      } else {
        monatlichMRR += preis;
        monatlichSubs++;
      }
    }

    const totalMRR = monatlichMRR + jaehrlichMRR;
    const totalARR = totalMRR * 12;

    // Churn-Rate (letzte 30 Tage)
    const vor30Tagen = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const gekuendigtLetzte30T = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(customerSubscriptionsTable)
      .where(
        and(
          eq(customerSubscriptionsTable.status, "gekuendigt"),
          gte(customerSubscriptionsTable.gekuendigtAm, vor30Tagen),
        ),
      );

    const churnRate = aktiveSubs.length > 0
      ? (Number(gekuendigtLetzte30T[0]?.count ?? 0) / (aktiveSubs.length + Number(gekuendigtLetzte30T[0]?.count ?? 0))) * 100
      : 0;

    return {
      success: true,
      message: `📊 MRR: €${totalMRR.toFixed(2)} | ARR: €${totalARR.toFixed(2)} | Churn: ${churnRate.toFixed(1)}%`,
      metadaten: {
        monatlichMRR: monatlichMRR.toFixed(2),
        jaehrlichMRR: jaehrlichMRR.toFixed(2),
        totalMRR: totalMRR.toFixed(2),
        totalARR: totalARR.toFixed(2),
        monatlichSubs,
        jaehrlichSubs,
        aktiveSubs: aktiveSubs.length,
        churnRate: churnRate.toFixed(1),
        gekuendigt30d: Number(gekuendigtLetzte30T[0]?.count ?? 0),
      },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STATISTIK
  // ═════════════════════════════════════════════════════════════════════════════
  private async holeStats(): Promise<AufgabeErgebnis> {
    const subs = await db.select().from(customerSubscriptionsTable);
    const plans = await db.select().from(subscriptionPlansTable).orderBy(subscriptionPlansTable.reihenfolge);

    const statusCounts: Record<string, number> = {};
    for (const s of subs) {
      statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;
    }

    const invoiceCount = await db.select({ count: sql<number>`COUNT(*)` }).from(subscriptionInvoicesTable);
    const invoicePaid = await db.select({ count: sql<number>`COUNT(*)` }).from(subscriptionInvoicesTable).where(eq(subscriptionInvoicesTable.status, "bezahlt"));

    return {
      success: true,
      message: `${subs.length} Abos, ${plans.length} Pläne`,
      metadaten: {
        subsGesamt: subs.length,
        statusVerteilung: statusCounts,
        plans: plans.length,
        rechnungen: Number(invoiceCount[0]?.count ?? 0),
        bezahlteRechnungen: Number(invoicePaid[0]?.count ?? 0),
      },
    };
  }
}
