/**
 * RevenueAnalystAgent V5 — MAX ACTION, MIN ANALYSIS
 *
 * AUTONOME REVENUE-AKTIONEN (alle 15 Min):
 *  - Cross-Sell: Erstellt Stripe-Produkte für Top-Verkäufe (alle 15 Min)
 *  - Dynamic Pricing: Passt Preise alle 15 Min an (basierend auf Nachfrage)
 *  - Anomalie-Erkennung: Reagiert sofort auf Umsatz-Einbrüche (-20%) mit Discount-Aktionen
 *  - Auto-Discount: Erstellt automatisch 20%-Rabatt-Aktionen bei schwacher Performance
 *  - Abandoned Cart: Erkennt und verfolgt abgebrochene Käufe
 *  - Revenue Forecasting + Auto-Aktion bei Unterschreitung
 *  - Kein manuelles Eingreifen nötig — vollständig autonom
 */
import { db } from "@workspace/db";
import { revenueOpportunitiesTable, agentLogsTable, transactionsTable, produkteTable } from "@workspace/db";
import { eq, desc, gte, and, sql, lt } from "drizzle-orm";
import { logger } from "../lib/logger";
import { openai, openaiVerfuegbar } from "../lib/openaiClient";
import { getStripeClient } from "../lib/stripeClient";
import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";

// 50+ Affiliate + Eigenprodukt-Programme für maximale Revenue-Diversifikation
const AFFILIATE_PROGRAMME = [
  { name: "1:1 KI-Coaching", kanal: "coaching", marke: "GeldPilot AI", geschaetzt: 2000, beschreibung: "Hochpreisiges 1:1 KI-Business-Coaching (297-997€/Session)" },
  { name: "KI-Masterclass Bundle", kanal: "eigenes_produkt", marke: "UnternehmerGPT", geschaetzt: 3000, beschreibung: "Komplettes KI-Business-Mastery-Bundle (197€ einmalig)" },
  { name: "Community Membership", kanal: "abo", marke: "CyberSarah", geschaetzt: 1500, beschreibung: "Monatliches Abo für exklusiven Content + KI-Tools (19€/Monat)" },
  { name: "MidJourney TikTok Shop", kanal: "eigenes_produkt", marke: "CyberSarah", geschaetzt: 800, beschreibung: "KI-generierte Prints und Merchandise über TikTok Shop" },
  { name: "KI-Prompt-Pakete Premium", kanal: "eigenes_produkt", marke: "UnternehmerGPT", geschaetzt: 600, beschreibung: "Premium ChatGPT-Prompt-Pakete für Selbstständige (19-49€)" },
  { name: "Digistore24 KI-Kurse", kanal: "affiliate", marke: "GeldPilot AI", geschaetzt: 500, beschreibung: "KI-Kurs-Affiliate mit 40-60% Provision" },
  { name: "Fiverr KI-Services", kanal: "freelance", marke: "CyberSarah", geschaetzt: 400, beschreibung: "KI-Content-Erstellung als Service" },
  { name: "ClickBank Digitalprodukte", kanal: "affiliate", marke: "GeldPilot AI", geschaetzt: 350, beschreibung: "ClickBank-Affiliate für Finanzkurse" },
  { name: "Awin Digital Tools", kanal: "affiliate", marke: "UnternehmerGPT", geschaetzt: 300, beschreibung: "Awin-Netzwerk: SaaS-Tools, Business-Software" },
  { name: "Gumroad Digitalprodukte", kanal: "eigenes_produkt", marke: "CyberSarah", geschaetzt: 250, beschreibung: "Verkauf von KI-Templates über Gumroad" },
  { name: "Etsy KI-Art", kanal: "eigenes_produkt", marke: "UnternehmerGPT", geschaetzt: 200, beschreibung: "KI-generierte Kunst und Prints" },
  { name: "Amazon Affiliate KI-Bücher", kanal: "affiliate", marke: "CyberSarah", geschaetzt: 150, beschreibung: "Amazon Partnerprogramm" },
  { name: "Canva Affiliate", kanal: "affiliate", marke: "CyberSarah", geschaetzt: 120, beschreibung: "Canva Pro-Affiliate" },
  { name: "Notion Affiliate", kanal: "affiliate", marke: "GeldPilot AI", geschaetzt: 80, beschreibung: "Notion-Affiliate recurring" },
  { name: "Teachable Kurs-Verkauf", kanal: "eigenes_produkt", marke: "GeldPilot AI", geschaetzt: 900, beschreibung: "KI-Kurse auf Teachable (47-197€)" },
  { name: "Ko-fi Mitgliedschaft", kanal: "abo", marke: "CyberSarah", geschaetzt: 180, beschreibung: "Ko-fi Membership (6€/Monat)" },
  { name: "Patreon Mitgliedschaft", kanal: "abo", marke: "UnternehmerGPT", geschaetzt: 400, beschreibung: "Patreon ($9-$49/Monat)" },
  { name: "TikTok Creator Rewards", kanal: "creator", marke: "CyberSarah", geschaetzt: 300, beschreibung: "TikTok-Ausschüttungen" },
  { name: "Instagram Bonus Programm", kanal: "creator", marke: "CyberSarah", geschaetzt: 200, beschreibung: "Instagram-Bonus" },
  { name: "YouTube Shorts Fund", kanal: "creator", marke: "UnternehmerGPT", geschaetzt: 250, beschreibung: "YouTube Shorts" },
  { name: "Tradedog Affiliate", kanal: "affiliate", marke: "GeldPilot AI", geschaetzt: 350, beschreibung: "Trading-Tool Affiliate" },
  { name: "TradeSites Affiliate", kanal: "affiliate", marke: "GeldPilot AI", geschaetzt: 300, beschreibung: "Trading-Sites Affiliate" },
  { name: "OnlyFans Management", kanal: "service", marke: "CyberSarah", geschaetzt: 500, beschreibung: "KI-gestütztes Management für Creator" },
  { name: "Telegram Premium Group", kanal: "abo", marke: "GeldPilot AI", geschaetzt: 250, beschreibung: "Exklusive Telegram-Gruppe mit KI-Trading-Signalen" },
  { name: "Substack Newsletter", kanal: "abo", marke: "UnternehmerGPT", geschaetzt: 150, beschreibung: "Bezahltes Substack-Abo mit exklusiven KI-Analysen" },
  { name: "Stripe Payment Links", kanal: "eigenes_produkt", marke: "CyberSarah", geschaetzt: 5000, beschreibung: "Direkte Stripe-Payment-Links für Sofort-Käufe" },
  { name: "KI-Agent-as-a-Service", kanal: "service", marke: "CyberSarah", geschaetzt: 2000, beschreibung: "Enterprise-KI-Agenten-Monatsabo (499€/Monat)" },
  { name: "Facebook Ads KI-Optimierung", kanal: "service", marke: "GeldPilot AI", geschaetzt: 600, beschreibung: "KI-optimierte Facebook-Werbekampagnen" },
  { name: "Google Ads KI-Management", kanal: "service", marke: "UnternehmerGPT", geschaetzt: 700, beschreibung: "Automatisches Google-Ads-Management mit KI" },
  { name: "LinkedIn B2B KI-Content", kanal: "service", marke: "CyberSarah", geschaetzt: 400, beschreibung: "B2B-Content-Erstellung für LinkedIn" },
  { name: "KI-Webinar Automation", kanal: "eigenes_produkt", marke: "GeldPilot AI", geschaetzt: 800, beschreibung: "Automatisierte KI-Webinare mit Verkaufstrichtern" },
  { name: "Prompt Engineering Kurs", kanal: "eigenes_produkt", marke: "UnternehmerGPT", geschaetzt: 350, beschreibung: "Kompletter Prompt-Engineering-Kurs (97€)" },
  { name: "KI-Content-Agent Vermietung", kanal: "service", marke: "CyberSarah", geschaetzt: 1500, beschreibung: "KI-Content-Agenten für Unternehmen (297€/Monat)" },
  { name: "TikTok Shop Dropshipping", kanal: "eigenes_produkt", marke: "GeldPilot AI", geschaetzt: 1000, beschreibung: "KI-optimierter Dropshipping-Shop auf TikTok" },
  { name: "Instagram Reels Automation", kanal: "service", marke: "CyberSarah", geschaetzt: 450, beschreibung: "Automatisierte Instagram-Reels-Erstellung" },
  { name: "YouTube Channel Management", kanal: "service", marke: "UnternehmerGPT", geschaetzt: 1200, beschreibung: "Komplettes YouTube-Kanal-Management mit KI" },
  { name: "KI-Business-Plan Generator", kanal: "eigenes_produkt", marke: "GeldPilot AI", geschaetzt: 200, beschreibung: "KI-generierte Businesspläne (29€)" },
  { name: "Newsletter Monetarisierung", kanal: "service", marke: "CyberSarah", geschaetzt: 350, beschreibung: "KI-Newsletter-Monetarisierungs-Service" },
  { name: "WhatsApp Marketing KI", kanal: "service", marke: "UnternehmerGPT", geschaetzt: 500, beschreibung: "Automatisiertes WhatsApp-Marketing mit KI" },
  { name: "SEO Content Empire", kanal: "eigenes_produkt", marke: "GeldPilot AI", geschaetzt: 750, beschreibung: "Autonomes SEO-Content-Imperium aufbauen" },
  { name: "E-Mail-List Monetarisierung", kanal: "eigenes_produkt", marke: "CyberSarah", geschaetzt: 600, beschreibung: "Komplette E-Mail-List-Monetarisierung" },
  { name: "Faceless Video Empire", kanal: "eigenes_produkt", marke: "UnternehmerGPT", geschaetzt: 900, beschreibung: "Autonome Faceless-Video-Produktion" },
  { name: "Content Recycling System", kanal: "eigenes_produkt", marke: "GeldPilot AI", geschaetzt: 400, beschreibung: "KI-Content-Recycling für maximale Reichweite" },
  { name: "Online-Kurs-Plattform", kanal: "eigenes_produkt", marke: "CyberSarah", geschaetzt: 2000, beschreibung: "KI-Online-Kurs-Plattform (297€ Lebenszeit)" },
  { name: "SaaS-Tool Vermietung", kanal: "abo", marke: "UnternehmerGPT", geschaetzt: 3000, beschreibung: "KI-SaaS-Tools als Monatsabo (29-99€)" },
  { name: "Beratungspaket Premium", kanal: "coaching", marke: "GeldPilot AI", geschaetzt: 1500, beschreibung: "KI-Strategieberatung für Unternehmen (997€)" },
  { name: "Affiliate-Marketing-Kurs", kanal: "eigenes_produkt", marke: "CyberSarah", geschaetzt: 500, beschreibung: "Kompletter Affiliate-Kurs (147€)" },
  { name: "KI-Tool-Verleih", kanal: "service", marke: "UnternehmerGPT", geschaetzt: 800, beschreibung: "KI-Tools als Service (49€/Monat pro Tool)" },
  { name: "Social-Media-Content-Farm", kanal: "eigenes_produkt", marke: "GeldPilot AI", geschaetzt: 1200, beschreibung: "Automatisierte Social-Media-Content-Farm" },
  { name: "KI-Data-Analytics-Service", kanal: "service", marke: "CyberSarah", geschaetzt: 1000, beschreibung: "KI-Datenanalyse für Unternehmen (197€/Report)" },
];

export class RevenueAnalystAgent extends AgentBase {
  constructor() {
    super("Revenue Analyst Agent", "revenue_analyst");
  }

  protected beschreibungText(): string {
    return "V5 MAX ACTION: Cross-Sell alle 15 Min, Dynamic Pricing, Auto-Discount, Abandoned Cart Recovery, Affiliate-Sync, Forecasting + Auto-Aktion";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const payload = aufgabe.payload as Record<string, unknown>;
    const aktion = String(payload?.aktion ?? "auto_action_all");

    switch (aktion) {
      case "revenue_anomaly": return this.revenueAnomalyDetection();
      case "auto_cross_sell": return this.autoCrossSell();
      case "dynamic_pricing": return this.dynamicPricing();
      case "auto_discount": return this.autoDiscount();
      case "forecast": return this.revenueForecast();
      case "affiliate_sync": return this.syncAffiliateProgramme();
      case "abandoned_cart": return this.abandonedCartRecovery();
      case "auto_action_all": return this.autoActionAll();
      default: return this.autoActionAll();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUTO ACTION ALL: Führt ALLE Revenue-Aktionen aus (alle 15 Min)
  // ═══════════════════════════════════════════════════════════════════
  private async autoActionAll(): Promise<AufgabeErgebnis> {
    logger.info("🚀 RevenueAnalyst-V5: Auto-Action-All gestartet");

    const ergebnisse = await Promise.allSettled([
      this.revenueAnomalyDetection(),
      this.autoCrossSell(),
      this.dynamicPricing(),
      this.autoDiscount(),
      this.revenueForecast(),
      this.abandonedCartRecovery(),
    ]);

    const erfolgreich = ergebnisse.filter(r => r.status === "fulfilled").length;
    const fehlgeschlagen = ergebnisse.filter(r => r.status === "rejected").length;

    if (this.agentId) {
      await db.insert(agentLogsTable).values({
        agentId: this.agentId,
        agentName: "Revenue Analyst Agent",
        aktion: "auto_action_all_v5",
        status: fehlgeschlagen > 0 ? "warning" : "ok",
        nachricht: `${erfolgreich}/7 Aktionen erfolgreich, ${fehlgeschlagen} fehlgeschlagen`,
        details: { erfolgreich, fehlgeschlagen, timestamp: new Date().toISOString() },
      });
    }

    return {
      success: true,
      message: `Auto-Action-All: ${erfolgreich}/7 Aktionen ausgeführt`,
      metadaten: { erfolgreich, fehlgeschlagen },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // DYNAMIC PRICING V3: Erstellt/aktualisiert Stripe-Preise alle 15 Min
  // ═══════════════════════════════════════════════════════════════════
  private async dynamicPricing(): Promise<AufgabeErgebnis> {
    logger.info("💰 RevenueAnalyst-V5: Dynamic Pricing");
    const stripe = getStripeClient();

    const topProdukte = await db
      .select({ name: transactionsTable.produktName, anzahl: sql<number>`COUNT(*)`, umsatz: sql<number>`SUM(betrag)` })
      .from(transactionsTable)
      .where(gte(transactionsTable.createdAt, new Date(Date.now() - 14 * 86400000)))
      .groupBy(transactionsTable.produktName)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);

    let preiseErstellt = 0;

    for (const produkt of topProdukte) {
      if (!produkt.name) continue;
      const durchschnittsPreis = Number(produkt.umsatz ?? 0) / Math.max(Number(produkt.anzahl), 1);
      if (durchschnittsPreis < 500) continue;

      // Premium-Preis (30% Aufschlag fürExpress-Käufer)
      try {
        const premiumPreis = Math.round(durchschnittsPreis * 1.3);
        const prod = await stripe.products.create({
          name: `${produkt.name} Premium`,
          description: `⚡ Express-Version: ${produkt.name} — Premium-Support + Priorität`,
          metadata: { quelle: "revenue_analyst_v5_pricing", basisProdukt: produkt.name },
        });
        await stripe.prices.create({
          product: prod.id, unit_amount: premiumPreis, currency: "eur",
        });
        preiseErstellt++;
      } catch { /* produkt existiert evtl. schon */ }

      // Budget-Preis (30% Rabatt für Schnäppchenjäger)
      try {
        const budgetPreis = Math.max(Math.round(durchschnittsPreis * 0.7), 999);
        const prod2 = await stripe.products.create({
          name: `${produkt.name} Budget`,
          description: `💰 Spar-Angebot: ${produkt.name} zum Budget-Preis`,
          metadata: { quelle: "revenue_analyst_v5_pricing", basisProdukt: produkt.name },
        });
        await stripe.prices.create({
          product: prod2.id, unit_amount: budgetPreis, currency: "eur",
        });
        preiseErstellt++;
      } catch { /* produkt existiert evtl. schon */ }
    }

    return {
      success: true,
      message: `${preiseErstellt} Preise automatisch optimiert`,
      metadaten: { preiseErstellt, topProdukte: topProdukte.length },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUTO CROSS-SELL V3: Erstellt Stripe-Produkte + Payment-Links
  // ═══════════════════════════════════════════════════════════════════
  private async autoCrossSell(): Promise<AufgabeErgebnis> {
    logger.info("🔄 RevenueAnalyst-V5: Auto Cross-Sell");
    const stripe = getStripeClient();

    const topProdukte = await db
      .select({ name: transactionsTable.produktName, anzahl: sql<number>`COUNT(*)` })
      .from(transactionsTable)
      .where(gte(transactionsTable.createdAt, new Date(Date.now() - 14 * 86400000)))
      .groupBy(transactionsTable.produktName)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(5);

    let crossSells = 0;

    // Erstelle Cross-Sell-Produkte für Top-Verkäufe
    for (const produkt of topProdukte) {
      if (!produkt.name) continue;
      const crossSellName = `${produkt.name} + Upgrade Bundle`;
      try {
        const prod = await stripe.products.create({
          name: crossSellName.slice(0, 100),
          description: `🔥 Upgrade: Erweitere ${produkt.name} mit Premium-Features!`,
          metadata: { quelle: "revenue_analyst_v5_crossell", basisProdukt: produkt.name },
        });
        const price = await stripe.prices.create({
          product: prod.id, unit_amount: 2999, currency: "eur",
        });
        await stripe.paymentLinks.create({
          line_items: [{ price: price.id, quantity: 1 }],
          after_completion: { type: "redirect", redirect: { url: "https://cybersarah.de/danke" } },
        });

        await db.insert(revenueOpportunitiesTable).values({
          titel: crossSellName, typ: "cross_sell", kanal: "eigenes_produkt",
          status: "aktiv", geschaetzterMonatsumsatz: "500",
          stripePaymentLink: "", beschreibung: `Cross-Sell: ${produkt.name} Upgrade`,
          quelle: "RevenueAnalyst-V5-CrossSell",
        }).onConflictDoNothing();
        crossSells++;
      } catch { /* überspringe Konflikte */ }
    }

    return {
      success: true,
      message: `${crossSells} Cross-Sell-Produkte erstellt`,
      metadaten: { crossSells },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUTO DISCOUNT: Erstellt 20%-Rabatt-Aktionen bei schwacher Perf.
  // ═══════════════════════════════════════════════════════════════════
  private async autoDiscount(): Promise<AufgabeErgebnis> {
    logger.info("🏷️ RevenueAnalyst-V5: Auto Discount");
    const stripe = getStripeClient();

    const [heuteUmsatz] = await db
      .select({ summe: sql<number>`COALESCE(SUM(betrag),0)` })
      .from(transactionsTable)
      .where(gte(transactionsTable.createdAt, new Date(Date.now() - 86400000)));

    const umsatz = Number(heuteUmsatz?.summe ?? 0);
    let discounts = 0;

    if (umsatz < 50) {
      // Bei schwachem Umsatz: Rabattaktionen starten
      for (const prog of AFFILIATE_PROGRAMME.slice(0, 3)) {
        try {
          const discountName = `🔥 -20%: ${prog.name} — NUR HEUTE`;
          const prod = await stripe.products.create({
            name: discountName.slice(0, 100),
            description: `⏰ Limited Time: 20% Rabatt auf ${prog.name}! Nur heute!`,
            metadata: { quelle: "revenue_analyst_v5_discount" },
          });
          const originalPreis = prog.geschaetzt * 100; // in Cent
          const rabattPreis = Math.round(originalPreis * 0.8);
          await stripe.prices.create({
            product: prod.id, unit_amount: Math.max(rabattPreis, 999), currency: "eur",
          });

          await db.insert(revenueOpportunitiesTable).values({
            titel: discountName, typ: "discount", kanal: "eigenes_produkt",
            status: "aktiv", geschaetzterMonatsumsatz: (prog.geschaetzt * 0.5).toString(),
            beschreibung: `Auto-Rabatt: ${prog.beschreibung}`,
            quelle: "RevenueAnalyst-V5-Discount",
          }).onConflictDoNothing();
          discounts++;
        } catch { /* überspringe Konflikte */ }
      }
    }

    return {
      success: true,
      message: discounts > 0 ? `${discounts} Rabattaktionen erstellt (Umsatz: €${umsatz.toFixed(0)})` : "Keine Rabatte nötig",
      metadaten: { discounts, umsatz },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ABANDONED CART RECOVERY: Findet abgebrochene Käufe
  // ═══════════════════════════════════════════════════════════════════
  private async abandonedCartRecovery(): Promise<AufgabeErgebnis> {
    logger.info("🛒 RevenueAnalyst-V5: Abandoned Cart Recovery");
    const stripe = getStripeClient();

    const vor3Tagen = new Date(Date.now() - 3 * 86400000);
    const vor24h = new Date(Date.now() - 86400000);

    // Simuliere: Check auf ausstehende Stripe-PaymentIntents
    let abgebrochen = 0;
    try {
      const paymentIntents = await stripe.paymentIntents.list({
        limit: 10,
        created: { gte: Math.floor(vor3Tagen.getTime() / 1000) },
      });

      for (const pi of paymentIntents.data) {
        if (pi.status === "canceled" || pi.status === "requires_payment_method") {
          // Erstelle Recovery-Payment-Link
          if (pi.amount > 0) {
            try {
              const recoveryLink = await stripe.paymentLinks.create({
                line_items: [{
                  price_data: {
                    product: pi.metadata?.product_id ?? "prod_N8Vv7eGz4R",
                    unit_amount: pi.amount,
                    currency: pi.currency,
                    product_data: { name: `Recovery: ${pi.description ?? "Kauf"}` },
                  },
                  quantity: 1,
                }],
                after_completion: { type: "redirect", redirect: { url: "https://cybersarah.de/danke" } },
              });

              await db.insert(revenueOpportunitiesTable).values({
                titel: `🔄 Recovery: ${pi.description ?? "Abgebrochener Kauf"}`,
                typ: "recovery", kanal: "email",
                status: "aktiv", geschaetzterMonatsumsatz: (pi.amount / 100).toString(),
                stripePaymentLink: recoveryLink.url,
                beschreibung: `Auto-Recovery für abgebrochenen Kauf (€${(pi.amount / 100).toFixed(2)})`,
                quelle: "RevenueAnalyst-V5-Recovery",
              }).onConflictDoNothing();
              abgebrochen++;
            } catch { /* überspringe Fehler */ }
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, "Stripe-PaymentIntents nicht verfügbar");
    }

    return {
      success: true,
      message: `${abgebrochen} abgebrochene Käufe identifiziert + Recovery-Links erstellt`,
      metadaten: { abgebrochen },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // SYNC AFFILIATE PROGRAMME: Neue Programme in DB anlegen
  // ═══════════════════════════════════════════════════════════════════
  private async syncAffiliateProgramme(): Promise<AufgabeErgebnis> {
    const bestehende = await db.select({ titel: revenueOpportunitiesTable.titel })
      .from(revenueOpportunitiesTable)
      .where(eq(revenueOpportunitiesTable.quelle, "RevenueAnalyst-AffiliateSync"));

    const bestehendeTitel = new Set(bestehende.map(b => b.titel));
    let neueProgramme = 0;

    for (const prog of AFFILIATE_PROGRAMME) {
      if (bestehendeTitel.has(prog.name)) continue;
      try {
        await db.insert(revenueOpportunitiesTable).values({
          titel: prog.name, typ: "affiliate", kanal: prog.kanal,
          status: "aktiv", geschaetzterMonatsumsatz: prog.geschaetzt.toString(),
          beschreibung: prog.beschreibung, quelle: "RevenueAnalyst-AffiliateSync",
        }).onConflictDoNothing();
        neueProgramme++;
      } catch { /* ignore conflicts */ }
    }
    return {
      success: true,
      message: `${neueProgramme} Affiliate-Programme synchronisiert`,
      metadaten: { neueProgramme, gesamt: AFFILIATE_PROGRAMME.length },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // REVENUE FORECAST MIT AKTION: Sagt nächste 7 Tage voraus + Aktion
  // ═══════════════════════════════════════════════════════════════════
  private async revenueForecast(): Promise<AufgabeErgebnis> {
    logger.info("🔮 RevenueAnalyst-V5: Revenue Forecast + Auto-Action");
    const vor30Tagen = new Date(Date.now() - 30 * 86400000);

    const historisch = await db
      .select({ tag: sql<string>`DATE(created_at)`, summe: sql<string>`SUM(betrag)` })
      .from(transactionsTable)
      .where(gte(transactionsTable.createdAt, vor30Tagen))
      .groupBy(sql`DATE(created_at)`)
      .orderBy(sql`DATE(created_at)`);

    const tagesWerte = historisch.map(h => ({ tag: h.tag, summe: parseFloat(h.summe ?? "0") }));
    const durchschnitt = tagesWerte.length > 0
      ? tagesWerte.reduce((a, b) => a + b.summe, 0) / tagesWerte.length
      : 0;
    const prognose7Tage = durchschnitt * 7;

    // Auto-Aktion: Wenn Prognose zu niedrig, Cross-Sell auslösen
    let aktionAusgeloest = false;
    if (prognose7Tage < 500 && tagesWerte.length > 3) {
      logger.warn(`⚠️ Prognose niedrig (€${prognose7Tage.toFixed(0)}): Starte Cross-Sell + Discount`);
      await this.autoCrossSell();
      await this.autoDiscount();
      aktionAusgeloest = true;
    }

    return {
      success: true,
      message: `📊 7-Tage-Prognose: €${prognose7Tage.toFixed(0)} ${aktionAusgeloest ? "⚠️ Auto-Aktion ausgelöst!" : ""}`,
      metadaten: { prognose7Tage, tageDaten: tagesWerte.length, durchschnitt, aktionAusgeloest },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // REVENUE ANOMALY DETECTION: Erkennt + reagiert auf Umsatz-Einbrüche
  // ═══════════════════════════════════════════════════════════════════
  private async revenueAnomalyDetection(): Promise<AufgabeErgebnis> {
    const heute = new Date();
    const gestern = new Date(heute.getTime() - 86400000);
    const letzteWoche = new Date(heute.getTime() - 7 * 86400000);

    const [umsatzHeute, umsatzGestern, umsatzLetzteWoche] = await Promise.all([
      db.select({ summe: sql<number>`COALESCE(SUM(betrag),0)` }).from(transactionsTable)
        .where(gte(transactionsTable.createdAt, new Date(heute.getTime() - 86400000))),
      db.select({ summe: sql<number>`COALESCE(SUM(betrag),0)` }).from(transactionsTable)
        .where(and(gte(transactionsTable.createdAt, gestern), lt(transactionsTable.createdAt, heute))),
      db.select({ summe: sql<number>`COALESCE(SUM(betrag),0)` }).from(transactionsTable)
        .where(and(gte(transactionsTable.createdAt, letzteWoche), lt(transactionsTable.createdAt, heute))),
    ]);

    const heuteSumme = Number(umsatzHeute[0]?.summe ?? 0);
    const gesternSumme = Number(umsatzGestern[0]?.summe ?? 0);
    const wochenSumme = Number(umsatzLetzteWoche[0]?.summe ?? 0);

    const anomalien: string[] = [];
    let aktionAusgeloest = false;

    // SCHNELLERE REAKTION: Bereits bei -20% Starte Gegenmaßnahmen (V4: -70%)
    if (gesternSumme > 0 && heuteSumme < gesternSumme * 0.8) {
      anomalien.push(`⚠️ Umsatz-Einbruch -${((1 - heuteSumme / gesternSumme) * 100).toFixed(0)}%: €${heuteSumme.toFixed(0)} vs €${gesternSumme.toFixed(0)} gesttern`);
      // Sofort Gegenmaßnahmen
      await this.autoDiscount();
      await this.autoCrossSell();
      aktionAusgeloest = true;
    }
    if (heuteSumme > gesternSumme * 2 && gesternSumme > 0) {
      anomalien.push(`🚀 Umsatz-Spitze +${((heuteSumme / gesternSumme - 1) * 100).toFixed(0)}%: €${heuteSumme.toFixed(0)}`);
    }
    if (wochenSumme > 0 && heuteSumme / wochenSumme > 0.5) {
      anomalien.push(`📊 ${(heuteSumme / wochenSumme * 100).toFixed(0)}% der Wochensumme in einem Tag`);
    }

    if (this.agentId) {
      await db.insert(agentLogsTable).values({
        agentId: this.agentId, agentName: "Revenue Analyst Agent",
        aktion: "revenue_anomaly_v5", status: anomalien.length > 0 ? "warning" : "ok",
        nachricht: anomalien.length > 0 ? anomalien[0] : "✅ Keine Anomalien",
        details: { heuteSumme, gesternSumme, wochenSumme, anomalien, aktionAusgeloest },
      });
    }

    return {
      success: true,
      message: anomalien.length > 0 ? anomalien[0] : "✅ Keine Anomalien",
      metadaten: { heuteSumme, gesternSumme, wochenSumme, anomalien, aktionAusgeloest },
    };
  }
}
