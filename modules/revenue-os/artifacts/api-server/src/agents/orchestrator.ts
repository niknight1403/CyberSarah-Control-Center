import cron from "node-cron";
import { woechentlicherNewsletterScan } from "./newsletterAgent";
import { taeglicheWhatsAppAufgabe } from "./whatsappAgent";

// Der Control-Center-Bridge-Modus startet keine produktiven Cron-Aktionen.
if (process.env.REVENUE_OS_INTEGRATION_ONLY !== "1") {

  // ── Smart Coupon Agent: Init beim Start, KI-Coupons alle 12h, Optimierung alle 6h ──
  cron.schedule("0 */12 * * *", () => {
    globalQueue.fuegeHinzu("smart_coupon_ki", { aktion: "ki_coupons" }, { prioritaet: 2 });
  });
  cron.schedule("0 */6 * * *", () => {
    globalQueue.fuegeHinzu("smart_coupon_optimize", { aktion: "auto_optimize" }, { prioritaet: 2 });
  });
  cron.schedule("0 */8 * * *", () => {
    globalQueue.fuegeHinzu("smart_coupon_flash", { aktion: "flash_sale" }, { prioritaet: 3 });
  });

  // ── Abandoned Cart Recovery: Stripe-Scan alle 15 Min, Erinnerungen alle 5 Min ──
  cron.schedule("*/15 * * * *", () => {
    globalQueue.fuegeHinzu("cart_recovery_stripe", { aktion: "check_stripe" }, { prioritaet: 1 });

    // ── Loyalty & Referral: Programm init + erster Check ──
    globalQueue.fuegeHinzu("loyalty_full_check", { aktion: "init_program" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("loyalty_cards", { aktion: "check_cards" }, { prioritaet: 2 });

    // ── Subscription & Revenue Agent: Init + Sync beim Start ──
    globalQueue.fuegeHinzu("subscription_full_check", { aktion: "init_plans" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("subscription_sync", { aktion: "sync_subs" }, { prioritaet: 2 });
    // ── Sprint 8: Cross-Sell Engine beim Start ──
    globalQueue.fuegeHinzu("cross_sell_full", { aktion: "full_scan" }, { prioritaet: 2 });
    // ── Sprint 9: Conversion Optimizer beim Start ──
    globalQueue.fuegeHinzu("conversion_full", { aktion: "create_tests" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("conversion_analyze", { aktion: "analyze" }, { prioritaet: 2 });
    // ── Sprint 7.1: Aggressive Revenue Optimierungen beim Start ──
    globalQueue.fuegeHinzu("hara_scan", { aktion: "fast_revenue_scan" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "revenue_anomaly" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "auto_cross_sell" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("monetization_auto_optimize", { aktion: "dynamic_pricing" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("master_optimierung", { aktion: "revenue_priorisierung" }, { prioritaet: 1 });
  });
  cron.schedule("*/5 * * * *", () => {
    globalQueue.fuegeHinzu("cart_recovery_check", { aktion: "check_carts" }, { prioritaet: 1 });

  // ── Sales Chat: Analyse stündlich, Follow-ups alle 30 Min ──
  cron.schedule("5 * * * *", () => {
    globalQueue.fuegeHinzu("sales_chat_analyze", { aktion: "analyze" }, { prioritaet: 3 });
  });
  cron.schedule("*/30 * * * *", () => {
    globalQueue.fuegeHinzu("sales_chat_followup", { aktion: "followup" }, { prioritaet: 2 });
  });
  // ── Affiliate: Provisionen stündlich, Tiers täglich, Payouts monatlich (1. Tag) ──
  cron.schedule("0 * * * *", () => {
    globalQueue.fuegeHinzu("affiliate_commissions", { aktion: "calculate_commissions" }, { prioritaet: 2 });
  });
  cron.schedule("0 2 * * *", () => {
    globalQueue.fuegeHinzu("affiliate_tiers", { aktion: "upgrade_tiers" }, { prioritaet: 2 });
  });
  cron.schedule("0 6 1 * *", () => {
    globalQueue.fuegeHinzu("affiliate_payouts", { aktion: "process_payouts" }, { prioritaet: 1 });
  });
  cron.schedule("0 */4 * * *", () => {
    globalQueue.fuegeHinzu("affiliate_full_sync", { aktion: "full_sync" }, { prioritaet: 3 });
  });
  // ── Loyalty & Referral: Karten-Check alle 30 Min, Empfehlungen alle 2h, Geburtstage täglich 08:00 ──
  cron.schedule("*/30 * * * *", () => {
    globalQueue.fuegeHinzu("loyalty_cards", { aktion: "check_cards" }, { prioritaet: 2 });

    // ── Subscription & Revenue Agent: Init + Sync beim Start ──
    globalQueue.fuegeHinzu("subscription_full_check", { aktion: "init_plans" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("subscription_sync", { aktion: "sync_subs" }, { prioritaet: 2 });
    // ── Sprint 8: Cross-Sell Engine beim Start ──
    globalQueue.fuegeHinzu("cross_sell_full", { aktion: "full_scan" }, { prioritaet: 2 });
    // ── Sprint 9: Conversion Optimizer beim Start ──
    globalQueue.fuegeHinzu("conversion_full", { aktion: "create_tests" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("conversion_analyze", { aktion: "analyze" }, { prioritaet: 2 });
    // ── Sprint 7.1: Aggressive Revenue Optimierungen beim Start ──
    globalQueue.fuegeHinzu("hara_scan", { aktion: "fast_revenue_scan" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "revenue_anomaly" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "auto_cross_sell" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("monetization_auto_optimize", { aktion: "dynamic_pricing" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("master_optimierung", { aktion: "revenue_priorisierung" }, { prioritaet: 1 });
  });
  cron.schedule("0 */2 * * *", () => {
    globalQueue.fuegeHinzu("loyalty_referrals", { aktion: "process_referrals" }, { prioritaet: 2 });
  });
  cron.schedule("0 8 * * *", () => {
    globalQueue.fuegeHinzu("loyalty_birthday", { aktion: "birthday_bonus" }, { prioritaet: 2 });
  });
  cron.schedule("0 3 * * *", () => {
    globalQueue.fuegeHinzu("loyalty_full_check", { aktion: "full_check" }, { prioritaet: 3 });
  // ── Auto-Healing: Fehlerhafte Agenten resetten (alle 5 Min) ──
  cron.schedule("*/5 * * * *", () => {
    db.select({ id: agentsTable.id, name: agentsTable.name, status: agentsTable.status })
      .from(agentsTable)
      .where(eq(agentsTable.status, "fehler"))
      .limit(20)
      .then((fehlerAgenten) => {
        for (const agent of fehlerAgenten) {
          logger.warn({ agentId: agent.id, agentName: agent.name }, "🔄 Auto-Healing: Resette fehlerhaften Agenten");
          db.update(agentsTable)
            .set({ status: "aktiv", letzteAktivitaet: new Date(), updatedAt: new Date() })
            .where(eq(agentsTable.id, agent.id))
            .then(() => {
              db.insert(agentLogsTable).values({
                agentId: agent.id,
                agentName: agent.name,
                aktion: "Auto-Healing: Reset",
                status: "erfolgreich",
                nachricht: "🔄 Auto-Healing: Agent von fehler → aktiv zurückgesetzt",
              }).catch(() => {});
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  });

  });

  // ── HARA Fast-Revenue-Scan alle 5 Minuten (Sprint 7.1 Optimierung) ──
  cron.schedule("*/5 * * * *", () => {
    globalQueue.fuegeHinzu("hara_scan", { aktion: "fast_revenue_scan" }, { prioritaet: 1 });
  });
  // ── RevenueAnomaly alle 15 Minuten (Sprint 7.1 Optimierung) ──
  cron.schedule("*/15 * * * *", () => {
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "revenue_anomaly" }, { prioritaet: 2 });
  });
  // ── Auto Cross-Sell alle 30 Minuten (Sprint 7.1 Optimierung) ──
  cron.schedule("*/30 * * * *", () => {
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "auto_cross_sell" }, { prioritaet: 2 });
  });
  // ── Dynamic Pricing alle 60 Minuten (Sprint 7.1 Optimierung) ──
  cron.schedule("0 * * * *", () => {
    globalQueue.fuegeHinzu("monetization_auto_optimize", { aktion: "dynamic_pricing" }, { prioritaet: 2 });
  });
  // ── Master Revenue-Priorisierung alle 10 Minuten (Sprint 7.1 Optimierung) ──
  cron.schedule("*/5 * * * *", () => {
    globalQueue.fuegeHinzu("master_optimierung", { aktion: "revenue_priorisierung" }, { prioritaet: 1 });
  });
  // ── Auto Bundle alle 2 Stunden (Sprint 7.1 Optimierung) ──
  cron.schedule("0 */2 * * *", () => {
    globalQueue.fuegeHinzu("monetization_auto_optimize", { aktion: "auto_bundle" }, { prioritaet: 3 });
  });


  // ── Conversion Optimizer: Tests erstellen alle 30 Min, Analyse alle 15 Min, Apply alle 60 Min ──
  cron.schedule("*/30 * * * *", () => {
    globalQueue.fuegeHinzu("conversion_full", { aktion: "create_tests" }, { prioritaet: 2 });
  });
  cron.schedule("*/15 * * * *", () => {
    globalQueue.fuegeHinzu("conversion_analyze", { aktion: "analyze" }, { prioritaet: 2 });
  });
  cron.schedule("0 * * * *", () => {
    globalQueue.fuegeHinzu("conversion_apply", { aktion: "apply_winners" }, { prioritaet: 2 });
  });
  cron.schedule("0 */3 * * *", () => {
    globalQueue.fuegeHinzu("conversion_full", { aktion: "full_scan" }, { prioritaet: 3 });
  });
  // ── Cross-Sell Engine: Analyse alle 15 Min, Kampagnen alle 30 Min, Optimierung alle 2h ──
  cron.schedule("*/15 * * * *", () => {
    globalQueue.fuegeHinzu("cross_sell_analyze", { aktion: "analyze" }, { prioritaet: 2 });
  });
  cron.schedule("*/30 * * * *", () => {
    globalQueue.fuegeHinzu("cross_sell_send", { aktion: "send_campaigns" }, { prioritaet: 2 });
  });
  cron.schedule("0 */2 * * *", () => {
    globalQueue.fuegeHinzu("cross_sell_optimize", { aktion: "optimize" }, { prioritaet: 3 });
  });
  cron.schedule("0 */4 * * *", () => {
    globalQueue.fuegeHinzu("cross_sell_full", { aktion: "full_scan" }, { prioritaet: 3 });
  });
  // ── Subscription & Revenue Agent: Sync alle 15 Min, Dunning alle 2h, Forecast täglich 07:00 ──
  cron.schedule("\*\/15 \* \* \* \*", () => {
    globalQueue.fuegeHinzu("subscription_sync", { aktion: "sync_subs" }, { prioritaet: 2 });
    // ── Sprint 8: Cross-Sell Engine beim Start ──
    globalQueue.fuegeHinzu("cross_sell_full", { aktion: "full_scan" }, { prioritaet: 2 });
    // ── Sprint 9: Conversion Optimizer beim Start ──
    globalQueue.fuegeHinzu("conversion_full", { aktion: "create_tests" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("conversion_analyze", { aktion: "analyze" }, { prioritaet: 2 });
    // ── Sprint 7.1: Aggressive Revenue Optimierungen beim Start ──
    globalQueue.fuegeHinzu("hara_scan", { aktion: "fast_revenue_scan" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "revenue_anomaly" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "auto_cross_sell" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("monetization_auto_optimize", { aktion: "dynamic_pricing" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("master_optimierung", { aktion: "revenue_priorisierung" }, { prioritaet: 1 });
  });
  cron.schedule("0 \*\/2 \* \* \*", () => {
    globalQueue.fuegeHinzu("subscription_dunning", { aktion: "dunning" }, { prioritaet: 1 });
  });
  cron.schedule("0 7 \* \* \*", () => {
    globalQueue.fuegeHinzu("subscription_forecast", { aktion: "forecast" }, { prioritaet: 2 });
  });
  cron.schedule("0 \*\/4 \* \* \*", () => {
    globalQueue.fuegeHinzu("subscription_full_check", { aktion: "full_check" }, { prioritaet: 3 });
  });
  });
}

import { db } from "@workspace/db";
import { agentsTable, agentLogsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { openai } from "../lib/openaiClient";
import { sendEmail } from "../lib/emailClient";
import { sendAgentAlert, sendSystemAlert, sendUmsatzAlert } from "../lib/pushNotifications";
import { globalQueue } from "./JobQueue";
import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { InfluencerAgent } from "./InfluencerAgent";
import { RevenueAgent } from "./RevenueAgentModule";
import { MonetizationAgent } from "./MonetizationAgent";
import { MasterAgent } from "./MasterAgent";
import { RevenueAnalystAgent } from "./RevenueAnalystAgent";
import { AffiliateRegistrarAgent } from "./AffiliateRegistrarAgent";
import { FinanceTeamAgent } from "./FinanceTeamAgent";
import { HaraAgent } from "./HaraAgent";
import { SmartCouponAgent } from "./SmartCouponAgent";
import { AbandonedCartRecoveryAgent } from "./AbandonedCartRecoveryAgent";
import { LoyaltyAgent } from "./LoyaltyAgent";
import { AffiliateAutomationAgent } from "./AffiliateAutomationAgent";
import { SalesChatAgent } from "./SalesChatAgent";
import { SubscriptionAgent } from "./SubscriptionAgent";
import { CrossSellAgent } from "./CrossSellAgent";
import { ConversionOptimizerAgent } from "./ConversionOptimizerAgent";
import { EmailSequenceAgent } from "./EmailSequenceAgent";
import { ReachSwarmAgent } from "./reachSwarmAgent";
import { LlmRoutingChangerAgent } from "./llmRoutingChangerAgent";
import { LiveProblemLoeserAgent } from "./liveProblemLoeserAgent";
import { scanneNeueProdukte, synchronisiereVerkaeufe, optimierePreiseUndPausiereFlops } from "./digitalproduktAgent";
import { generiereSeoArtikel } from "./seoContentAgent";
import { erstelleFehlendeSequenzen, versendeFaelligeEmails } from "./emailListenAgent";
import { generiereFacelessVideo, veroeffentlicheFaelligeVideos, analysiereUndOptimiere as analysiereFacelessVideos } from "./facelessVideoAgent";
import { recycleContent } from "./contentRecyclingAgent";
import { starteWatchdog, stoppeWatchdog } from "./watchdog";
import { startAutoUpdateAgent } from "./autoUpdateAgent";
import { scanneExpansionChancen } from "./expansionAgent";
import { fuehreStrategieAnalyseDurch } from "./directorAgent";
import { analysiereUmsatz } from "./revenueAgent";
import { generiereContent } from "./contentAgent";
import { analysiereTrends } from "./trendAnalystAgent";
import { generiereVideoSkript } from "./videoAgent";
import { posteAutonomAufSocialMedia } from "./socialMediaPoster";
import { optimiereSales } from "./salesAgent";
import { generiereFunnelSequenz } from "./funnelAgent";
import { verarbeiteCommunitiy } from "./communityAgent";

// ─── Agent-Registry ─────────────────────────────────────────────────────────

const AGENT_DEFINITIONEN = [
  { name: "Director Agent",           typ: "director",           beschreibung: "Strategisches Gehirn — analysiert KPIs und optimiert die Systemausrichtung täglich" },
  { name: "Trend Analyst Agent",      typ: "trend_analyst",      beschreibung: "Überwacht TikTok, Instagram, YouTube und Google Trends und generiert sofort passenden Content" },
  { name: "Content Factory Agent",    typ: "content_factory",    beschreibung: "Generiert täglich automatisch Content für alle 3 Marken via OpenAI GPT-4o-mini" },
  { name: "Video Agent",              typ: "video",              beschreibung: "Erstellt vollständige Video-Skripte mit Hook, Hauptinhalt, CTA und Thumbnail-Text" },
  { name: "Sales Agent",              typ: "sales",              beschreibung: "Optimiert Verkaufstexte, Headlines, CTAs und entwickelt Upsell-Strategien" },
  { name: "Funnel Agent",             typ: "funnel",             beschreibung: "Generiert E-Mail-Sequenzen und Nurturing-Funnels für alle 3 Marken" },
  { name: "Community Agent",          typ: "community",          beschreibung: "Erstellt Kommentar-Antworten, DM-Vorlagen und Lead-Qualifizierungs-Fragen" },
  { name: "Revenue Optimizer Agent",  typ: "revenue_optimizer",  beschreibung: "Analysiert Echtzeit-Umsatzdaten, ROI und Kampagnen-Performance" },
  { name: "Influencer Agent",         typ: "influencer",         beschreibung: "Verwaltet Influencer-Content, analysiert Trends und optimiert Engagement" },
  { name: "Revenue Agent",            typ: "revenue",            beschreibung: "Echtzeit-Umsatzanalyse, Wachstumsraten-Berechnung und Forecasting" },
  { name: "Monetization Agent",       typ: "monetization",       beschreibung: "Funnel-Optimierung, Upsell-Strategien, Affiliate-Analyse und Preisoptimierung" },
  { name: "Master Agent",             typ: "master",             beschreibung: "Zentrale Kommandozentrale — koordiniert alle Agenten, setzt Prioritäten, optimiert das Gesamtsystem kontinuierlich" },
  { name: "Revenue Analyst Agent",    typ: "revenue_analyst",    beschreibung: "Scannt Affiliate-Programme, findet echte Umsatzchancen, erstellt Stripe Payment Links — aktiv bei echtem Umsatz" },
  // ─── Expansion-Team (4 neue Agenten) ────────────────────────────────────────
  { name: "Opportunity Scanner Agent", typ: "expansion_scanner", beschreibung: "Durchsucht 50+ Plattformen nach kostenlosen Umsatzquellen — Digistore24, Gumroad, TikTok, YouTube, Coaching, Freelance. Kostenlose Chancen zuerst." },
  { name: "ROI Validator Agent",       typ: "roi_validator",     beschreibung: "Prüft jede Expansion-Chance auf ROI — blockiert alle Ausgaben wenn Umsatz < 200% der Kosten. Sichert Profitabilität." },
  { name: "Growth Hacker Agent",       typ: "growth_hacker",     beschreibung: "Entwickelt virale Content-Strategien und organische Wachstums-Hebel ohne Werbekosten. Fokus: TikTok-Algorithmus, SEO, Virality." },
  { name: "Partnership Scout Agent",   typ: "partnership_scout", beschreibung: "Identifiziert Affiliate-Netzwerke, JV-Partner und Cross-Promotions. Erstellt automatisch Kooperations-Templates." },
  { name: "Micro-Trading Agent",       typ: "micro_trading",     beschreibung: "Analysiert Krypto-Marktdaten und führt autonome Papertrades mit Self-Optimization aus." },
  // ─── Finance-Optimierungs-Team ───────────────────────────────────────────
  { name: "Affiliate-Registrierungs-Agent", typ: "affiliate_registrar", beschreibung: "Bereitet fertige Registrierungs-Links + Anleitungen für Affiliate-Programme vor — Operator bestätigt, Link fließt automatisch ins System" },
  { name: "Finance-Optimierungs-Team",      typ: "finance_team",        beschreibung: "Koordiniert Revenue-, Affiliate- und Sales-Agenten zu einem Team, priorisiert Chancen und empfiehlt die nächsten Schritte" },
  // ─── HARA — Hyper-Autonomer Revenue Agent ────────────────────────────────
  { name: "HARA — Hyper-Autonomer Revenue Agent", typ: "hara", beschreibung: "Rekursiver 4-Phasen-Loop: findet aggressiv skalierbare Revenue-Pakete, wartet auf CONFIRM, setzt autonom um und lernt aus jedem Ergebnis (Self-Optimization)" },
  // ─── Neue autonome Revenue-Agenten ────────────────────────────────────────
  { name: "Digitalprodukt-Katalog-Agent", typ: "digitalprodukt_katalog", beschreibung: "Generiert neue Digitalprodukt-Ideen, erstellt echte Stripe-Produkte + Payment-Links, testet Preispunkte (A/B) und pausiert Flops ohne Verkäufe automatisch" },
  { name: "SEO-Content-Empire-Agent", typ: "seo_content_empire", beschreibung: "Generiert autonom SEO-optimierte Artikel zu profitablen Keywords, veröffentlicht sie über öffentlich crawlbare Seiten und verlinkt Digitalprodukte zur Monetarisierung" },
  { name: "E-Mail-Listen-Monetarisierungs-Agent", typ: "email_listen_monetarisierung", beschreibung: "Erfasst echte Leads, generiert KI-Nurture-Sequenzen pro Marke, versendet fällige E-Mails automatisch per Webhook und trackt echte Klicks/Conversions auf Digitalprodukte" },
  { name: "Faceless-Video-Auto-Publish-Agent", typ: "faceless_video_auto_publish", beschreibung: "3-Phasen-Loop: generiert Faceless-Video-Skripte + Thumbnails per KI, veröffentlicht sie automatisch via Webhook mit Plattform-Rate-Limits und optimiert anhand echter Performance-Daten" },
  { name: "Content-Recycling-Agent", typ: "content_recycling", beschreibung: "Findet echte Top-Performer-Inhalte (Aufrufe), erstellt daraus per KI neue Varianten für andere Formate/Plattformen und speist sie automatisch in die Auto-Post-Pipeline ein" },
  { name: "Conversion Optimizer Agent", typ: "conversion_optimizer", beschreibung: "AUTONOM: Erstellt A/B-Tests, tracked Conversions, berechnet Signifikanz, wendet Gewinner automatisch an" },
  { name: "Cross-Sell Engine Agent", typ: "cross_sell", beschreibung: "AUTONOM: Analysiert Käufe, erstellt KI-Produktempfehlungen und sendet personalisierte Multi-Channel-Kampagnen" },
  { name: "Subscription & Revenue Agent", typ: "subscription", beschreibung: "AUTONOM: Verwalte Abo-Pläne, wiederkehrende Zahlungen via Stripe, Dunning bei fehlgeschlagenen Zahlungen, Revenue-Forecasts" },
];

// ─── Sub-Agenten Instanzen ───────────────────────────────────────────────────

const subAgenten: AgentBase[] = [
  new InfluencerAgent(),
  new RevenueAgent(),
  new MonetizationAgent(),
  new MasterAgent(),
  new RevenueAnalystAgent(),
  new AffiliateRegistrarAgent(),
  new FinanceTeamAgent(),
  new HaraAgent(),
  new SmartCouponAgent(),
  new AbandonedCartRecoveryAgent(),
  new LoyaltyAgent(),
  new AffiliateAutomationAgent(),
  new SalesChatAgent(),
  new SubscriptionAgent(),
  new CrossSellAgent(),
  new ConversionOptimizerAgent(),
  new EmailSequenceAgent(),
  new ReachSwarmAgent(),
  new LlmRoutingChangerAgent(),
  new LiveProblemLoeserAgent(),
];

let mainLoopTimer: NodeJS.Timeout | null = null;
let mainLoopLaeuft = false;
let mainLoopZyklus = 0;

// ─── Initialisierung ─────────────────────────────────────────────────────────

async function automaticheDatenInitialisierung(): Promise<void> {
  try {
    const { produkteTable, revenueOpportunitiesTable, transactionsTable } = await import("@workspace/db");
    const prodCount = await db.select({ count: sql`COUNT(*)` }).from(produkteTable);
    const prodAnzahl = Number(prodCount[0]?.count ?? 0);
    const oppCount = await db.select({ count: sql`COUNT(*)` }).from(revenueOpportunitiesTable);
    const oppAnzahl = Number(oppCount[0]?.count ?? 0);

    if (prodAnzahl === 0 && oppAnzahl === 0) {
      logger.info("📦 Auto-Seeding: Erstelle initiale Revenue-Opportunities");
      const initialChancen = [
        { titel: "KI-Toolkit Premium Verkauf", kanal: "website", potenzial: "4700.00", prioritaet: 1, typ: "verkauf", status: "aktiv", beschreibung: "Hauptprodukt: KI-Toolkit" },
        { titel: "Revenue OS Abo-Modell", kanal: "in-app", potenzial: "9700.00", prioritaet: 1, typ: "abo", status: "aktiv", beschreibung: "Monatliches Revenue OS Abo" },
        { titel: "AI Consulting Sessions", kanal: "coaching", potenzial: "5000.00", prioritaet: 2, typ: "dienstleistung", status: "aktiv", beschreibung: "1:1 KI-Business-Consulting" },
        { titel: "Social Media AI Content", kanal: "social", potenzial: "2700.00", prioritaet: 2, typ: "content", status: "aktiv", beschreibung: "KI-Content für Social Media" },
        { titel: "YouTube Kanal Automation", kanal: "youtube", potenzial: "3500.00", prioritaet: 2, typ: "content", status: "aktiv", beschreibung: "YouTube Automation" },
      ];
      for (const c of initialChancen) {
        try { await db.insert(revenueOpportunitiesTable).values({ titel: c.titel, kanal: c.kanal, potenzial: c.potenzial, prioritaet: c.prioritaet, typ: c.typ, status: c.status, beschreibung: c.beschreibung, erstelltAm: new Date(), quelle: "Auto-Seeding" }); } catch {}
      }
      logger.info({ chancen: initialChancen.length }, "✅ Auto-Seeding: Revenue-Opportunities erstellt");

      try {
        const stripe = (await import("../lib/stripeClient")).getStripeClient();
        if (stripe) {
          const basisProdukte = [
            { name: "KI-Toolkit Premium", preis: 47.00, desc: "KI-Toolkit" },
            { name: "Revenue OS License", preis: 97.00, desc: "Revenue OS" },
            { name: "AI Content Package", preis: 27.00, desc: "AI Content" },
          ];
          for (const p of basisProdukte) {
            try {
              const sp = await stripe.products.create({ name: p.name, description: p.desc });
              const spr = await stripe.prices.create({ product: sp.id, unit_amount: Math.round(p.preis * 100), currency: "eur" });
              await db.insert(produkteTable).values({ name: p.name, preis: String(p.preis), beschreibung: p.desc, stripeProduktId: sp.id, stripePreisId: spr.id, aktiv: true, verkaeufeAnzahl: "0" });
            } catch {}
          }
          logger.info("✅ Auto-Seeding: Stripe-Produkte erstellt");
        }
      } catch {}
    } else {
      logger.info({ produkte: prodAnzahl, chancen: oppAnzahl }, "✅ Auto-Seeding: Daten bereits vorhanden");
    }
  } catch (err) {
    logger.warn({ err }, "Auto-Seeding nicht kritisch");
  }
}

export async function initialisiereAgenten(): Promise<void> {
  for (const def of AGENT_DEFINITIONEN) {
    const vorhandene = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.name, def.name))
      .limit(1);

    if (vorhandene.length === 0) {
      await db.insert(agentsTable).values({
        name: def.name,
        typ: def.typ,
        beschreibung: def.beschreibung,
        status: "wartend",
        fehlerAnzahl: 0,
        ausgefuehrtAufgaben: 0,
      });
    } else {
      // Beschreibung aktuell halten
      await db.update(agentsTable)
        .set({ beschreibung: def.beschreibung, updatedAt: new Date() })
        .where(eq(agentsTable.name, def.name));
    }
    logger.info({ agentName: def.name }, "Agent in DB initialisiert");
  }

  for (const agent of subAgenten) {
    try {
      await agent.initialisieren();
    } catch (err) {
      logger.warn({ err }, "Sub-Agent Initialisierung fehlgeschlagen (nicht kritisch)");
    }
  }

  registriereQueueHandler();
  globalQueue.starteVerarbeitungsschleife(5000);
  logger.info("Alle Agenten und Job-Queue initialisiert");
  
  // ═══════════════════════════════════════════════════════════════════
  // AUTO-SEEDING: Erstellt initiale Daten wenn keine existieren
  // ═══════════════════════════════════════════════════════════════════
  await automaticheDatenInitialisierung();
}

// ─── Job-Queue Handler ────────────────────────────────────────────────────────

function registriereQueueHandler(): void {
  // ── Influencer Agent ──
  globalQueue.registriereHandler("influencer_content", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof InfluencerAgent);
    if (!agent) throw new Error("InfluencerAgent nicht gefunden");
    return agent.fuehreAufgabeAus(aufgabe);
  });

  globalQueue.registriereHandler("influencer_trend_analyse", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof InfluencerAgent);
    if (!agent) throw new Error("InfluencerAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "trend_analyse" } });
  });

  // ── Revenue Agent ──
  globalQueue.registriereHandler("revenue_analyse", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof RevenueAgent);
    if (!agent) throw new Error("RevenueAgent nicht gefunden");
    return agent.fuehreAufgabeAus(aufgabe);
  });

  globalQueue.registriereHandler("revenue_forecast", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof RevenueAgent);
    if (!agent) throw new Error("RevenueAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "forecast_erstellen" } });
  });

  // ── Monetization Agent ──
  globalQueue.registriereHandler("monetization_funnel", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof MonetizationAgent);
    if (!agent) throw new Error("MonetizationAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "funnel_optimieren" } });
  });

  globalQueue.registriereHandler("monetization_affiliate", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof MonetizationAgent);
    if (!agent) throw new Error("MonetizationAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "affiliate_analyse" } });
  });

  // ── Master Agent ──
  globalQueue.registriereHandler("master_system_analyse", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof MasterAgent);
    if (!agent) throw new Error("MasterAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "system_analyse" } });
  });

  globalQueue.registriereHandler("master_optimierung", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof MasterAgent);
    if (!agent) throw new Error("MasterAgent nicht gefunden");
    const aktion = aufgabe.payload?.["aktion"] ?? "optimierung";
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion } });
  });

  globalQueue.registriereHandler("master_deep_optimierung", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof MasterAgent);
    if (!agent) throw new Error("MasterAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "deep_optimierung" } });
  });

  globalQueue.registriereHandler("master_chancen_priorisierung", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof MasterAgent);
    if (!agent) throw new Error("MasterAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "chancen_priorisierung" } });
  });

  // ── Revenue Analyst Agent ──
  globalQueue.registriereHandler("revenue_analyst_scan", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    // Push-Benachrichtigung bei neuen Chancen
    try {
      sendAgentAlert("Revenue Analyst", "aktiv", "Scan läuft").catch(() => {});
    } catch {}
    const agent = subAgenten.find(a => a instanceof RevenueAnalystAgent);
    if (!agent) throw new Error("RevenueAnalystAgent nicht gefunden");
    const aktion = aufgabe.payload?.["aktion"] ?? "chancen_scannen";
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion } });
  });

  globalQueue.registriereHandler("revenue_analyst_stripe", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof RevenueAnalystAgent);
    if (!agent) throw new Error("RevenueAnalystAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "stripe_link_erstellen" } });
  });

  globalQueue.registriereHandler("revenue_analyst_ki", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof RevenueAnalystAgent);
    if (!agent) throw new Error("RevenueAnalystAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "ki_chancen_analysieren" } });
  });


  // ── Revenue Analyst: Marketing-Kampagnen (generiert Content + Kampagnen) ──
  globalQueue.registriereHandler("marketing_kampagnen_erstellen", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof RevenueAnalystAgent);
    if (!agent) throw new Error("RevenueAnalystAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "marketing_kampagnen_erstellen" } });
  });

  
  // ── Monetization: Auto-Optimize-All ──
  globalQueue.registriereHandler("monetization_auto_optimize", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof MonetizationAgent);
    if (!agent) throw new Error("MonetizationAgent nicht gefunden");
    const aktion = aufgabe.payload?.["aktion"] ?? "auto_optimize_all";
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion } });
  });

  // ── Monetization: Upsell-Strategie ──
  globalQueue.registriereHandler("monetization_upsell", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof MonetizationAgent);
    if (!agent) throw new Error("MonetizationAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "upsell_strategie" } });
  });

  // ── Monetization: Preisoptimierung ──
  globalQueue.registriereHandler("monetization_preisoptimierung", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof MonetizationAgent);
    if (!agent) throw new Error("MonetizationAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "preisoptimierung" } });
  });
  // ── Finance-Optimierungs-Team ──
  globalQueue.registriereHandler("affiliate_registrar_vorbereiten", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof AffiliateRegistrarAgent);
    if (!agent) throw new Error("AffiliateRegistrarAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "registrierungen_vorbereiten" } });
  });

  globalQueue.registriereHandler("affiliate_registrar_bestaetigen", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof AffiliateRegistrarAgent);
    if (!agent) throw new Error("AffiliateRegistrarAgent nicht gefunden");
    return agent.fuehreAufgabeAus(aufgabe);
  });

  globalQueue.registriereHandler("finance_team_analyse", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof FinanceTeamAgent);
    if (!agent) throw new Error("FinanceTeamAgent nicht gefunden");
    return agent.fuehreAufgabeAus(aufgabe);
  });

  // ── HARA — Hyper-Autonomer Revenue Agent ──
  globalQueue.registriereHandler("hara_scan", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof HaraAgent);
    if (!agent) throw new Error("HaraAgent nicht gefunden");
    const aktion = aufgabe.payload?.["aktion"] ?? "scan";
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { ...aufgabe.payload, aktion } });
  });

  globalQueue.registriereHandler("hara_ausfuehrung", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof HaraAgent);
    if (!agent) throw new Error("HaraAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { ...aufgabe.payload, aktion: "ausfuehrung" } });
  });

  // ── Trend Analyst (direkte Funktion) ──
  globalQueue.registriereHandler("trend_analyse", async (): Promise<AufgabeErgebnis> => {
    const agentId = await holeAgentId("trend_analyst");
    if (!agentId) throw new Error("Trend Analyst Agent nicht in DB");
    const report = await analysiereTrends(agentId);
    return {
      success: true,
      message: `Trend-Analyse: ${report.topThemen?.slice(0, 2).join(", ")} | Plattform: ${report.empfohlenePlattform}`,
      metadaten: report as unknown as Record<string, unknown>,
    };
  });

  // ── Video Agent ──
  globalQueue.registriereHandler("video_skript", async (): Promise<AufgabeErgebnis> => {
    const agentId = await holeAgentId("video");
    if (!agentId) throw new Error("Video Agent nicht in DB");
    const skript = await generiereVideoSkript(agentId);
    return {
      success: true,
      message: `Video-Skript generiert: "${skript.titel}" | CTA: ${skript.callToAction?.substring(0, 50)}`,
      metadaten: skript as unknown as Record<string, unknown>,
    };
  });

  // ── Sales Agent ──
  globalQueue.registriereHandler("sales_optimierung", async (): Promise<AufgabeErgebnis> => {
    const agentId = await holeAgentId("sales");
    if (!agentId) throw new Error("Sales Agent nicht in DB");
    const opt = await optimiereSales(agentId);
    return {
      success: true,
      message: `Sales-Optimierung: "${opt.kampagneName}" | Headline: ${opt.optimierteHeadline?.substring(0, 60)}`,
      metadaten: opt as unknown as Record<string, unknown>,
    };
  });

  // ── SPRING 63: Metered Upsell Trigger (Sales Agent) ────────────────────────
  // Wird automatisch bei 80% des monatlichen Token-/Lead-Budgets getriggert
  // (costGuardrail.pruefeUndTriggerUpsell) und startet eine intern erstellte
  // E-Mail-Nurturing-Sequenz zur Upgrade-Einladung auf die nächsthöhere Stufe.
  globalQueue.registriereHandler("sales_upsell_nurture", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const p = aufgabe.payload as {
      tenantName?: string;
      tenantId?: number;
      aktuellerPlan?: string;
      naechsteStufe?: string;
      tokenQuote?: number;
      leadQuote?: number;
    };

    const agentId = await holeAgentId("sales");

    // E-Mail-Adresse: Tenant-Name ist bei Auto-Provisioning die E-Mail
    const empfaenger = p.tenantName && p.tenantName.includes("@") ? p.tenantName : null;

    // 1. Upgrade-E-Mail intern erstellen (Sales-Agent, GPT-4o-mini)
    let betreff = `Ihr ${p.aktuellerPlan ?? "Starter"}-Plan ist fast ausgeschöpft — Upgrade auf ${p.naechsteStufe ?? "Pro"}`;
    let inhalt = `Sie haben diese Monat bereits 80% Ihres Budgets im CyberSarah Revenue OS genutzt. Ein Upgrade auf ${p.naechsteStufe ?? "Pro"} sichert Ihnen mehr Agenten-Kapazität, ohne Unterbrechung.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Du bist der Sales Agent eines B2B-SaaS (CyberSarah Revenue OS). Schreibe eine kurze, wertschätzende Upgrade-Einladung (max. 150 Wörter, Deutsch, DU-los = Sie-Form). Erwähne konkret, dass 80% des monatlichen Budgets erreicht sind, und lade zum Upgrade ein. Kein Druck, kein Spam-Ton. Antworte NUR mit validem JSON: {\"betreff\": \"...\", \"inhalt\": \"...\"}",
          },
          {
            role: "user",
            content: `Aktueller Plan: ${p.aktuellerPlan ?? "lite"}. Nächste Stufe: ${p.naechsteStufe ?? "standard"}. Token-Quote: ${(p.tokenQuote ?? 0.8) * 100}%. Lead-Quote: ${(p.leadQuote ?? 0) * 100}%.`,
          },
        ],
        max_tokens: 400,
        temperature: 0.5,
        response_format: { type: "json_object" },
      });
      const geparst = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { betreff?: string; inhalt?: string };
      if (geparst.betreff) betreff = geparst.betreff;
      if (geparst.inhalt) inhalt = geparst.inhalt;
    } catch (err) {
      logger.warn({ err }, "Upsell-E-Mail KI-Entwurf fehlgeschlagen — Fallback-Text verwendet");
    }

    // 2. Versand (Blacklist-Prüfung + Opt-out-Footer laufen automatisch über sendEmail)
    if (empfaenger) {
      const result = await sendEmail({
        to: empfaenger,
        subject: betreff,
        html: `<div style="font-family:system-ui;max-width:560px"><h2>${betreff}</h2><p>${inhalt.replace(/\n/g, "<br/>")}</p></div>`,
        text: inhalt,
        tags: { kategorie: "outreach", typ: "upsell_nurture", tenantId: String(p.tenantId ?? "") },
      });

      if (agentId) {
        await db.insert(agentLogsTable).values({
          agentId,
          agentName: "Sales Agent",
          aktion: "Metered Upsell Trigger",
          status: result.success ? "erfolgreich" : "fehler",
          nachricht: `80%-Schwelle: Upgrade-Einladung ${p.aktuellerPlan} → ${p.naechsteStufe} ${result.success ? "gesendet" : "fehlgeschlagen"}`,
          metadaten: JSON.stringify({ tenantId: p.tenantId, versendet: result.success, messageId: result.messageId ?? null }),
        });
      }

      return {
        success: result.success,
        message: `Upsell-Nurturing: Upgrade-Einladung ${p.aktuellerPlan} → ${p.naechsteStufe} ${result.success ? "an Tenant gesendet" : "fehlgeschlagen"}`,
        metadaten: { tenantId: p.tenantId, versendet: result.success },
      };
    }

    // Keine E-Mail-Adresse verfügbar → Lead im System protokollieren
    if (agentId) {
      await db.insert(agentLogsTable).values({
        agentId,
        agentName: "Sales Agent",
        aktion: "Metered Upsell Trigger",
        status: "erfolgreich",
        nachricht: `80%-Schwelle erreicht (${p.tenantId ?? "?"}) — Entwurf erstellt, Versand mangels E-Mail-Adresse ausstehend`,
        metadaten: JSON.stringify({ betreff, tenantId: p.tenantId ?? null }),
      });
    }
    return {
      success: true,
      message: `Upsell-Entwurf erstellt (${p.aktuellerPlan} → ${p.naechsteStufe}); keine Versand-E-Mail für Tenant hinterlegt`,
      metadaten: { betreff },
    };
  });

  // ── Funnel Agent ──
  globalQueue.registriereHandler("funnel_sequenz", async (): Promise<AufgabeErgebnis> => {
    const agentId = await holeAgentId("funnel");
    if (!agentId) throw new Error("Funnel Agent nicht in DB");
    const seq = await generiereFunnelSequenz(agentId);
    return {
      success: true,
      message: `E-Mail-Sequenz "${seq.sequenzName}": ${seq.emails?.length ?? 0} E-Mails für ${seq.marke}`,
      metadaten: { sequenzName: seq.sequenzName, marke: seq.marke, emailAnzahl: seq.emails?.length },
    };
  });

  // ── Community Agent ──
  globalQueue.registriereHandler("community_management", async (): Promise<AufgabeErgebnis> => {
    const agentId = await holeAgentId("community");
    if (!agentId) throw new Error("Community Agent nicht in DB");
    const report = await verarbeiteCommunitiy(agentId);
    return {
      success: true,
      message: `Community ${report.marke}: ${report.kommentarAntworten?.length ?? 0} Antworten | DM-Vorlage generiert`,
      metadaten: { marke: report.marke, antworten: report.kommentarAntworten?.length },
    };
  });

  // ── Digitalprodukt-Katalog-Agent ──
  globalQueue.registriereHandler("digitalprodukt_scan", async (): Promise<AufgabeErgebnis> => {
    const ergebnis = await scanneNeueProdukte();
    return {
      success: ergebnis.fehler.length === 0 || ergebnis.erstellt > 0,
      message: `Digitalprodukt-Scan: ${ergebnis.erstellt} neue Produkte erstellt, ${ergebnis.fehler.length} Fehler`,
      metadaten: ergebnis as unknown as Record<string, unknown>,
    };
  });

  globalQueue.registriereHandler("digitalprodukt_verkaeufe_sync", async (): Promise<AufgabeErgebnis> => {
    const ergebnis = await synchronisiereVerkaeufe();
    return { success: true, message: `Digitalprodukt-Sync: ${ergebnis.aktualisiert} Produkte mit echten Stripe-Verkäufen aktualisiert` };
  });

  globalQueue.registriereHandler("digitalprodukt_optimieren", async (): Promise<AufgabeErgebnis> => {
    const ergebnis = await optimierePreiseUndPausiereFlops();
    return {
      success: true,
      message: `Digitalprodukt-Optimierung: ${ergebnis.preistestsGestartet} Preistests gestartet, ${ergebnis.pausiert} Flops pausiert`,
      metadaten: ergebnis as unknown as Record<string, unknown>,
    };
  });

  // ── SEO-Content-Empire-Agent ──
  globalQueue.registriereHandler("seo_content_scan", async (): Promise<AufgabeErgebnis> => {
    const ergebnis = await generiereSeoArtikel();
    return {
      success: ergebnis.fehler.length === 0 || ergebnis.erstellt > 0,
      message: `SEO-Content-Scan: ${ergebnis.erstellt} neue Artikel veröffentlicht, ${ergebnis.fehler.length} Fehler`,
      metadaten: ergebnis as unknown as Record<string, unknown>,
    };
  });

  // ── E-Mail-Listen-Monetarisierungs-Agent ──
  globalQueue.registriereHandler("email_sequenzen_erstellen", async (): Promise<AufgabeErgebnis> => {
    const ergebnis = await erstelleFehlendeSequenzen();
    return {
      success: true,
      message: `E-Mail-Sequenzen: ${ergebnis.erstellt} neue Sequenzen erstellt`,
      metadaten: ergebnis as unknown as Record<string, unknown>,
    };
  });

  globalQueue.registriereHandler("email_versenden", async (): Promise<AufgabeErgebnis> => {
    const ergebnis = await versendeFaelligeEmails();
    return {
      success: true,
      message: `E-Mail-Versand: ${ergebnis.versendet} fällige E-Mails versendet`,
      metadaten: ergebnis as unknown as Record<string, unknown>,
    };
  });

  // ── Faceless-Video-Auto-Publish-Agent ──
  globalQueue.registriereHandler("faceless_video_generieren", async (): Promise<AufgabeErgebnis> => {
    const video = await generiereFacelessVideo();
    return {
      success: video !== null,
      message: video ? `Faceless-Video generiert: "${video.thema}"` : "Faceless-Video-Generierung übersprungen (Pause/Fehler)",
      metadaten: video ? { id: video.id, marke: video.marke, plattform: video.plattform } : undefined,
    };
  });

  globalQueue.registriereHandler("faceless_video_veroeffentlichen", async (): Promise<AufgabeErgebnis> => {
    const ergebnis = await veroeffentlicheFaelligeVideos();
    return {
      success: true,
      message: `Faceless-Video-Veröffentlichung: ${ergebnis.veroeffentlicht} veröffentlicht, ${ergebnis.uebersprungen} übersprungen`,
      metadaten: ergebnis as unknown as Record<string, unknown>,
    };
  });

  globalQueue.registriereHandler("faceless_video_analysieren", async (): Promise<AufgabeErgebnis> => {
    const ergebnis = await analysiereFacelessVideos();
    return {
      success: true,
      message: `Faceless-Video-Analyse: ${ergebnis.analysiert} analysiert, ${ergebnis.pausiert} pausiert`,
      metadaten: ergebnis as unknown as Record<string, unknown>,
    };
  });

  // ── Content-Recycling-Agent ──
  globalQueue.registriereHandler("content_recyceln", async (): Promise<AufgabeErgebnis> => {
    const ergebnis = await recycleContent();
    return {
      success: true,
      message: `Content-Recycling: ${ergebnis.recycelt} Variante(n) erstellt — ${ergebnis.details.join("; ")}`,
      metadaten: ergebnis as unknown as Record<string, unknown>,
    };
  });

  // ── Expansion Scanner ──
  globalQueue.registriereHandler("expansion_scan", async (): Promise<AufgabeErgebnis> => {
    const agentId = await holeAgentId("expansion_scanner");
    const result = await scanneExpansionChancen(agentId ?? 0);
    return {
      success: true,
      message: `Expansion-Scan: ${result.entdeckt} Chancen gescannt, ${result.gespeichert} neu gespeichert`,
      metadaten: { entdeckt: result.entdeckt, gespeichert: result.gespeichert },
    };
  });

  // ── Fehler-Events ──
  globalQueue.on("job:fehlgeschlagen", (aufgabe, fehler) => {
    logger.error({ aufgabeId: aufgabe.id, typ: aufgabe.typ, fehler }, "Job endgültig fehlgeschlagen");
  });
  globalQueue.on("job:wiederholt", (aufgabe, versuch, wartezeit) => {
    logger.warn({ aufgabeId: aufgabe.id, versuch, wartezeit }, "Job wird wiederholt");
  });


  // ── Smart Coupon Agent ──
  globalQueue.registriereHandler("smart_coupon_init", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof SmartCouponAgent);
    if (!agent) throw new Error("SmartCouponAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "init_coupons" } });
  });
  globalQueue.registriereHandler("smart_coupon_ki", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof SmartCouponAgent);
    if (!agent) throw new Error("SmartCouponAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "ki_coupons" } });
  });
  globalQueue.registriereHandler("smart_coupon_optimize", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof SmartCouponAgent);
    if (!agent) throw new Error("SmartCouponAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "auto_optimize" } });
  });
  globalQueue.registriereHandler("smart_coupon_flash", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof SmartCouponAgent);
    if (!agent) throw new Error("SmartCouponAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "flash_sale" } });
  });

  // ── AI Sales Chat Agent ──
  globalQueue.registriereHandler("sales_chat_analyze", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof SalesChatAgent);
    if (!agent) throw new Error("SalesChatAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "analyze" } });
  });
  globalQueue.registriereHandler("sales_chat_followup", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof SalesChatAgent);
    if (!agent) throw new Error("SalesChatAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "followup" } });
  });
  // ── Subscription & Revenue Agent ──
  globalQueue.registriereHandler("subscription_full_check", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof SubscriptionAgent);
    if (!agent) throw new Error("SubscriptionAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: aufgabe.payload?.["aktion"] ?? "full_check" } });
  });
  globalQueue.registriereHandler("subscription_sync", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof SubscriptionAgent);
    if (!agent) throw new Error("SubscriptionAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "sync_subs" } });
  });
  globalQueue.registriereHandler("subscription_dunning", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof SubscriptionAgent);
    if (!agent) throw new Error("SubscriptionAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "dunning" } });
  });
  globalQueue.registriereHandler("subscription_forecast", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof SubscriptionAgent);
    if (!agent) throw new Error("SubscriptionAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "forecast" } });
  });

  // ── Cross-Sell Engine Agent ──
  globalQueue.registriereHandler("cross_sell_full", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof CrossSellAgent);
    if (!agent) throw new Error("CrossSellAgent nicht gefunden");
    const aktion = aufgabe.payload?.["aktion"] ?? "full_scan";
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion } });
  });
  globalQueue.registriereHandler("cross_sell_analyze", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof CrossSellAgent);
    if (!agent) throw new Error("CrossSellAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "analyze" } });
  });
  globalQueue.registriereHandler("cross_sell_send", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof CrossSellAgent);
    if (!agent) throw new Error("CrossSellAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "send_campaigns" } });
  });
  globalQueue.registriereHandler("cross_sell_optimize", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof CrossSellAgent);
    if (!agent) throw new Error("CrossSellAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "optimize" } });
  });

  // ── Conversion Optimizer Agent ──
  globalQueue.registriereHandler("conversion_full", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof ConversionOptimizerAgent);
    if (!agent) throw new Error("ConversionOptimizerAgent nicht gefunden");
    const aktion = aufgabe.payload?.["aktion"] ?? "full_scan";
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion } });
  });
  globalQueue.registriereHandler("conversion_analyze", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof ConversionOptimizerAgent);
    if (!agent) throw new Error("ConversionOptimizerAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "analyze" } });
  });
  globalQueue.registriereHandler("conversion_apply", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof ConversionOptimizerAgent);
    if (!agent) throw new Error("ConversionOptimizerAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "apply_winners" } });
  });
  // ── Affiliate Automation Agent ──
  globalQueue.registriereHandler("affiliate_full_sync", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof AffiliateAutomationAgent);
    if (!agent) throw new Error("AffiliateAutomationAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: aufgabe.payload?.["aktion"] ?? "full_sync" } });
  });
  globalQueue.registriereHandler("affiliate_commissions", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof AffiliateAutomationAgent);
    if (!agent) throw new Error("AffiliateAutomationAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "calculate_commissions" } });
  });
  globalQueue.registriereHandler("affiliate_payouts", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof AffiliateAutomationAgent);
    if (!agent) throw new Error("AffiliateAutomationAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "process_payouts" } });
  });
  globalQueue.registriereHandler("affiliate_tiers", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof AffiliateAutomationAgent);
    if (!agent) throw new Error("AffiliateAutomationAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "upgrade_tiers" } });
  });
  // ── Loyalty & Referral Agent ──
  globalQueue.registriereHandler("loyalty_full_check", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof LoyaltyAgent);
    if (!agent) throw new Error("LoyaltyAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: aufgabe.payload?.["aktion"] ?? "full_check" } });
  });
  globalQueue.registriereHandler("loyalty_cards", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof LoyaltyAgent);
    if (!agent) throw new Error("LoyaltyAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "check_cards" } });
  });
  globalQueue.registriereHandler("loyalty_referrals", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof LoyaltyAgent);
    if (!agent) throw new Error("LoyaltyAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "process_referrals" } });
  });
  globalQueue.registriereHandler("loyalty_birthday", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof LoyaltyAgent);
    if (!agent) throw new Error("LoyaltyAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "birthday_bonus" } });
  });

  // ── Abandoned Cart Recovery Agent ──
  globalQueue.registriereHandler("cart_recovery_check", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {

  // ── Sales Chat: Analyse stündlich, Follow-ups alle 30 Min ──
  cron.schedule("5 * * * *", () => {
    globalQueue.fuegeHinzu("sales_chat_analyze", { aktion: "analyze" }, { prioritaet: 3 });
  });
  cron.schedule("*/30 * * * *", () => {
    globalQueue.fuegeHinzu("sales_chat_followup", { aktion: "followup" }, { prioritaet: 2 });
  });
  // ── Affiliate: Provisionen stündlich, Tiers täglich, Payouts monatlich (1. Tag) ──
  cron.schedule("0 * * * *", () => {
    globalQueue.fuegeHinzu("affiliate_commissions", { aktion: "calculate_commissions" }, { prioritaet: 2 });
  });
  cron.schedule("0 2 * * *", () => {
    globalQueue.fuegeHinzu("affiliate_tiers", { aktion: "upgrade_tiers" }, { prioritaet: 2 });
  });
  cron.schedule("0 6 1 * *", () => {
    globalQueue.fuegeHinzu("affiliate_payouts", { aktion: "process_payouts" }, { prioritaet: 1 });
  });
  cron.schedule("0 */4 * * *", () => {
    globalQueue.fuegeHinzu("affiliate_full_sync", { aktion: "full_sync" }, { prioritaet: 3 });
  });
  // ── Loyalty & Referral: Karten-Check alle 30 Min, Empfehlungen alle 2h, Geburtstage täglich 08:00 ──
  cron.schedule("*/30 * * * *", () => {
    globalQueue.fuegeHinzu("loyalty_cards", { aktion: "check_cards" }, { prioritaet: 2 });

    // ── Subscription & Revenue Agent: Init + Sync beim Start ──
    globalQueue.fuegeHinzu("subscription_full_check", { aktion: "init_plans" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("subscription_sync", { aktion: "sync_subs" }, { prioritaet: 2 });
    // ── Sprint 8: Cross-Sell Engine beim Start ──
    globalQueue.fuegeHinzu("cross_sell_full", { aktion: "full_scan" }, { prioritaet: 2 });
    // ── Sprint 9: Conversion Optimizer beim Start ──
    globalQueue.fuegeHinzu("conversion_full", { aktion: "create_tests" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("conversion_analyze", { aktion: "analyze" }, { prioritaet: 2 });
    // ── Sprint 7.1: Aggressive Revenue Optimierungen beim Start ──
    globalQueue.fuegeHinzu("hara_scan", { aktion: "fast_revenue_scan" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "revenue_anomaly" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "auto_cross_sell" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("monetization_auto_optimize", { aktion: "dynamic_pricing" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("master_optimierung", { aktion: "revenue_priorisierung" }, { prioritaet: 1 });
  });
  cron.schedule("0 */2 * * *", () => {
    globalQueue.fuegeHinzu("loyalty_referrals", { aktion: "process_referrals" }, { prioritaet: 2 });
  });
  cron.schedule("0 8 * * *", () => {
    globalQueue.fuegeHinzu("loyalty_birthday", { aktion: "birthday_bonus" }, { prioritaet: 2 });
  });
  cron.schedule("0 3 * * *", () => {
    globalQueue.fuegeHinzu("loyalty_full_check", { aktion: "full_check" }, { prioritaet: 3 });
  // ── Auto-Healing: Fehlerhafte Agenten resetten (alle 5 Min) ──
  cron.schedule("*/5 * * * *", () => {
    db.select({ id: agentsTable.id, name: agentsTable.name, status: agentsTable.status })
      .from(agentsTable)
      .where(eq(agentsTable.status, "fehler"))
      .limit(20)
      .then((fehlerAgenten) => {
        for (const agent of fehlerAgenten) {
          logger.warn({ agentId: agent.id, agentName: agent.name }, "🔄 Auto-Healing: Resette fehlerhaften Agenten");
          db.update(agentsTable)
            .set({ status: "aktiv", letzteAktivitaet: new Date(), updatedAt: new Date() })
            .where(eq(agentsTable.id, agent.id))
            .then(() => {
              db.insert(agentLogsTable).values({
                agentId: agent.id,
                agentName: agent.name,
                aktion: "Auto-Healing: Reset",
                status: "erfolgreich",
                nachricht: "🔄 Auto-Healing: Agent von fehler → aktiv zurückgesetzt",
              }).catch(() => {});
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  });

  });
    const agent = subAgenten.find(a => a instanceof AbandonedCartRecoveryAgent);
    if (!agent) throw new Error("AbandonedCartRecoveryAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "check_carts" } });
  });
  globalQueue.registriereHandler("cart_recovery_stripe", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {

    // ── Loyalty & Referral: Programm init + erster Check ──
    globalQueue.fuegeHinzu("loyalty_full_check", { aktion: "init_program" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("loyalty_cards", { aktion: "check_cards" }, { prioritaet: 2 });

    // ── Subscription & Revenue Agent: Init + Sync beim Start ──
    globalQueue.fuegeHinzu("subscription_full_check", { aktion: "init_plans" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("subscription_sync", { aktion: "sync_subs" }, { prioritaet: 2 });
    // ── Sprint 8: Cross-Sell Engine beim Start ──
    globalQueue.fuegeHinzu("cross_sell_full", { aktion: "full_scan" }, { prioritaet: 2 });
    // ── Sprint 9: Conversion Optimizer beim Start ──
    globalQueue.fuegeHinzu("conversion_full", { aktion: "create_tests" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("conversion_analyze", { aktion: "analyze" }, { prioritaet: 2 });
    // ── Sprint 7.1: Aggressive Revenue Optimierungen beim Start ──
    globalQueue.fuegeHinzu("hara_scan", { aktion: "fast_revenue_scan" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "revenue_anomaly" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "auto_cross_sell" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("monetization_auto_optimize", { aktion: "dynamic_pricing" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("master_optimierung", { aktion: "revenue_priorisierung" }, { prioritaet: 1 });
    const agent = subAgenten.find(a => a instanceof AbandonedCartRecoveryAgent);
    if (!agent) throw new Error("AbandonedCartRecoveryAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "check_stripe" } });
  });
  globalQueue.registriereHandler("cart_recovery_stats", async (aufgabe: Aufgabe): Promise<AufgabeErgebnis> => {
    const agent = subAgenten.find(a => a instanceof AbandonedCartRecoveryAgent);
    if (!agent) throw new Error("AbandonedCartRecoveryAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "stats" } });

// ─── Auto-Seeding: Erstellt initiale Daten beim ersten Start ──────────────────


  });
  logger.info("Job-Queue Handler registriert");
}

// ─── Main-Loop (60-Sekunden-Zyklus) ─────────────────────────────────────────

async function mainLoop(): Promise<void> {
  if (mainLoopLaeuft) {
    logger.debug("Main-Loop: Voriger Zyklus läuft noch — überspringe");
    return;
  }

  mainLoopLaeuft = true;
  mainLoopZyklus++;
  const zyklusStart = Date.now();

  try {
    // Hängende Agenten erkennen (>5 Min aktiv ohne Update)
    const vorFuenfMinuten = new Date(Date.now() - 5 * 60 * 1000);
    const haengendeAgenten = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.status, "aktiv"))
      .limit(20);

    for (const agent of haengendeAgenten) {
      const letzteAktivitaet = agent.letzteAktivitaet;
      if (letzteAktivitaet && letzteAktivitaet < vorFuenfMinuten) {
        await db.update(agentsTable)
          .set({ status: "fehler", updatedAt: new Date() })
          .where(eq(agentsTable.id, agent.id));
        await db.insert(agentLogsTable).values({
          agentId: agent.id,
          agentName: agent.name,
          aktion: "Timeout erkannt",
          status: "fehler",
          nachricht: `Agent hängt seit ${Math.round((Date.now() - letzteAktivitaet.getTime()) / 1000)}s`,
        });
        logger.warn({ agentId: agent.id, agentName: agent.name }, "Hängender Agent zurückgesetzt");
      }
    }

    // Alle 3 Min: Master System-Check (höchste Priorität)
    if (mainLoopZyklus % 3 === 0) {
      globalQueue.fuegeHinzu("master_system_analyse", { aktion: "system_analyse" }, { prioritaet: 1, maxVersuche: 2 });
    }
    // Alle 5 Min: Revenue-Analyse
    if (mainLoopZyklus % 5 === 0) {
      globalQueue.fuegeHinzu("revenue_analyse", { aktion: "umsatz_analysieren" }, { prioritaet: 2, maxVersuche: 3 });
    }
    // Alle 15 Min: Sales + Monetization + Marketing-Kampagnen
    if (mainLoopZyklus % 15 === 0) {
      globalQueue.fuegeHinzu("sales_optimierung", {}, { prioritaet: 3 });
      globalQueue.fuegeHinzu("monetization_auto_optimize", { aktion: "auto_optimize_all" }, { prioritaet: 2 });
      globalQueue.fuegeHinzu("marketing_kampagnen_erstellen", { aktion: "marketing_kampagnen_erstellen" }, { prioritaet: 2 });
    }
    // Alle 30 Min: Upsell + Preisoptimierung (Revenue-Aktionen)
    if (mainLoopZyklus % 30 === 0) {
      globalQueue.fuegeHinzu("monetization_upsell", { aktion: "upsell_strategie" }, { prioritaet: 2 });
      globalQueue.fuegeHinzu("monetization_preisoptimierung", { aktion: "preisoptimierung" }, { prioritaet: 2 });

    // ── Smart Coupon Agent: Standard-Coupons initialisieren + KI-Coupons generieren ──
    globalQueue.fuegeHinzu("smart_coupon_init", { aktion: "init_coupons" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("smart_coupon_ki", { aktion: "ki_coupons" }, { prioritaet: 2 });

    // ── Abandoned Cart Recovery: Stripe-Sessions scannen ──
    globalQueue.fuegeHinzu("cart_recovery_stripe", { aktion: "check_stripe" }, { prioritaet: 1 });

    // ── Loyalty & Referral: Programm init + erster Check ──
    globalQueue.fuegeHinzu("loyalty_full_check", { aktion: "init_program" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("loyalty_cards", { aktion: "check_cards" }, { prioritaet: 2 });

    // ── Subscription & Revenue Agent: Init + Sync beim Start ──
    globalQueue.fuegeHinzu("subscription_full_check", { aktion: "init_plans" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("subscription_sync", { aktion: "sync_subs" }, { prioritaet: 2 });
    // ── Sprint 8: Cross-Sell Engine beim Start ──
    globalQueue.fuegeHinzu("cross_sell_full", { aktion: "full_scan" }, { prioritaet: 2 });
    // ── Sprint 9: Conversion Optimizer beim Start ──
    globalQueue.fuegeHinzu("conversion_full", { aktion: "create_tests" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("conversion_analyze", { aktion: "analyze" }, { prioritaet: 2 });
    // ── Sprint 7.1: Aggressive Revenue Optimierungen beim Start ──
    globalQueue.fuegeHinzu("hara_scan", { aktion: "fast_revenue_scan" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "revenue_anomaly" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "auto_cross_sell" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("monetization_auto_optimize", { aktion: "dynamic_pricing" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("master_optimierung", { aktion: "revenue_priorisierung" }, { prioritaet: 1 });
    }
    // Alle 20 Min: Community Management
    if (mainLoopZyklus % 20 === 0) {
      globalQueue.fuegeHinzu("community_management", {}, { prioritaet: 3 });
    }
    // Alle 5 Min: Revenue Analyst Auto-Optimize (scan + stripe + performance)
    if (mainLoopZyklus % 5 === 0) {
      globalQueue.fuegeHinzu("revenue_analyst_auto", { aktion: "auto_optimize_all" }, { prioritaet: 1 });
    }
    // Alle 20 Min: Master Optimierung
    if (mainLoopZyklus % 20 === 0) {
      globalQueue.fuegeHinzu("master_optimierung", { aktion: "optimierung" }, { prioritaet: 1 });
    }
    // Alle 30 Min: Influencer Trend + Video + Stripe Links erstellen
    if (mainLoopZyklus % 30 === 0) {
      globalQueue.fuegeHinzu("influencer_trend_analyse", { aktion: "trend_analyse" }, { prioritaet: 3 });
      globalQueue.fuegeHinzu("video_skript", {}, { prioritaet: 3 });
      globalQueue.fuegeHinzu("revenue_analyst_stripe", { aktion: "stripe_link_erstellen" }, { prioritaet: 2 });
    }
    // Alle 2 Stunden: KI-Chancen-Analyse (OpenAI — nur wenn Umsatz-Kontext vorhanden)
    if (mainLoopZyklus % 120 === 0) {
      globalQueue.fuegeHinzu("revenue_analyst_ki", { aktion: "ki_chancen_analysieren" }, { prioritaet: 2 });
    }
    // Alle 6 Stunden: Forecast (360 Zyklen à 60s)
    if (mainLoopZyklus % 360 === 0) {
      globalQueue.fuegeHinzu("revenue_forecast", { aktion: "forecast_erstellen" }, { prioritaet: 2 });
    }
    // Alle 10 Min: Affiliate-Registrierungen vorbereiten
    if (mainLoopZyklus % 10 === 0) {
      globalQueue.fuegeHinzu("affiliate_registrar_vorbereiten", { aktion: "registrierungen_vorbereiten" }, { prioritaet: 2 });
    }
    // Alle 20 Min: Finance-Team-Report aktualisieren
    if (mainLoopZyklus % 20 === 0) {
      globalQueue.fuegeHinzu("finance_team_analyse", {}, { prioritaet: 2 });
    }
    // Alle Stunde: Queue bereinigen
    if (mainLoopZyklus % 60 === 0) {
      globalQueue.bereinige(3_600_000);
    }

    logger.debug({ zyklus: mainLoopZyklus, dauer: Date.now() - zyklusStart }, "Main-Loop Zyklus abgeschlossen");
  } catch (err) {
    logger.error({ err, zyklus: mainLoopZyklus }, "Kritischer Fehler im Main-Loop");
  } finally {
    mainLoopLaeuft = false;
  }
}

// ─── Cron-Jobs ────────────────────────────────────────────────────────────────

export function starteOrchestrator(): void {
  mainLoopTimer = setInterval(mainLoop, 60_000);
  setTimeout(mainLoop, 2000); // Erster Lauf nach 2s

  // ═══════════════════════════════════════════════════════════════════
  // UMSATZ & MONETISIERUNG (höchste Priorität)
  // ═══════════════════════════════════════════════════════════════════
  // HARA Scan: alle 3 Minuten — schnellste Revenue-Erkennung
  cron.schedule("*/3 * * * *", () => {
    globalQueue.fuegeHinzu("hara_scan", { aktion: "fast_revenue_scan", autoFix: true }, { prioritaet: 1 });
  });

  // Revenue Analyst: alle 5 Minuten — Umsatz-Anomalien + Cross-Sell
  cron.schedule("*/5 * * * *", () => {
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "revenue_anomaly" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "auto_cross_sell" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("revenue_analyst_stripe", { aktion: "stripe_link_erstellen" }, { prioritaet: 2 });
  });

  // Monetization Auto-Optimize: alle 10 Minuten
  cron.schedule("*/10 * * * *", () => {
    globalQueue.fuegeHinzu("monetization_auto_optimize", { aktion: "auto_optimize_all" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("monetization_upsell", { aktion: "upsell_strategie" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("monetization_preisoptimierung", { aktion: "preisoptimierung" }, { prioritaet: 2 });
  });

  // Abandoned Cart Recovery: alle 5 Minuten
  cron.schedule("*/5 * * * *", () => {
    globalQueue.fuegeHinzu("cart_recovery_stripe", { aktion: "check_stripe" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("cart_recovery_check", { aktion: "check_carts" }, { prioritaet: 1 });
  });

  // Cross-Sell + Conversion: alle 15 Minuten
  cron.schedule("*/15 * * * *", () => {
    globalQueue.fuegeHinzu("cross_sell_full", { aktion: "full_scan" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("conversion_full", { aktion: "create_tests" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("conversion_analyze", { aktion: "analyze" }, { prioritaet: 2 });
  });

  // Smart Coupon: KI-Coupons alle 6h, Optimierung alle 3h, Flash alle 8h
  cron.schedule("0 */6 * * *", () => {
    globalQueue.fuegeHinzu("smart_coupon_ki", { aktion: "ki_coupons" }, { prioritaet: 2 });
  });
  cron.schedule("0 */3 * * *", () => {
    globalQueue.fuegeHinzu("smart_coupon_optimize", { aktion: "auto_optimize" }, { prioritaet: 2 });
  });
  cron.schedule("0 */8 * * *", () => {
    globalQueue.fuegeHinzu("smart_coupon_flash", { aktion: "flash_sale" }, { prioritaet: 3 });
  });

  // ═══════════════════════════════════════════════════════════════════
  // KUNDENBINDUNG & LOYALTY
  // ═══════════════════════════════════════════════════════════════════
  // Loyalty: Tägliche Karten-Prüfung + Empfehlungen
  cron.schedule("0 8 * * *", () => {
    globalQueue.fuegeHinzu("loyalty_full_check", { aktion: "init_program" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("loyalty_cards", { aktion: "check_cards" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("loyalty_referrals", { aktion: "check_referrals" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("loyalty_birthday", { aktion: "birthday_coupons" }, { prioritaet: 3 });
  });

  // Subscriptions: Alle 30 Minuten prüfen
  cron.schedule("*/30 * * * *", () => {
    globalQueue.fuegeHinzu("subscription_full_check", { aktion: "init_plans" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("subscription_sync", { aktion: "sync_subs" }, { prioritaet: 2 });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AFFILIATE & PARTNER
  // ═══════════════════════════════════════════════════════════════════
  cron.schedule("0 * * * *", () => {
    globalQueue.fuegeHinzu("affiliate_commissions", { aktion: "calculate_commissions" }, { prioritaet: 2 });
  });
  cron.schedule("0 2 * * *", () => {
    globalQueue.fuegeHinzu("affiliate_tiers", { aktion: "upgrade_tiers" }, { prioritaet: 2 });
  });
  cron.schedule("0 6 1 * *", () => {
    globalQueue.fuegeHinzu("affiliate_payouts", { aktion: "process_payouts" }, { prioritaet: 1 });
  });
  cron.schedule("0 */4 * * *", () => {
    globalQueue.fuegeHinzu("affiliate_full_sync", { aktion: "full_sync" }, { prioritaet: 3 });
  });

  // ═══════════════════════════════════════════════════════════════════
  // VERTRIEB & KOMMUNIKATION
  // ═══════════════════════════════════════════════════════════════════
  cron.schedule("*/15 * * * *", () => {
    globalQueue.fuegeHinzu("sales_chat_analyze", { aktion: "analyze" }, { prioritaet: 3 });
    globalQueue.fuegeHinzu("sales_chat_followup", { aktion: "followup" }, { prioritaet: 2 });
  });

  // Director: tägliche Strategie um 06:00
  cron.schedule("0 6 * * *", () => {
    const agentId = holeAgentId("director");
    if (!agentId) return;
    fuehreAgentAus(agentId, () => {
      const agent = subAgenten.find(a => a instanceof DirectorAgent) as DirectorAgent | undefined;
      return agent?.fuehreStrategieAus();
    });
    globalQueue.fuegeHinzu("hara_scan", { aktion: "daily_revenue_report" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "daily_report" }, { prioritaet: 1 });
  });

  // Trend Analyst: alle 6h
  cron.schedule("0 */6 * * *", async () => {
    const agentId = await holeAgentId("trend_analyst");
    if (!agentId) return;
    fuehreAgentAus(agentId, () => analysiereTrends(agentId).then(() => {}));
  });

  // Content Factory: 08:00, 12:00, 18:00
  cron.schedule("0 8,12,18 * * *", async () => {
    const agentId = await holeAgentId("content_factory");
    if (!agentId) return;
    fuehreAgentAus(agentId, () => {
      const agent = subAgenten.find(a => a instanceof ContentAgent) as ContentAgent | undefined;
      return agent?.erstelleContentPipeline();
    });
  });

  // Video: 10:00, 16:00
  cron.schedule("0 10,16 * * *", async () => {
    const agentId = await holeAgentId("video");
    if (!agentId) return;
    fuehreAgentAus(agentId, () => {
      const agent = subAgenten.find(a => a instanceof VideoAgent) as VideoAgent | undefined;
      return agent?.erstelleVideoPipeline();
    });
  });

  // Social Media Auto-Post: 09:00, 15:00
  cron.schedule("0 9,15 * * *", async () => {
    const agentId = await holeAgentId("social");
    if (!agentId) return globalQueue.fuegeHinzu("social_auto_post", { aktion: "post_all" }, { prioritaet: 2 });
  });

  // SEO Content: 11:00
  cron.schedule("0 11 * * *", async () => {
    const agentId = await holeAgentId("seo_content");
    if (!agentId) return;
    fuehreAgentAus(agentId, () => {
      const agent = subAgenten.find(a => a instanceof SEOContentAgent) as SEOContentAgent | undefined;
      return agent?.erstelleSEOPipeline();
    });
  });

  // Community: 09:00, 13:00, 20:00
  cron.schedule("0 9,13,20 * * *", async () => {
    const agentId = await holeAgentId("community");
    if (!agentId) return;
    fuehreAgentAus(agentId, () => {
      const agent = subAgenten.find(a => a instanceof CommunityAgent) as CommunityAgent | undefined;
      return agent?.fuehreCommunityAufgabeAus();
    });
  });

  // Sales: 11:00, 17:00
  cron.schedule("0 11,17 * * *", async () => {
    const agentId = await holeAgentId("sales");
    if (!agentId) return;
    fuehreAgentAus(agentId, () => {
      const agent = subAgenten.find(a => a instanceof SalesAgent) as SalesAgent | undefined;
      return agent?.fuehreSalesPipelineAus();
    });
  });

  // Funnel: 07:00
  cron.schedule("0 7 * * *", async () => {
    const agentId = await holeAgentId("funnel");
    if (!agentId) return;
    fuehreAgentAus(agentId, () => {
      const agent = subAgenten.find(a => a instanceof FunnelAgent) as FunnelAgent | undefined;
      return agent?.fuehreFunnelOptimierungAus();
    });
  });

  // Revenue Optimizer: stündlich
  cron.schedule("0 * * * *", () => {
    globalQueue.fuegeHinzu("master_system_analyse", { aktion: "full_scan" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("master_optimierung", { aktion: "revenue_priorisierung" }, { prioritaet: 1 });
  });

  // Master: alle 30 Minuten
  cron.schedule("*/30 * * * *", () => {
    globalQueue.fuegeHinzu("master_system_analyse", { aktion: "system_analyse" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("master_optimierung", { aktion: "optimierung" }, { prioritaet: 1 });
  });

  // Influencer: 09:15, 15:15
  cron.schedule("15 9,15 * * *", async () => {
    const agentId = await holeAgentId("influencer");
    if (!agentId) return;
    fuehreAgentAus(agentId, () => {
      const agent = subAgenten.find(a => a instanceof InfluencerAgent) as InfluencerAgent | undefined;
      return agent?.fuehreInfluencerAufgabeAus();
    });
    globalQueue.fuegeHinzu("influencer_trend_analyse", { aktion: "trend_analyse" }, { prioritaet: 3 });
    globalQueue.fuegeHinzu("social_auto_post", { aktion: "post_all" }, { prioritaet: 2 });
  });

  // Finance-Team: Reporting alle 4h
  cron.schedule("0 */4 * * *", () => {
    globalQueue.fuegeHinzu("finance_team_analyse", { aktion: "analyse" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("revenue_forecast", { aktion: "forecast_erstellen" }, { prioritaet: 2 });
  });

  // Newsletter: täglich 10:00
  cron.schedule("0 10 * * *", () => {
    globalQueue.fuegeHinzu("newsletter_daily", { aktion: "create_and_send" }, { prioritaet: 2 });
  });

  logger.info("Orchestrator + alle Cron-Jobs gestartet");
}

export function stoppeOrchestrator(): void {
  if (mainLoopTimer) {
    clearInterval(mainLoopTimer);
    mainLoopTimer = null;
  }
  stoppeWatchdog();
  globalQueue.stoppeVerarbeitungsschleife();
  logger.info("Orchestrator gestoppt");
}

export function holeOrchestratorStatus(): {
  mainLoopZyklus: number;
  mainLoopLaeuft: boolean;
  queue: ReturnType<typeof globalQueue.holeStatus>;
} {
  return { mainLoopZyklus, mainLoopLaeuft, queue: globalQueue.holeStatus() };
}

// ─── Finance-Optimierungs-Team: manuelle Trigger für Routen ─────────────────

export async function starteFinanceTeamScan(): Promise<{ success: boolean; message: string }> {
  const registrar = subAgenten.find(a => a instanceof AffiliateRegistrarAgent);
  const team = subAgenten.find(a => a instanceof FinanceTeamAgent);
  if (!registrar || !team) return { success: false, message: "Finance-Team-Agenten nicht initialisiert" };

  const registrarErgebnis = await registrar.fuehreAufgabeAus({
    id: `manuell-${Date.now()}`, typ: "affiliate_registrar_vorbereiten",
    payload: { aktion: "registrierungen_vorbereiten" }, prioritaet: 1, versuche: 0, maxVersuche: 1, erstelltAm: new Date(),
  });
  const teamErgebnis = await team.fuehreAufgabeAus({
    id: `manuell-${Date.now() + 1}`, typ: "finance_team_analyse",
    payload: {}, prioritaet: 1, versuche: 0, maxVersuche: 1, erstelltAm: new Date(),
  });

  return {
    success: true,
    message: `${registrarErgebnis.message} — ${teamErgebnis.message}`,
  };
}

export async function bestaetigeFinanceRegistrierung(opportunityId: number): Promise<{ success: boolean; message: string }> {
  const registrar = subAgenten.find(a => a instanceof AffiliateRegistrarAgent);
  if (!registrar) return { success: false, message: "Affiliate-Registrierungs-Agent nicht initialisiert" };

  const ergebnis = await registrar.fuehreAufgabeAus({
    id: `bestaetigen-${Date.now()}`, typ: "affiliate_registrar_bestaetigen",
    payload: { aktion: "bestaetigen", opportunityId }, prioritaet: 1, versuche: 0, maxVersuche: 1, erstelltAm: new Date(),
  });

  return { success: ergebnis.success, message: ergebnis.message };
}

// ─── HARA: manuelle Trigger für Routen ───────────────────────────────────────

export async function starteHaraScan(): Promise<{ success: boolean; message: string }> {
  const agent = subAgenten.find(a => a instanceof HaraAgent);
  if (!agent) return { success: false, message: "HARA-Agent nicht initialisiert" };

  const ergebnis = await agent.fuehreAufgabeAus({
    id: `hara-scan-${Date.now()}`, typ: "hara_scan",
    payload: { aktion: "scan" }, prioritaet: 1, versuche: 0, maxVersuche: 1, erstelltAm: new Date(),
  });
  return { success: ergebnis.success, message: ergebnis.message };
}

export function starteHaraAusfuehrung(proposalId: number): string {
  return globalQueue.fuegeHinzu("hara_ausfuehrung", { aktion: "ausfuehrung", proposalId }, { prioritaet: 1, maxVersuche: 2 });
}

export function holeHaraAgent(): HaraAgent | null {
  const agent = subAgenten.find(a => a instanceof HaraAgent);
  return agent instanceof HaraAgent ? agent : null;
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

async function holeAgentId(typ: string): Promise<number | null> {
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.typ, typ)).limit(1);
  return agent?.id ?? null;
}

async function fuehreAgentAus(agentId: number, aktion: () => Promise<void>): Promise<void> {
  await db.update(agentsTable)
    .set({ status: "aktiv", letzteAktivitaet: new Date(), updatedAt: new Date() })
    .where(eq(agentsTable.id, agentId));
  try {
    await aktion();
    await db.update(agentsTable)
      .set({ status: "wartend", ausgefuehrtAufgaben: sql`ausgefuehrt_aufgaben + 1`, updatedAt: new Date() })
      .where(eq(agentsTable.id, agentId));
  } catch (err) {
    await db.update(agentsTable)
      .set({ status: "fehler", fehlerAnzahl: sql`fehler_anzahl + 1`, updatedAt: new Date() })
      .where(eq(agentsTable.id, agentId));
    logger.error({ err, agentId }, "Agent-Ausführung fehlgeschlagen");
  }
}

// ─── Alle Agenten sofort starten (Start-All-Button) ──────────────────────────

export async function fuehreAlleAgentanAus(): Promise<{ gestartet: number; jobIds: string[] }> {
  const jobIds: string[] = [];

  // Priorität 1: Master + Revenue Analyst (kein OpenAI-Aufruf)
  jobIds.push(globalQueue.fuegeHinzu("master_system_analyse", { aktion: "system_analyse" }, { prioritaet: 1 }));
  jobIds.push(globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "chancen_scannen" }, { prioritaet: 1 }));
  jobIds.push(globalQueue.fuegeHinzu("master_chancen_priorisierung", { aktion: "chancen_priorisierung" }, { prioritaet: 1 }));

  // Priorität 2: Umsatz + Stripe Links
  jobIds.push(globalQueue.fuegeHinzu("revenue_analyse", { aktion: "umsatz_analysieren" }, { prioritaet: 2 }));
  jobIds.push(globalQueue.fuegeHinzu("revenue_analyst_stripe", { aktion: "stripe_link_erstellen" }, { prioritaet: 2 }));
  jobIds.push(globalQueue.fuegeHinzu("monetization_affiliate", { aktion: "affiliate_analyse" }, { prioritaet: 2 }));
  jobIds.push(globalQueue.fuegeHinzu("monetization_funnel", { aktion: "funnel_optimieren" }, { prioritaet: 2 }));
  jobIds.push(globalQueue.fuegeHinzu("marketing_kampagnen_erstellen", { aktion: "marketing_kampagnen_erstellen" }, { prioritaet: 2 }));
  jobIds.push(globalQueue.fuegeHinzu("monetization_upsell", { aktion: "upsell_strategie" }, { prioritaet: 2 }));
  jobIds.push(globalQueue.fuegeHinzu("monetization_preisoptimierung", { aktion: "preisoptimierung" }, { prioritaet: 2 }));

    // ── Smart Coupon Agent: Standard-Coupons initialisieren + KI-Coupons generieren ──
    globalQueue.fuegeHinzu("smart_coupon_init", { aktion: "init_coupons" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("smart_coupon_ki", { aktion: "ki_coupons" }, { prioritaet: 2 });

    // ── Abandoned Cart Recovery: Stripe-Sessions scannen ──
    globalQueue.fuegeHinzu("cart_recovery_stripe", { aktion: "check_stripe" }, { prioritaet: 1 });

    // ── Loyalty & Referral: Programm init + erster Check ──
    globalQueue.fuegeHinzu("loyalty_full_check", { aktion: "init_program" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("loyalty_cards", { aktion: "check_cards" }, { prioritaet: 2 });

    // ── Subscription & Revenue Agent: Init + Sync beim Start ──
    globalQueue.fuegeHinzu("subscription_full_check", { aktion: "init_plans" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("subscription_sync", { aktion: "sync_subs" }, { prioritaet: 2 });
    // ── Sprint 8: Cross-Sell Engine beim Start ──
    globalQueue.fuegeHinzu("cross_sell_full", { aktion: "full_scan" }, { prioritaet: 2 });
    // ── Sprint 9: Conversion Optimizer beim Start ──
    globalQueue.fuegeHinzu("conversion_full", { aktion: "create_tests" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("conversion_analyze", { aktion: "analyze" }, { prioritaet: 2 });
    // ── Sprint 7.1: Aggressive Revenue Optimierungen beim Start ──
    globalQueue.fuegeHinzu("hara_scan", { aktion: "fast_revenue_scan" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "revenue_anomaly" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "auto_cross_sell" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("monetization_auto_optimize", { aktion: "dynamic_pricing" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("master_optimierung", { aktion: "revenue_priorisierung" }, { prioritaet: 1 });

  // Priorität 3: Content + Sales + Community
  const marken = ["CyberSarah", "GeldPilot AI", "UnternehmerGPT"] as const;
  const typen = ["tiktok", "reel", "blogartikel"] as const;
  const plattformen = ["TikTok", "Instagram", "YouTube"] as const;
  const themen = ["KI-Automatisierung 2026", "Passives Einkommen mit KI", "ChatGPT für Selbstständige"];
  const idx = Math.floor(Math.random() * 3);

  // Content Factory (mit OpenAI — nur wenn Umsatz-relevanter Content generiert wird)
  const agentId = await holeAgentId("content_factory");
  if (agentId) {
    void fuehreAgentAus(agentId, () => generiereContent({
      marke: marken[idx]!,
      typ: typen[idx]!,
      plattform: plattformen[idx]!,
      thema: themen[idx]!,
    }, agentId).then(() => {}));
  }

  jobIds.push(globalQueue.fuegeHinzu("sales_optimierung", {}, { prioritaet: 3 }));
  jobIds.push(globalQueue.fuegeHinzu("community_management", {}, { prioritaet: 3 }));
  jobIds.push(globalQueue.fuegeHinzu("revenue_forecast", { aktion: "forecast_erstellen" }, { prioritaet: 3 }));

  // KI-Chancen-Analyse (OpenAI — einmal täglich ausreichend)
  jobIds.push(globalQueue.fuegeHinzu("revenue_analyst_ki", { aktion: "ki_chancen_analysieren" }, { prioritaet: 2 }));

  logger.info({ jobIds: jobIds.length }, "⚡ START-ALL: Alle Revenue-Agenten gestartet");

  return { gestartet: jobIds.length, jobIds };
}

// ─── Deep-Optimierung (One-Click, synchron) ──────────────────────────────────
// Führt die Deep-Optimization-Pipeline SYNCHRON aus (True-ROI + Autopilot),
// damit der Endpunkt sofort ein aussagekräftiges Ergebnis zurückgeben kann.
// Die Pricing-Jobs werden dabei intern in die Queue gelegt (Prio 1).
export async function fuehreDeepOptimierungDurch(): Promise<AufgabeErgebnis> {
  const agent = subAgenten.find(a => a instanceof MasterAgent);
  if (!agent) throw new Error("MasterAgent nicht initialisiert");
  const ergebnis = await agent.fuehreAufgabeAus({
    id: `deep-opt-${Date.now()}`,
    typ: "master_deep_optimierung",
    payload: { aktion: "deep_optimierung" },
    prioritaet: 1,
    versuche: 0,
    maxVersuche: 1,
    erstelltAm: new Date(),
  });
  logger.info({ success: ergebnis.success }, "⚡ DEEP-OPTIMIERUNG: Zyklus abgeschlossen");
  return ergebnis;
}

// ─── Manueller Agent-Trigger ─────────────────────────────────────────────────

export async function fuehreAgentManuellAus(agentId: number): Promise<{ success: boolean; message: string }> {
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).limit(1);
  if (!agent) return { success: false, message: "Agent nicht gefunden" };

  try {
    switch (agent.typ) {
      case "director":
        await fuehreAgentAus(agentId, () => fuehreStrategieAnalyseDurch(agentId).then(() => {}));
        return { success: true, message: "Director Agent: Strategische Analyse erfolgreich" };

      case "trend_analyst":
        await fuehreAgentAus(agentId, () => analysiereTrends(agentId).then(() => {}));
        return { success: true, message: "Trend Analyst: Analyse + Content-Generierung abgeschlossen" };

      case "content_factory": {
        const themen = [
          "KI-Tools die 2026 dominieren", "Passives Einkommen: Was wirklich funktioniert",
          "ChatGPT für Selbstständige — 5 Tricks", "Automatisierung statt Überstunden",
        ];
        const marken = ["CyberSarah", "GeldPilot AI", "UnternehmerGPT"] as const;
        const typen = ["blogartikel", "tiktok", "reel", "kurzVideo"] as const;
        const plattformen = ["Blog", "TikTok", "Instagram", "YouTube"] as const;
        const idx = Math.floor(Math.random() * themen.length);
        await fuehreAgentAus(agentId, () => generiereContent({
          marke: marken[idx % 3]!,
          typ: typen[idx % 4]!,
          plattform: plattformen[idx % 4]!,
          thema: themen[idx]!,
        }, agentId).then(() => {}));
        return { success: true, message: "Content Factory: Content erfolgreich generiert" };
      }

      case "video":
        await fuehreAgentAus(agentId, () => generiereVideoSkript(agentId).then(() => {}));
        return { success: true, message: "Video Agent: Video-Skript generiert" };

      case "sales":
        await fuehreAgentAus(agentId, () => optimiereSales(agentId).then(() => {}));
        return { success: true, message: "Sales Agent: Optimierungsanalyse abgeschlossen" };

      case "funnel":
        await fuehreAgentAus(agentId, () => generiereFunnelSequenz(agentId).then(() => {}));
        return { success: true, message: "Funnel Agent: E-Mail-Sequenz generiert" };

      case "community":
        await fuehreAgentAus(agentId, () => verarbeiteCommunitiy(agentId).then(() => {}));
        return { success: true, message: "Community Agent: Antworten und DM-Vorlagen erstellt" };

      case "revenue_optimizer":
        await fuehreAgentAus(agentId, () => analysiereUmsatz(agentId).then(() => {}));
        return { success: true, message: "Revenue Optimizer: Umsatz-Analyse abgeschlossen" };

      case "influencer": {
        const marken = ["CyberSarah", "GeldPilot AI", "UnternehmerGPT"] as const;
        const jobId = globalQueue.fuegeHinzu(
          "influencer_content",
          { aktion: "content_generieren", marke: marken[Math.floor(Math.random() * 3)], plattform: "Instagram" },
          { prioritaet: 1, maxVersuche: 3 },
        );
        return { success: true, message: `Influencer Agent: Job ${jobId} in Queue eingereiht` };
      }

      case "revenue": {
        const jobId = globalQueue.fuegeHinzu("revenue_analyse", { aktion: "umsatz_analysieren" }, { prioritaet: 1 });
        return { success: true, message: `Revenue Agent: Job ${jobId} in Queue eingereiht` };
      }

      case "monetization": {
        const j1 = globalQueue.fuegeHinzu("monetization_funnel", { aktion: "funnel_optimieren" }, { prioritaet: 1 });
        const j2 = globalQueue.fuegeHinzu("monetization_upsell", { aktion: "upsell_strategie" }, { prioritaet: 1 });
        const j3 = globalQueue.fuegeHinzu("monetization_preisoptimierung", { aktion: "preisoptimierung" }, { prioritaet: 1 });

    // ── Smart Coupon Agent: Standard-Coupons initialisieren + KI-Coupons generieren ──
    globalQueue.fuegeHinzu("smart_coupon_init", { aktion: "init_coupons" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("smart_coupon_ki", { aktion: "ki_coupons" }, { prioritaet: 2 });

    // ── Abandoned Cart Recovery: Stripe-Sessions scannen ──
    globalQueue.fuegeHinzu("cart_recovery_stripe", { aktion: "check_stripe" }, { prioritaet: 1 });

    // ── Loyalty & Referral: Programm init + erster Check ──
    globalQueue.fuegeHinzu("loyalty_full_check", { aktion: "init_program" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("loyalty_cards", { aktion: "check_cards" }, { prioritaet: 2 });

    // ── Subscription & Revenue Agent: Init + Sync beim Start ──
    globalQueue.fuegeHinzu("subscription_full_check", { aktion: "init_plans" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("subscription_sync", { aktion: "sync_subs" }, { prioritaet: 2 });
    // ── Sprint 8: Cross-Sell Engine beim Start ──
    globalQueue.fuegeHinzu("cross_sell_full", { aktion: "full_scan" }, { prioritaet: 2 });
    // ── Sprint 9: Conversion Optimizer beim Start ──
    globalQueue.fuegeHinzu("conversion_full", { aktion: "create_tests" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("conversion_analyze", { aktion: "analyze" }, { prioritaet: 2 });
    // ── Sprint 7.1: Aggressive Revenue Optimierungen beim Start ──
    globalQueue.fuegeHinzu("hara_scan", { aktion: "fast_revenue_scan" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "revenue_anomaly" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "auto_cross_sell" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("monetization_auto_optimize", { aktion: "dynamic_pricing" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("master_optimierung", { aktion: "revenue_priorisierung" }, { prioritaet: 1 });
        return { success: true, message: `Monetization Agent: 3 Jobs gestartet (Funnel ${j1}, Upsell ${j2}, Preis ${j3})` };
      }

      case "master": {
        const jobId = globalQueue.fuegeHinzu("master_system_analyse", { aktion: "system_analyse" }, { prioritaet: 1 });
        return { success: true, message: `Master Agent: System-Analyse ${jobId} gestartet` };
      }

      case "revenue_analyst": {
        const j1 = globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "chancen_scannen" }, { prioritaet: 1 });
        const j2 = globalQueue.fuegeHinzu("marketing_kampagnen_erstellen", { aktion: "marketing_kampagnen_erstellen" }, { prioritaet: 1 });
        return { success: true, message: `Revenue Analyst: 2 Jobs gestartet (Scan ${j1}, Marketing ${j2})` };
      }

      case "affiliate_registrar": {
        const jobId = globalQueue.fuegeHinzu("affiliate_registrar_vorbereiten", { aktion: "registrierungen_vorbereiten" }, { prioritaet: 1 });
        return { success: true, message: `Affiliate-Registrierungs-Agent: Job ${jobId} gestartet` };
      }

      case "digitalprodukt_katalog": {
        const jobId = globalQueue.fuegeHinzu("digitalprodukt_scan", {}, { prioritaet: 1 });
        return { success: true, message: `Digitalprodukt-Katalog-Agent: Scan ${jobId} gestartet` };
      }

      case "seo_content_empire": {
        const jobId = globalQueue.fuegeHinzu("seo_content_scan", {}, { prioritaet: 1 });
        return { success: true, message: `SEO-Content-Empire-Agent: Scan ${jobId} gestartet` };
      }

      case "email_listen_monetarisierung": {
        const jobId = globalQueue.fuegeHinzu("email_sequenzen_erstellen", {}, { prioritaet: 1 });
        return { success: true, message: `E-Mail-Listen-Monetarisierungs-Agent: Sequenz-Erstellung ${jobId} gestartet` };
      }

      case "faceless_video_auto_publish": {
        const jobId = globalQueue.fuegeHinzu("faceless_video_generieren", {}, { prioritaet: 1 });
        return { success: true, message: `Faceless-Video-Auto-Publish-Agent: Generierung ${jobId} gestartet` };
      }

      case "finance_team": {
        const jobId = globalQueue.fuegeHinzu("finance_team_analyse", {}, { prioritaet: 1 });
        return { success: true, message: `Finance-Optimierungs-Team: Analyse ${jobId} gestartet` };
      }

      case "subscription": {
        const j1 = globalQueue.fuegeHinzu("subscription_full_check", { aktion: "full_check" }, { prioritaet: 1 });
        const j2 = globalQueue.fuegeHinzu("subscription_sync", { aktion: "sync_subs" }, { prioritaet: 2 });
    // ── Sprint 8: Cross-Sell Engine beim Start ──
    globalQueue.fuegeHinzu("cross_sell_full", { aktion: "full_scan" }, { prioritaet: 2 });
    // ── Sprint 9: Conversion Optimizer beim Start ──
    globalQueue.fuegeHinzu("conversion_full", { aktion: "create_tests" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("conversion_analyze", { aktion: "analyze" }, { prioritaet: 2 });
    // ── Sprint 7.1: Aggressive Revenue Optimierungen beim Start ──
    globalQueue.fuegeHinzu("hara_scan", { aktion: "fast_revenue_scan" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "revenue_anomaly" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "auto_cross_sell" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("monetization_auto_optimize", { aktion: "dynamic_pricing" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("master_optimierung", { aktion: "revenue_priorisierung" }, { prioritaet: 1 });
        return { success: true, message: `Subscription & Revenue Agent: 2 Jobs gestartet (Full-Check ${j1}, Sync ${j2})` };
      }

      case "conversion_optimizer": {
        const jobId = globalQueue.fuegeHinzu("conversion_full", { aktion: "full_scan" }, { prioritaet: 1 });
        return { success: true, message: `Conversion Optimizer Agent: Voll-Scan ${jobId} gestartet` };
      }

      case "cross_sell": {
        const jobId = globalQueue.fuegeHinzu("cross_sell_full", { aktion: "full_scan" }, { prioritaet: 1 });
        return { success: true, message: `Cross-Sell Engine Agent: Voll-Scan ${jobId} gestartet` };
      }

      case "hara": {
        const jobId = globalQueue.fuegeHinzu("hara_scan", { aktion: "scan" }, { prioritaet: 1 });
        return { success: true, message: `HARA: Opportunity-Scan ${jobId} gestartet` };
      }

      default:
        return { success: false, message: `Unbekannter Agent-Typ: ${agent.typ}` };
    }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Unbekannter Fehler" };
  }
}