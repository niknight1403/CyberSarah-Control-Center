import { db } from "@workspace/db";
import { agentsTable, agentLogsTable, revenueOpportunitiesTable, expansionChancenTable, transactionsTable, pendingAttributionTable, subscriptionPlansTable, couponsTable } from "@workspace/db";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { logger } from "../lib/logger";
import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { globalQueue } from "./JobQueue";
import { generiereAutoRevenueStreams } from "./expansionAgent";

interface SystemAnalyse {
  gesamtAgenten: number;
  aktivAgenten: number;
  fehlerAgenten: number;
  queueGroesse: number;
  offeneChancen: number;
  aktiveChancen: number;
  empfehlungen: string[];
  prioritaetAktionen: string[];
}

export class MasterAgent extends AgentBase {
  constructor() {
    super("Master Agent", "master");
  }

  protected beschreibungText(): string {
    return "Zentrale Kommandozentrale — koordiniert alle Agenten, setzt Prioritäten, optimiert das Gesamtsystem kontinuierlich";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const aktion = (aufgabe.payload as Record<string, string>)?.aktion ?? "system_analyse";

    switch (aktion) {
      case "system_analyse":
        return this.systemAnalyse();
      case "optimierung":
        return this.optimiereSystem();
      case "deep_optimierung":
        return this.optimiereSystemDeep();
      case "chancen_priorisierung":
        return this.priorisierChancen();
      case "revenue_priorisierung":
        return this.revenuePriorisierung();
      default:
        return this.systemAnalyse();
    }
  }

  private async systemAnalyse(): Promise<AufgabeErgebnis> {
    const [agenten, chancenStats, queueStatus] = await Promise.all([
      db.select().from(agentsTable),
      db.select({
        offen: sql<number>`COUNT(*) FILTER (WHERE status = 'entdeckt')`,
        aktiv: sql<number>`COUNT(*) FILTER (WHERE status = 'aktiv')`,
        getestet: sql<number>`COUNT(*) FILTER (WHERE status = 'getestet')`,
      }).from(revenueOpportunitiesTable),
      Promise.resolve(globalQueue.holeStatus()),
    ]);

    const fehlerAgenten = agenten.filter(a => a.status === "fehler");
    const aktiveAgenten = agenten.filter(a => a.status === "aktiv");
    const empfehlungen: string[] = [];
    const prioritaetAktionen: string[] = [];

    for (const agent of fehlerAgenten) {
      empfehlungen.push(`${agent.name} hat ${agent.fehlerAnzahl} Fehler — Neu-Initialisierung empfohlen`);
      prioritaetAktionen.push(`agent_restart:${agent.id}`);
    }

    const stats = chancenStats[0];
    if (stats && Number(stats.offen) > 5) {
      prioritaetAktionen.push("chancen_aktivieren");
      empfehlungen.push(`${stats.offen} offene Revenue-Chancen warten auf Aktivierung`);
    }

    if (queueStatus.wartend > 20) {
      empfehlungen.push(`Job-Queue überlastet (${queueStatus.wartend} Jobs) — Prioritäten neu setzen`);
    }

    // ─── Revenue-First: Sofort Revenue-Kritische Jobs triggern ────────────────
    if (Number(stats?.offen ?? 0) > 0) {
      globalQueue.fuegeHinzu("hara_scan", { aktion: "scan" }, { prioritaet: 1 });
      globalQueue.fuegeHinzu("revenue_analyst_stripe", { aktion: "stripe_link_erstellen" }, { prioritaet: 1 });
      empfehlungen.push("Revenue-First: HARA-Scan + Stripe-Link-Erstellung triggert");
    }

    // Bei null Umsatz: Aggressiv Content + Affiliate pushen
    const [umsatzRes] = await db.select({ 
      total: sql<string>`COALESCE(SUM(betrag),0)` 
    }).from(transactionsTable)
      .where(sql`typ = 'einnahme' AND created_at >= NOW() - INTERVAL '24 hours'`);
    
    if (parseFloat(umsatzRes?.total ?? "0") === 0) {
      globalQueue.fuegeHinzu("digitalprodukt_scan", {}, { prioritaet: 1 });
      globalQueue.fuegeHinzu("seo_content_scan", {}, { prioritaet: 2 });
      globalQueue.fuegeHinzu("email_sequenzen_erstellen", {}, { prioritaet: 2 });
      empfehlungen.push("KEIN Umsatz in 24h → Aggressiver Revenue-Push gestartet");
    }

    if (fehlerAgenten.length > 0) {
      await db.update(agentsTable)
        .set({ status: "wartend", updatedAt: new Date() })
        .where(eq(agentsTable.status, "fehler"));

      for (const agent of fehlerAgenten) {
        await db.insert(agentLogsTable).values({
          agentId: agent.id,
          agentName: agent.name,
          aktion: "Master-Reset",
          status: "erfolgreich",
          nachricht: `Master Agent hat ${agent.name} zurückgesetzt (${agent.fehlerAnzahl} Fehler bereinigt)`,
        });
      }
    }

    const analyse: SystemAnalyse = {
      gesamtAgenten: agenten.length,
      aktivAgenten: aktiveAgenten.length,
      fehlerAgenten: fehlerAgenten.length,
      queueGroesse: queueStatus.wartend,
      offeneChancen: Number(stats?.offen ?? 0),
      aktiveChancen: Number(stats?.aktiv ?? 0),
      empfehlungen,
      prioritaetAktionen,
    };

    logger.info({ analyse }, "Master Agent: System-Analyse abgeschlossen");

    return {
      success: true,
      message: `System-Check: ${agenten.length} Agenten | ${fehlerAgenten.length} zurückgesetzt | ${queueStatus.wartend} Jobs | ${analyse.offeneChancen} Chancen offen`,
      metadaten: analyse as unknown as Record<string, unknown>,
    };
  }

  private async optimiereSystem(): Promise<AufgabeErgebnis> {
    const topChancen = await db
      .select()
      .from(revenueOpportunitiesTable)
      .where(eq(revenueOpportunitiesTable.status, "entdeckt"))
      .orderBy(desc(revenueOpportunitiesTable.geschaetzterMonatsumsatz))
      .limit(3);

    for (const chance of topChancen) {
      await db.update(revenueOpportunitiesTable)
        .set({ status: "aktiv", prioritaet: 1, updatedAt: new Date() })
        .where(eq(revenueOpportunitiesTable.id, chance.id));
    }

    globalQueue.fuegeHinzu("revenue_analyse", { aktion: "roi_berechnen", zeitraum: "woche" }, { prioritaet: 1, maxVersuche: 3 });
    globalQueue.fuegeHinzu("monetization_affiliate", { aktion: "affiliate_analyse" }, { prioritaet: 1 });
    globalQueue.fuegeHinzu("sales_optimierung", {}, { prioritaet: 1 });

    return {
      success: true,
      message: `Optimierung: ${topChancen.length} Chancen aktiviert | Revenue-Jobs mit Prio 1 in Queue`,
      metadaten: { aktivierteChancen: topChancen.map(c => c.titel) },
    };
  }

  // ─── Deep-Optimization-Pipeline (True-ROI + Autopilot + Pricing) ────────────
  // True-ROI = (Umsatz − API-Kosten − Zeitaufwand) / Gesamtkosten × 100
  //  > 500 %  → Chance AUTO-aktivieren
  //  < 50 %   → Chance pausieren
  // Läuft rein DB-basiert (kein OpenAI-Call) → schnelle Antwort für One-Click.
  private async optimiereSystemDeep(): Promise<AufgabeErgebnis> {
    const start = Date.now();

    // ── 1. True-ROI-Pass über alle Expansion-Chancen ──
    const chancen = await db.select().from(expansionChancenTable);
    let aktiviert = 0;
    let pausiert = 0;

    for (const chance of chancen) {
      const umsatz = parseFloat(chance.geschaetzterUmsatz ?? "0");
      const kosten = parseFloat(chance.kosten ?? "0");
      const apiKosten = this.schaetzeApiKosten(chance.kategorie);
      const zeitKosten = this.schaetzeZeitKosten(chance.zeitBisErstemUmsatz, chance.sofortStartbar);
      const gesamtKosten = Math.max(kosten + apiKosten + zeitKosten, 1);
      const trueRoi = ((umsatz - apiKosten - zeitKosten) / gesamtKosten) * 100;
      const trueRoiGekappt = Math.max(Math.min(trueRoi, 999999), -100);

      let neuerStatus = chance.status;
      if (trueRoi > 500 && chance.status !== "aktiv") {
        neuerStatus = "aktiv";
        aktiviert++;
      } else if (trueRoi < 50 && chance.status === "aktiv") {
        neuerStatus = "pausiert";
        pausiert++;
      }

      await db.update(expansionChancenTable)
        .set({
          roi: trueRoiGekappt.toFixed(2),
          status: neuerStatus,
          ...(neuerStatus === "aktiv" && { prioritaet: 1 }),
          validiert: trueRoi > 200,
          updatedAt: new Date(),
        })
        .where(eq(expansionChancenTable.id, chance.id));
    }

    // ── 2. Expansion-Autopilot (Top-3 Formate × Partnerprogramme) ──
    let autoStreams = 0;
    let topFormate: Array<{ typ: string; plattform: string; anzahl: number }> = [];
    try {
      const autopilot = await generiereAutoRevenueStreams();
      autoStreams = autopilot.erstellteStreams;
      topFormate = autopilot.topFormate;
    } catch (err) {
      logger.warn({ err }, "Deep-Optimierung: Autopilot fehlgeschlagen (nicht kritisch)");
    }

    // ── 3. RevenueOptimizer sofort für Preis-Strategie triggern ──
    const jobIds: string[] = [];
    jobIds.push(globalQueue.fuegeHinzu("revenue_analyse", { aktion: "roi_berechnen", zeitraum: "woche" }, { prioritaet: 1, maxVersuche: 3 }));
    jobIds.push(globalQueue.fuegeHinzu("monetization_affiliate", { aktion: "affiliate_analyse" }, { prioritaet: 1 }));
    jobIds.push(globalQueue.fuegeHinzu("monetization_funnel", { aktion: "funnel_optimieren" }, { prioritaet: 1 }));

    const dauerMs = Date.now() - start;
    const dauerSek = Math.max(1, Math.round(dauerMs / 1000));
    const quellenAnalysiert = chancen.length;

    logger.info(
      { quellenAnalysiert, aktiviert, pausiert, autoStreams, dauerMs, topFormate },
      "Master Agent: Deep-Optimierung abgeschlossen",
    );

    return {
      success: true,
      message: `Optimierungs-Zyklus abgeschlossen — Analyse von ${quellenAnalysiert} Quellen in ${dauerSek}s: ${aktiviert} aktiviert, ${pausiert} pausiert, ${autoStreams} Auto-Streams`,
      metadaten: {
        dauerMs,
        quellenAnalysiert,
        aktiviert,
        pausiert,
        autoStreams,
        topFormate,
        jobIds,
      },
    };
  }

  /** API-Kosten-Heuristik pro Kategorie (KI-Content kostet Tokens, Affiliate nichts). */
  private schaetzeApiKosten(kategorie: string): number {
    switch (kategorie) {
      case "content":
        return 15;
      case "eigenes_produkt":
        return 10;
      case "coaching":
      case "freelance":
        return 5;
      default:
        return 0; // affiliate, abo → kein API-Einsatz
    }
  }

  /** Zeitaufwand-Heuristik in € (Opportunitätskosten) aus Time-to-Revenue. */
  private schaetzeZeitKosten(zeitBisErstemUmsatz: string | null, sofortStartbar: boolean | null): number {
    if (sofortStartbar) return 5;
    switch (zeitBisErstemUmsatz) {
      case "sofort":
        return 5;
      case "1-7 Tage":
        return 20;
      case "1-4 Wochen":
        return 60;
      default:
        return 30;
    }
  }

  private async priorisierChancen(): Promise<AufgabeErgebnis> {
    const chancen = await db
      .select()
      .from(revenueOpportunitiesTable)
      .where(eq(revenueOpportunitiesTable.status, "entdeckt"))
      .orderBy(desc(revenueOpportunitiesTable.geschaetzterMonatsumsatz))
      .limit(10);

    let aktiviert = 0;
    for (const chance of chancen) {
      const geschaetzt = Number(chance.geschaetzterMonatsumsatz ?? 0);
      if (geschaetzt >= 100) {
        await db.update(revenueOpportunitiesTable)
          .set({ status: "aktiv", prioritaet: 1, updatedAt: new Date() })
          .where(eq(revenueOpportunitiesTable.id, chance.id));
        aktiviert++;
      } else if (geschaetzt >= 30) {
        await db.update(revenueOpportunitiesTable)
          .set({ prioritaet: 2, updatedAt: new Date() })
          .where(eq(revenueOpportunitiesTable.id, chance.id));
      }
    }

    return {
      success: true,
      message: `Chancen-Priorisierung: ${aktiviert} Hochprioritäts-Chancen aktiviert`,
      metadaten: { gepruefte: chancen.length, aktiviert },
    };
  }
  // ═════════════════════════════════════════════════════════════════════════════
  // REVENUE-PRIORISIERUNG: Weist Aufgaben basierend auf Umsatzpotenzial zu
  // Priorisiert Aktionen mit höchstem ROI und löst sie automatisch aus
  // ═════════════════════════════════════════════════════════════════════════════
  private async revenuePriorisierung(): Promise<AufgabeErgebnis> {
    logger.info("🎯 MasterAgent: Revenue-Priorisierung gestartet");
    const aktionen: string[] = [];
    let ausgeloest = 0;

    // 1. Höchste Priorität: Transaktionen ohne Affiliate-Tracking in den letzten 24h
    try {
      const offeneAttributionen = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(pendingAttributionTable)
        .where(sql`${pendingAttributionTable.referenceKey} IS NOT NULL`);
      if (Number(offeneAttributionen[0]?.count ?? 0) > 0) {
        aktionen.push(`${offeneAttributionen[0].count} offene Attributionen → sofort verarbeiten`);
      }
    } catch {}

    // 2. Hohe Priorität: Revenue-Opportunities ohne Stripe-Link
    try {
      const ohneLink = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(revenueOpportunitiesTable)
        .where(and(
          eq(revenueOpportunitiesTable.status, "aktiv"),
          sql`${revenueOpportunitiesTable.stripePaymentLink} IS NULL`
        ));
      if (Number(ohneLink[0]?.count ?? 0) > 0) {
        aktionen.push(`${ohneLink[0].count} Opportunities ohne Stripe-Link → RevenueAnalyst`);
        const { globalQueue } = await import("./JobQueue");
        globalQueue.fuegeHinzu("revenue_analyst_stripe", { aktion: "stripe_link_erstellen" }, { prioritaet: 1 });
        ausgeloest++;
      }
    } catch {}

    // 3. Produkte mit hohem Umsatz aber ohne Upsell
    try {
      const topProdukte = await db
        .select({ name: transactionsTable.produktName, anzahl: sql<number>`COUNT(*)` })
        .from(transactionsTable)
        .where(gte(transactionsTable.createdAt, new Date(Date.now() - 7 * 86400000)))
        .groupBy(transactionsTable.produktName)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(3);
      for (const p of topProdukte) {
        if (!p.name) continue;
        const existingBundle = await db.select({ count: sql<number>`COUNT(*)` })
          .from(revenueOpportunitiesTable)
          .where(sql`titel LIKE ${`%${p.name}%Bundle%`}`);
        if (Number(existingBundle[0]?.count ?? 0) === 0 && Number(p.anzahl) > 3) {
          aktionen.push(`${p.name}: ${p.anzahl} Verkäufe → Bundle erstellen`);
          const { globalQueue } = await import("./JobQueue");
          globalQueue.fuegeHinzu("monetization_upsell", { aktion: "upsell_produkte_erstellen", marke: "all" }, { prioritaet: 2 });
          ausgeloest++;
          break;
        }
      }
    } catch {}

    // 4. Prüfe ob Abo-Pläne initialisiert sind
    try {
      const plans = await db.select({ count: sql<number>`COUNT(*)` }).from(subscriptionPlansTable);
      if (Number(plans[0]?.count ?? 0) === 0) {
        aktionen.push("Keine Abo-Pläne → SubscriptionAgent init");
        const { globalQueue } = await import("./JobQueue");
        globalQueue.fuegeHinzu("subscription_full_check", { aktion: "init_plans" }, { prioritaet: 1 });
        ausgeloest++;
      }
    } catch {}

    // 5. Prüfe Coupon-Statistiken und optimiere
    try {
      const aktiveCoupons = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(couponsTable)
        .where(eq(couponsTable.aktiv, true));
      if (Number(aktiveCoupons[0]?.count ?? 0) < 3) {
        aktionen.push("Weniger als 3 aktive Coupons → SmartCouponAgent");
        const { globalQueue } = await import("./JobQueue");
        globalQueue.fuegeHinzu("smart_coupon_ki", { aktion: "ki_coupons" }, { prioritaet: 2 });
        ausgeloest++;
      }
    } catch {}

    logger.info({ aktionen, ausgeloest }, "🎯 MasterAgent: Revenue-Priorisierung abgeschlossen");
    return {
      success: true,
      message: `${ausgeloest} Aktionen automatisch ausgelöst: ${aktionen.join(" | ")}`,
      metadaten: { aktionen, ausgeloest },
    };
  }

}
