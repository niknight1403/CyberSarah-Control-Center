import cron from "node-cron";
import { woechentlicherNewsletterScan } from "./newsletterAgent";
import { taeglicheWhatsAppAufgabe } from "./whatsappAgent";
import { db } from "@workspace/db";
import { agentsTable, agentLogsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
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
import { scanneNeueProdukte, synchronisiereVerkaeufe, optimierePreiseUndPausiereFlops } from "./digitalproduktAgent";
import { generiereSeoArtikel } from "./seoContentAgent";
import { erstelleFehlendeSequenzen, versendeFaelligeEmails } from "./emailListenAgent";
import { generiereFacelessVideo, veroeffentlicheFaelligeVideos, analysiereUndOptimiere as analysiereFacelessVideos } from "./facelessVideoAgent";
import { recycleContent } from "./contentRecyclingAgent";
import { starteWatchdog, stoppeWatchdog } from "./watchdog";
import { scanneExpansionChancen } from "./expansionAgent";
import { fuehreStrategieAnalyseDurch } from "./directorAgent";
import { analysiereUmsatz } from "./revenueAgent";
import { generiereContent } from "./contentAgent";
import { analysiereTrends } from "./trendAnalystAgent";
import { generiereVideoSkript } from "./videoAgent";
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
];

let mainLoopTimer: NodeJS.Timeout | null = null;
let mainLoopLaeuft = false;
let mainLoopZyklus = 0;

// ─── Initialisierung ─────────────────────────────────────────────────────────

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
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "optimierung" } });
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
    const agent = subAgenten.find(a => a instanceof RevenueAnalystAgent);
    if (!agent) throw new Error("RevenueAnalystAgent nicht gefunden");
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { aktion: "chancen_scannen" } });
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
    return agent.fuehreAufgabeAus({ ...aufgabe, payload: { ...aufgabe.payload, aktion: "scan" } });
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
    // Alle 15 Min: Sales + Monetization
    if (mainLoopZyklus % 15 === 0) {
      globalQueue.fuegeHinzu("sales_optimierung", {}, { prioritaet: 3 });
      globalQueue.fuegeHinzu("monetization_funnel", { aktion: "funnel_optimieren" }, { prioritaet: 3 });
      globalQueue.fuegeHinzu("monetization_affiliate", { aktion: "affiliate_analyse" }, { prioritaet: 3 });
    }
    // Alle 20 Min: Community Management
    if (mainLoopZyklus % 20 === 0) {
      globalQueue.fuegeHinzu("community_management", {}, { prioritaet: 3 });
    }
    // Alle 10 Min: Revenue Analyst Scan (ohne OpenAI — kein API-Call)
    if (mainLoopZyklus % 10 === 0) {
      globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "chancen_scannen" }, { prioritaet: 1 });
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

  // Director Agent: täglich 06:00
  cron.schedule("0 6 * * *", async () => {
    const agentId = await holeAgentId("director");
    if (!agentId) return;
    await fuhreAgentAus(agentId, () => fuehreStrategieAnalyseDurch(agentId).then(() => {}));
  });

  // Revenue Optimizer: stündlich
  cron.schedule("0 * * * *", async () => {
    const agentId = await holeAgentId("revenue_optimizer");
    if (agentId) {
      await fuhreAgentAus(agentId, () => analysiereUmsatz(agentId).then(() => {}));
    }
    globalQueue.fuegeHinzu("revenue_analyse", { aktion: "roi_berechnen", zeitraum: "monat" }, { prioritaet: 1 });
  });

  // Content Factory: 08:00, 12:00, 18:00
  cron.schedule("0 8,12,18 * * *", async () => {
    const agentId = await holeAgentId("content_factory");
    if (!agentId) return;
    const marken = ["CyberSarah", "GeldPilot AI", "UnternehmerGPT"] as const;
    const typen = ["kurzVideo", "reel", "tiktok", "blogartikel"] as const;
    const plattformen = ["TikTok", "Instagram", "YouTube"] as const;
    const themen = [
      "KI-Automatisierung für Selbstständige 2026",
      "Passives Einkommen mit KI-Tools aufbauen",
      "ChatGPT Prompt-Strategien für Einsteiger",
      "Online Geld verdienen: Der realistische Weg",
      "KI-Marketing: Mehr Reichweite mit weniger Aufwand",
      "Affiliate-Marketing automatisch skalieren",
      "3 KI-Tools die dein Business verändern",
    ];
    await fuhreAgentAus(agentId, () => generiereContent({
      marke: marken[Math.floor(Math.random() * marken.length)]!,
      typ: typen[Math.floor(Math.random() * typen.length)]!,
      plattform: plattformen[Math.floor(Math.random() * plattformen.length)]!,
      thema: themen[Math.floor(Math.random() * themen.length)]!,
    }, agentId).then(() => {}));
  });

  // Trend Analyst: alle 6 Stunden (0, 6, 12, 18 Uhr)
  cron.schedule("0 0,6,12,18 * * *", async () => {
    const agentId = await holeAgentId("trend_analyst");
    if (!agentId) return;
    await fuhreAgentAus(agentId, () => analysiereTrends(agentId).then(() => {}));
  });

  // Video Agent: 10:00 + 16:00
  cron.schedule("0 10,16 * * *", async () => {
    const agentId = await holeAgentId("video");
    if (!agentId) return;
    await fuhreAgentAus(agentId, () => generiereVideoSkript(agentId).then(() => {}));
  });

  // Sales Agent: 11:00 + 17:00
  cron.schedule("0 11,17 * * *", async () => {
    const agentId = await holeAgentId("sales");
    if (!agentId) return;
    await fuhreAgentAus(agentId, () => optimiereSales(agentId).then(() => {}));
  });

  // Funnel Agent: 07:00 täglich
  cron.schedule("0 7 * * *", async () => {
    const agentId = await holeAgentId("funnel");
    if (!agentId) return;
    await fuhreAgentAus(agentId, () => generiereFunnelSequenz(agentId).then(() => {}));
    globalQueue.fuegeHinzu("monetization_funnel", { aktion: "funnel_optimieren" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("monetization_affiliate", { aktion: "affiliate_analyse" }, { prioritaet: 3 });
  });

  // Community Agent: 09:00, 13:00, 20:00
  cron.schedule("0 9,13,20 * * *", async () => {
    const agentId = await holeAgentId("community");
    if (!agentId) return;
    await fuhreAgentAus(agentId, () => verarbeiteCommunitiy(agentId).then(() => {}));
  });

  // Influencer Agent: 09:15 + 15:15 (Content-Generierung Queue)
  cron.schedule("15 9,15 * * *", () => {
    const marken = ["CyberSarah", "GeldPilot AI", "UnternehmerGPT"] as const;
    globalQueue.fuegeHinzu(
      "influencer_content",
      { aktion: "content_generieren", marke: marken[Math.floor(Math.random() * marken.length)], plattform: "Instagram" },
      { prioritaet: 2, maxVersuche: 3 },
    );
  });

  // KI-Influencer Auto-Post: 08:00, 13:00, 19:00 — postet auf alle aktiven Plattformen
  cron.schedule("0 8,13,19 * * *", async () => {
    logger.info("⏰ KI-Influencer Auto-Post gestartet");
    const { starteAutoPost } = await import("./InfluencerAutoPostAgent");
    const ergebnis = await starteAutoPost();
    logger.info(ergebnis, `🚀 Auto-Post abgeschlossen: ${ergebnis.gepostet}/${ergebnis.plattformen.length} Plattformen`);
  });

  // Influencer Tages-Zähler Reset: Mitternacht
  cron.schedule("0 0 * * *", async () => {
    const { db: dbInst } = await import("@workspace/db");
    const { influencerPlatformenTable } = await import("@workspace/db");
    await dbInst.update(influencerPlatformenTable).set({ postingsHeute: 0, updatedAt: new Date() });
    logger.info("🔄 Influencer Tages-Zähler zurückgesetzt");
  });

  // Master Agent: alle 30 Minuten
  cron.schedule("*/30 * * * *", () => {
    globalQueue.fuegeHinzu("master_system_analyse", { aktion: "system_analyse" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("master_chancen_priorisierung", { aktion: "chancen_priorisierung" }, { prioritaet: 1 });
  });

  // Revenue Analyst Agent: alle 2 Stunden
  cron.schedule("0 */2 * * *", () => {
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "chancen_scannen" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("revenue_analyst_stripe", { aktion: "stripe_link_erstellen" }, { prioritaet: 2 });
  });

  // Revenue Analyst KI-Analyse: täglich 08:00 (OpenAI nur einmal täglich)
  cron.schedule("0 8 * * *", () => {
    globalQueue.fuegeHinzu("revenue_analyst_ki", { aktion: "ki_chancen_analysieren" }, { prioritaet: 2 });
    globalQueue.fuegeHinzu("master_optimierung", { aktion: "optimierung" }, { prioritaet: 1 });
  });

  // Watchdog starten (5-Min-Takt, 401-Erkennung + Auto-Reset)
  starteWatchdog();

  // ─── Expansion-Agenten Cron-Jobs ────────────────────────────────────────────
  // Opportunity Scanner: alle 6h
  cron.schedule("0 */6 * * *", () => {
    globalQueue.fuegeHinzu("expansion_scan", { aktion: "chancen_scannen" }, { prioritaet: 2 });
  });

  // Object-Storage Sweep: alle 15 Min — löscht nicht-konforme oder nie
  // bestätigte (verwaiste) Uploads, unabhängig davon ob /confirm aufgerufen wurde
  cron.schedule("*/15 * * * *", async () => {
    try {
      const { ObjectStorageService } = await import("../lib/objectStorage");
      const svc = new ObjectStorageService();
      const ergebnis = await svc.sweepNonCompliantUploads({
        allowedContentTypes: new Set(["image/png", "image/jpeg", "image/webp"]),
        maxSizeBytes: 15 * 1024 * 1024,
        maxUnconfirmedAgeMs: 30 * 60 * 1000,
      });
      if (ergebnis.deleted > 0) {
        logger.info(ergebnis, "🧹 Object-Storage Sweep: nicht-konforme/verwaiste Uploads gelöscht");
      }
    } catch (err) {
      logger.warn({ err }, "Object-Storage Sweep fehlgeschlagen");
    }
  });

  // HARA Phase 1: alle 4 Stunden neue Revenue-Pakete generieren (übersprungen,
  // wenn bereits genug Pakete auf Bestätigung/Umsetzung warten).
  cron.schedule("30 */4 * * *", () => {
    globalQueue.fuegeHinzu("hara_scan", { aktion: "scan" }, { prioritaet: 2 });
  });

  // Digitalprodukt-Katalog-Agent: täglich neue Produkte scannen (05:30 Uhr),
  // alle 20 Min echte Stripe-Verkäufe abgleichen, täglich Preise optimieren/Flops pausieren (04:00 Uhr).
  cron.schedule("30 5 * * *", () => {
    globalQueue.fuegeHinzu("digitalprodukt_scan", {}, { prioritaet: 3 });
  });
  cron.schedule("*/20 * * * *", () => {
    globalQueue.fuegeHinzu("digitalprodukt_verkaeufe_sync", {}, { prioritaet: 2 });
  });
  cron.schedule("0 4 * * *", () => {
    globalQueue.fuegeHinzu("digitalprodukt_optimieren", {}, { prioritaet: 3 });
  });

  // SEO-Content-Empire-Agent: täglich neue SEO-Artikel generieren + veröffentlichen (07:30 Uhr)
  cron.schedule("30 7 * * *", () => {
    globalQueue.fuegeHinzu("seo_content_scan", {}, { prioritaet: 3 });
  });

  // E-Mail-Listen-Monetarisierungs-Agent: täglich fehlende Sequenzen erstellen (06:30 Uhr),
  // stündlich fällige E-Mails an aktive Leads versenden.
  cron.schedule("30 6 * * *", () => {
    globalQueue.fuegeHinzu("email_sequenzen_erstellen", {}, { prioritaet: 3 });
  });
  cron.schedule("0 * * * *", () => {
    globalQueue.fuegeHinzu("email_versenden", {}, { prioritaet: 2 });
  });

  // Faceless-Video-Auto-Publish-Agent: Content-Generierung 3x täglich (09/14/20 Uhr),
  // Veröffentlichung stündlich zu :20, Performance-Analyse täglich um 22:30 Uhr.
  cron.schedule("0 9,14,20 * * *", () => {
    globalQueue.fuegeHinzu("faceless_video_generieren", {}, { prioritaet: 3 });
  });
  cron.schedule("20 * * * *", () => {
    globalQueue.fuegeHinzu("faceless_video_veroeffentlichen", {}, { prioritaet: 2 });
  });
  cron.schedule("30 22 * * *", () => {
    globalQueue.fuegeHinzu("faceless_video_analysieren", {}, { prioritaet: 3 });
  });

  // Content-Recycling-Agent: täglich um 11:45 Uhr Top-Performer scannen und
  // eine neue Format-Variante generieren (fließt automatisch in Auto-Post-Pipeline ein).
  cron.schedule("45 11 * * *", () => {
    globalQueue.fuegeHinzu("content_recyceln", {}, { prioritaet: 3 });
  });

  // Stripe-Abgleich: alle 10 Min — holt Zahlungen aktiv von der Stripe-API ab.
  // Nötig, weil bei privater Deployment-Sichtbarkeit eingehende Stripe-Webhooks
  // vom Replit-Schutzschild blockiert werden (Webhook bleibt als Fallback aktiv).
  cron.schedule("*/10 * * * *", async () => {
    try {

  // Newsletter-Agent: Jeden Freitag um 08:00 Uhr
  cron.schedule("0 8 * * 5", async () => {
    logger.info("📧 Newsletter-Agent: Wöchentlicher Newsletter wird generiert...");
    await woechentlicherNewsletterScan();
  });

  // WhatsApp-Agent: Täglich um 09:30 Uhr
  cron.schedule("30 9 * * *", async () => {
    logger.info("📱 WhatsApp-Agent: Täglicher Tipp wird gesendet...");
    await taeglicheWhatsAppAufgabe();
  });
      const { syncStripeTransaktionen } = await import("../lib/stripeSync");
      const ergebnis = await syncStripeTransaktionen();
      if (ergebnis.neu > 0) {
        logger.info(ergebnis, "💶 Stripe-Sync: neue Zahlungen übernommen");
      }
    } catch (err) {
      logger.warn({ err }, "Stripe-Sync fehlgeschlagen");
    }
  });

  // ─── Sofort beim Start: Chancen scannen + Master-Check + Auto-Recovery ──────
  setTimeout(async () => {
    globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "chancen_scannen" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("master_system_analyse", { aktion: "system_analyse" }, { prioritaet: 1 });

    // Stripe-Abgleich sofort beim Start (danach alle 10 Min per Cron)
    try {
      const { syncStripeTransaktionen } = await import("../lib/stripeSync");
      const ergebnis = await syncStripeTransaktionen();
      logger.info(ergebnis, "💶 Stripe-Sync beim Start abgeschlossen");
    } catch (err) {
      logger.warn({ err }, "Stripe-Sync beim Start fehlgeschlagen");
    }
    // Expansion-Chancen beim ersten Start befüllen
    globalQueue.fuegeHinzu("expansion_scan", { aktion: "chancen_scannen" }, { prioritaet: 2 });

    // ─── Auto-Recovery: Wenn System vorher aktiv war → sofort alle Agenten neu starten ──
    try {
      const aktiveAgenten = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.status, "aktiv"));
      if (aktiveAgenten.length > 0) {
        logger.info({ anzahl: aktiveAgenten.length }, "🔄 Auto-Recovery: System war aktiv vor Neustart — starte alle Agenten automatisch");
        // Alle auf wartend setzen (kein zombie-state) dann sofort re-triggern
        await db.update(agentsTable).set({ status: "wartend", updatedAt: new Date() }).where(eq(agentsTable.status, "aktiv"));
        void fuehreAlleAgentanAus();
      }
    } catch (err) {
      logger.warn({ err }, "Auto-Recovery: Konnte Status nicht prüfen");
    }
  }, 5000);

  logger.info({
    mainLoop: "60s Intervall",
    director: "tägl. 06:00",
    trend_analyst: "alle 6h",
    content_factory: "08:00/12:00/18:00",
    video: "10:00/16:00",
    sales: "11:00/17:00",
    funnel: "07:00",
    community: "09:00/13:00/20:00",
    revenue_optimizer: "stündl.",
    influencer: "09:15/15:15",
    monetization: "via funnel 07:00",
    revenue: "via Queue alle 5 Min",
    master: "alle 30 Min",
    revenue_analyst: "alle 2h + tägl. 08:00 KI",
  }, "Orchestrator + alle Cron-Jobs gestartet");
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

async function fuhreAgentAus(agentId: number, aktion: () => Promise<void>): Promise<void> {
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

  // Priorität 3: Content + Sales + Community
  const marken = ["CyberSarah", "GeldPilot AI", "UnternehmerGPT"] as const;
  const typen = ["tiktok", "reel", "blogartikel"] as const;
  const plattformen = ["TikTok", "Instagram", "YouTube"] as const;
  const themen = ["KI-Automatisierung 2026", "Passives Einkommen mit KI", "ChatGPT für Selbstständige"];
  const idx = Math.floor(Math.random() * 3);

  // Content Factory (mit OpenAI — nur wenn Umsatz-relevanter Content generiert wird)
  const agentId = await holeAgentId("content_factory");
  if (agentId) {
    void fuhreAgentAus(agentId, () => generiereContent({
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
        await fuhreAgentAus(agentId, () => fuehreStrategieAnalyseDurch(agentId).then(() => {}));
        return { success: true, message: "Director Agent: Strategische Analyse erfolgreich" };

      case "trend_analyst":
        await fuhreAgentAus(agentId, () => analysiereTrends(agentId).then(() => {}));
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
        await fuhreAgentAus(agentId, () => generiereContent({
          marke: marken[idx % 3]!,
          typ: typen[idx % 4]!,
          plattform: plattformen[idx % 4]!,
          thema: themen[idx]!,
        }, agentId).then(() => {}));
        return { success: true, message: "Content Factory: Content erfolgreich generiert" };
      }

      case "video":
        await fuhreAgentAus(agentId, () => generiereVideoSkript(agentId).then(() => {}));
        return { success: true, message: "Video Agent: Video-Skript generiert" };

      case "sales":
        await fuhreAgentAus(agentId, () => optimiereSales(agentId).then(() => {}));
        return { success: true, message: "Sales Agent: Optimierungsanalyse abgeschlossen" };

      case "funnel":
        await fuhreAgentAus(agentId, () => generiereFunnelSequenz(agentId).then(() => {}));
        return { success: true, message: "Funnel Agent: E-Mail-Sequenz generiert" };

      case "community":
        await fuhreAgentAus(agentId, () => verarbeiteCommunitiy(agentId).then(() => {}));
        return { success: true, message: "Community Agent: Antworten und DM-Vorlagen erstellt" };

      case "revenue_optimizer":
        await fuhreAgentAus(agentId, () => analysiereUmsatz(agentId).then(() => {}));
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
        const jobId = globalQueue.fuegeHinzu("monetization_funnel", { aktion: "funnel_optimieren" }, { prioritaet: 1 });
        return { success: true, message: `Monetization Agent: Funnel-Job ${jobId} gestartet` };
      }

      case "master": {
        const jobId = globalQueue.fuegeHinzu("master_system_analyse", { aktion: "system_analyse" }, { prioritaet: 1 });
        return { success: true, message: `Master Agent: System-Analyse ${jobId} gestartet` };
      }

      case "revenue_analyst": {
        const jobId = globalQueue.fuegeHinzu("revenue_analyst_scan", { aktion: "chancen_scannen" }, { prioritaet: 1 });
        return { success: true, message: `Revenue Analyst: Chancen-Scan ${jobId} gestartet` };
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
