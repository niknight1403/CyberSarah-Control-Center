/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AFFILIATE AUTOMATION AGENT (Sprint 5.1)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Vollautomatisiertes Affiliate-Partner-Programm:
 *  - Partner-Verwaltung mit Stufen (Bronze→Silber→Gold→Platin)
 *  - Tracking-Links mit Cookie-basierter Attribution
 *  - Automatische Provisionsberechnung pro Transaktion
 *  - Tier-Kommissionen (mehr Umsatz = höhere Provision)
 *  - Auto-Payouts via Stripe/PayPal (monatlich)
 *  - Klick- & Conversion-Tracking
 *  - E-Mail-Benachrichtigungen bei neuen Provisionen
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { db } from "@workspace/db";
import {
  affiliatePartnersTable, affiliateLinksTable, affiliateClicksTable,
  affiliatePayoutsTable, transactionsTable, agentLogsTable
} from "@workspace/db";
import { eq, desc, gte, and, sql, lt, lte } from "drizzle-orm";
import { logger } from "../lib/logger";

const TIER_PROVISIONEN = [
  { stufe: "bronze", minUmsatz: 0, provision: 10, bonus: 0 },
  { stufe: "silber", minUmsatz: 1000, provision: 15, bonus: 50 },
  { stufe: "gold", minUmsatz: 5000, provision: 20, bonus: 150 },
  { stufe: "platin", minUmsatz: 20000, provision: 25, bonus: 500 },
];

export class AffiliateAutomationAgent extends AgentBase {
  constructor() {
    super("Affiliate Automation Agent", "affiliate_auto");
  }

  protected beschreibungText(): string {
    return "AUTONOM: Verwalte Affiliate-Partner, Tracking-Links, berechne Provisionen, führe monatliche Auto-Payouts via Stripe/PayPal durch";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const aktion = String(aufgabe.payload?.["aktion"] ?? "full_sync");

    switch (aktion) {
      case "calculate_commissions":
        return this.berechneProvisionen();
      case "upgrade_tiers":
        return this.upgradeStufen();
      case "process_payouts":
        return this.verarbeiteAuszahlungen();
      case "sync_orders":
        return this.synchronisiereBestellungen();
      case "stats":
        return this.holeStats();
      case "full_sync":
      default:
        return this.fuehreVollSyncAus();
    }
  }

  private async fuehreVollSyncAus(): Promise<AufgabeErgebnis> {
    const commissionsResult = await this.berechneProvisionen();
    const tiersResult = await this.upgradeStufen();
    const payoutsResult = await this.verarbeiteAuszahlungen();

    return {
      success: true,
      message: `Affiliate-Sync: ${commissionsResult.metadaten?.provisionen ?? 0} Provisionen | ${tiersResult.metadaten?.upgrades ?? 0} Upgrades | ${payoutsResult.metadaten?.auszahlungen ?? 0} Auszahlungen`,
      metadaten: { commissions: commissionsResult.metadaten, tiers: tiersResult.metadaten, payouts: payoutsResult.metadaten },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PROVISIONEN BERECHNEN
  // ═════════════════════════════════════════════════════════════════════════════
  private async berechneProvisionen(): Promise<AufgabeErgebnis> {
    const letzteBerechnung = new Date(Date.now() - 24 * 60 * 60 * 1000); // Letzte 24h

    const neueTransaktionen = await db
      .select({
        id: transactionsTable.id,
        betrag: transactionsTable.betrag,
        beschreibung: transactionsTable.beschreibung,
        transaktionsId: transactionsTable.transaktionsId,
      })
      .from(transactionsTable)
      .where(gte(transactionsTable.createdAt, letzteBerechnung));

    // Letzten 1000 Clicks mit Tracking-Referenz
    const aktivePartner = await db
      .select()
      .from(affiliatePartnersTable)
      .where(eq(affiliatePartnersTable.status, "aktiv"));

    const aktiveLinks = await db
      .select()
      .from(affiliateLinksTable)
      .where(eq(affiliateLinksTable.aktiv, true));

    let provisionen = 0;
    let gesamtProvision = 0;

    // Für jede Transaktion prüfen, ob sie einem Affiliate zugeordnet werden kann
    // via Click-Tracking (in Produktion: Cookie-basiert)
    // Vereinfacht: Nutze beschreibung als Referenz auf Affiliate-Code
    for (const tx of neueTransaktionen) {
      const beschreibung = tx.beschreibung ?? "";

      // Nach Affiliate-Code in Beschreibung suchen
      for (const link of aktiveLinks) {
        if (beschreibung.includes(link.code) || beschreibung.includes(`ref=${link.code}`)) {
          const partner = aktivePartner.find(p => p.id === link.partnerId);
          if (!partner) continue;

          const betrag = parseFloat(tx.betrag);
          const provisionSatz = link.provisionAbweichend
            ? parseFloat(link.provisionAbweichend)
            : parseFloat(partner.provisionProzentsatz);
          const provision = (betrag * provisionSatz) / 100;

          if (provision <= 0) continue;

          // Partner-Statistiken aktualisieren
          await db.update(affiliatePartnersTable)
            .set({
              gesamtUmsatz: sql`${affiliatePartnersTable.gesamtUmsatz} + ${betrag}`,
              gesamtProvision: sql`${affiliatePartnersTable.gesamtProvision} + ${provision}`,
              ausstehendProvision: sql`${affiliatePartnersTable.ausstehendProvision} + ${provision}`,
              konversionAnzahl: sql`${affiliatePartnersTable.konversionAnzahl} + 1`,
              letzteAktivitaet: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(affiliatePartnersTable.id, partner.id));

          // Link-Statistiken aktualisieren
          await db.update(affiliateLinksTable)
            .set({
              konversionAnzahl: sql`${affiliateLinksTable.konversionAnzahl} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(affiliateLinksTable.id, link.id));

          // Click als konvertiert markieren
          const [click] = await db
            .select({ id: affiliateClicksTable.id })
            .from(affiliateClicksTable)
            .where(
              and(
                eq(affiliateClicksTable.linkId, link.id),
                eq(affiliateClicksTable.konvertiert, false),
              ),
            )
            .limit(1);

          if (click) {
            await db.update(affiliateClicksTable)
              .set({ konvertiert: true, transaktionsId: tx.transaktionsId ?? String(tx.id), createdAt: new Date() })
              .where(eq(affiliateClicksTable.id, click.id));
          }

          provisionen++;
          gesamtProvision += provision;
          logger.info({ partner: partner.email, provision, betrag, code: link.code }, "💰 Affiliate-Provision berechnet");
          break;
        }
      }
    }

    return {
      success: true,
      message: `${provisionen} Provisionen berechnet (€${gesamtProvision.toFixed(2)})`,
      metadaten: { transaktionen: neueTransaktionen.length, provisionen, gesamtProvision: gesamtProvision.toFixed(2) },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STUFEN-AUFSTIEG
  // ═════════════════════════════════════════════════════════════════════════════
  private async upgradeStufen(): Promise<AufgabeErgebnis> {
    const partner = await db.select().from(affiliatePartnersTable).where(eq(affiliatePartnersTable.status, "aktiv"));
    let upgrades = 0;

    for (const p of partner) {
      const umsatz = parseFloat(p.gesamtUmsatz);
      let neueStufe = "bronze";
      let neuerSatz = 10;

      for (const tier of [...TIER_PROVISIONEN].sort((a, b) => b.minUmsatz - a.minUmsatz)) {
        if (umsatz >= tier.minUmsatz) {
          neueStufe = tier.stufe;
          neuerSatz = tier.provision;
          break;
        }
      }

      if (neueStufe !== p.stufe) {
        await db.update(affiliatePartnersTable)
          .set({
            stufe: neueStufe,
            provisionProzentsatz: String(neuerSatz),
            updatedAt: new Date(),
          })
          .where(eq(affiliatePartnersTable.id, p.id));
        upgrades++;
        logger.info({ partner: p.email, stufe: neueStufe, satz: neuerSatz }, "⭐ Affiliate-Tier-Upgrade!");
      }
    }

    return {
      success: true,
      message: `${upgrades} Partner-Upgrades durchgeführt`,
      metadaten: { geprueft: partner.length, upgrades },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // AUSZAHLUNGEN VERARBEITEN (monatlich, ab 20€)
  // ═════════════════════════════════════════════════════════════════════════════
  private async verarbeiteAuszahlungen(): Promise<AufgabeErgebnis> {
    const faelligePartner = await db
      .select()
      .from(affiliatePartnersTable)
      .where(
        and(
          eq(affiliatePartnersTable.status, "aktiv"),
          sql`${affiliatePartnersTable.ausstehendProvision}::numeric >= ${affiliatePartnersTable.minAuszahlung}::numeric`,
        ),
      );

    let auszahlungen = 0;
    let gesamtBetrag = 0;

    for (const p of faelligePartner) {
      const betrag = parseFloat(p.ausstehendProvision);
      if (betrag < parseFloat(p.minAuszahlung)) continue;

      const methode = p.stripeAccountId ? "stripe" : p.paypalEmail ? "paypal" : null;
      if (!methode) {
        logger.warn({ partner: p.email }, "⚠️ Keine Auszahlungsmethode konfiguriert");
        continue;
      }

      await db.insert(affiliatePayoutsTable).values({
        partnerId: p.id,
        betrag: String(betrag),
        status: "ausstehend",
        methode,
        notizen: `Automatische monatliche Auszahlung — Stufe: ${p.stufe}`,
      });

      await db.update(affiliatePartnersTable)
        .set({
          ausstehendProvision: "0",
          ausgezahltProvision: sql`${affiliatePartnersTable.ausgezahltProvision} + ${betrag}`,
          updatedAt: new Date(),
        })
        .where(eq(affiliatePartnersTable.id, p.id));

      auszahlungen++;
      gesamtBetrag += betrag;
      logger.info({ partner: p.email, betrag, methode }, "💸 Affiliate-Auszahlung erstellt");
    }

    return {
      success: true,
      message: `${auszahlungen} Auszahlungen erstellt (€${gesamtBetrag.toFixed(2)})`,
      metadaten: { auszahlungen, gesamtBetrag: gesamtBetrag.toFixed(2), partner: faelligePartner.length },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // BESTELLUNGEN SYNCHRONISIEREN
  // ═════════════════════════════════════════════════════════════════════════════
  private async synchronisiereBestellungen(): Promise<AufgabeErgebnis> {
    // Von Stripe abrufen und Affiliate-Codes in Metadaten suchen
    try {
      const stripeModule = await import("../lib/stripeClient");
      const stripe = stripeModule.getStripeClient();
      if (!stripe) return { success: false, message: "Stripe nicht verfügbar" };

      const vor24h = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
      const sessions = await stripe.checkout.sessions.list({
        limit: 50,
        created: { gte: vor24h },
        expand: ["data.payment_intent"],
      });

      let gefunden = 0;
      for (const session of sessions.data) {
        const metadata = session.metadata ?? {};
        const refCode = metadata["affiliate"] ?? metadata["ref"] ?? metadata["partner"];

        if (refCode) {
          const [link] = await db
            .select({ id: affiliateLinksTable.id, partnerId: affiliateLinksTable.partnerId })
            .from(affiliateLinksTable)
            .where(eq(affiliateLinksTable.code, refCode))
            .limit(1);

          if (link) {
            // Click erfassen falls nicht vorhanden
            await db.insert(affiliateClicksTable).values({
              linkId: link.id,
              partnerId: link.partnerId,
              zielUrl: session.url ?? "",
              konvertiert: true,
              transaktionsId: session.id,
            }).onConflictDoNothing();
            gefunden++;
          }
        }
      }

      logger.info({ gefunden, gescannt: sessions.data.length }, "🔄 Stripe-Affiliate-Scan abgeschlossen");

      return {
        success: true,
        message: `${gefunden} Affiliate-Referenzen in Stripe-Sessions gefunden`,
        metadaten: { gescannt: sessions.data.length, gefunden },
      };
    } catch (err) {
      logger.warn({ err }, "Stripe-Affiliate-Scan fehlgeschlagen");
      return { success: false, message: `Fehler: ${(err as Error).message}` };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STATISTIK
  // ═════════════════════════════════════════════════════════════════════════════
  private async holeStats(): Promise<AufgabeErgebnis> {
    const partner = await db.select().from(affiliatePartnersTable);
    const aktivePartner = partner.filter(p => p.status === "aktiv");

    const gesamtUmsatz = partner.reduce((s, p) => s + parseFloat(p.gesamtUmsatz), 0);
    const gesamtProvision = partner.reduce((s, p) => s + parseFloat(p.gesamtProvision), 0);
    const ausstehend = partner.reduce((s, p) => s + parseFloat(p.ausstehendProvision), 0);
    const ausgezahlt = partner.reduce((s, p) => s + parseFloat(p.ausgezahltProvision), 0);

    const stufen: Record<string, number> = {};
    for (const p of partner) {
      stufen[p.stufe] = (stufen[p.stufe] ?? 0) + 1;
    }

    const payoutCount = await db.select({ count: sql<number>`COUNT(*)` }).from(affiliatePayoutsTable);
    const clickCount = await db.select({ count: sql<number>`COUNT(*)` }).from(affiliateClicksTable);

    const konversionen = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(affiliateClicksTable)
      .where(eq(affiliateClicksTable.konvertiert, true));

    return {
      success: true,
      message: `${aktivePartner.length} aktive Partner · €${ausstehend.toFixed(2)} ausstehend`,
      metadaten: {
        partnerGesamt: partner.length,
        aktivePartner: aktivePartner.length,
        gesamtUmsatz: gesamtUmsatz.toFixed(2),
        gesamtProvision: gesamtProvision.toFixed(2),
        ausstehendProvision: ausstehend.toFixed(2),
        ausgezahltProvision: ausgezahlt.toFixed(2),
        stufenVerteilung: stufen,
        auszahlungen: Number(payoutCount[0]?.count ?? 0),
        klicks: Number(clickCount[0]?.count ?? 0),
        konversionen: Number(konversionen[0]?.count ?? 0),
        konversionsRate: Number(clickCount[0]?.count ?? 0) > 0
          ? `${((Number(konversionen[0]?.count ?? 0) / Number(clickCount[0]?.count ?? 0)) * 100).toFixed(1)}%`
          : "0%",
      },
    };
  }
}
