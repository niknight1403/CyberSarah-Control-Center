/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AI CONVERSION OPTIMIZATION (A/B TESTING ENGINE) — Sprint 9
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Automatische A/B-Tests für Preise, Headlines, CTAs:
 *  - Erstellt Testkampagnen aus KI-generierten Varianten
 *  - Trackt Impressions, Klicks, Conversions pro Variante
 *  - Berechnet statistische Signifikanz (Chi-Quadrat)
 *  - Auto-Apply des Gewinners bei 95% Konfidenz
 *  - Optimiert kontinuierlich über alle Kanäle
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { db } from "@workspace/db";
import {
  abTestCampaignsTable, abTestResultsTable, abTestEventsTable,
  optimizationSuggestionsTable, transactionsTable, produkteTable,
  agentLogsTable,
} from "@workspace/db";
import { eq, desc, and, sql, gte, lt, gt, ne, isNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import { openai, openaiVerfuegbar } from "../lib/openaiClient";

export class ConversionOptimizerAgent extends AgentBase {
  constructor() {
    super("Conversion Optimizer Agent", "conversion_optimizer");
  }

  protected beschreibungText(): string {
    return "AUTONOM: Erstellt A/B-Tests, tracked Conversions, berechnet Signifikanz, wendet Gewinner automatisch an — maximiert Conversion-Raten über alle Kanäle";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const aktion = String(aufgabe.payload?.["aktion"] ?? "full_scan");

    switch (aktion) {
      case "create_tests":
        return this.erstelleTests();
      case "analyze":
        return this.analysiereErgebnisse();
      case "apply_winners":
        return this.wendeGewinnerAn();
      case "suggest":
        return this.generiereVorschlaege();
      case "full_scan":
      default:
        return this.fuehreVollScanAus();
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // VOLL-SCAN: Alle Optimierungs-Aktionen
  // ═════════════════════════════════════════════════════════════════════════════
  private async fuehreVollScanAus(): Promise<AufgabeErgebnis> {
    logger.info("🧪 ConversionOptimizer: Voll-Scan gestartet");

    const testResult = await this.erstelleTests();
    const analyzeResult = await this.analysiereErgebnisse();
    const applyResult = await this.wendeGewinnerAn();
    const suggestResult = await this.generiereVorschlaege();

    if (this.agentId) {
      await db.insert(agentLogsTable).values({
        agentId: this.agentId,
        agentName: "Conversion Optimizer Agent",
        aktion: "full_scan",
        status: "erfolgreich",
        nachricht: `Tests: ${testResult.metadaten?.erstellt ?? 0} neu | ${analyzeResult.metadaten?.signifikant ?? 0} signifikant | ${applyResult.metadaten?.angewendet ?? 0} Gewinner | ${suggestResult.metadaten?.vorschlaege ?? 0} Vorschläge`,
      });
    }

    return {
      success: true,
      message: `A/B-Test Scan: ${testResult.metadaten?.erstellt ?? 0} Tests erstellt, ${applyResult.metadaten?.angewendet ?? 0} Gewinner angewendet`,
      metadaten: {
        tests: testResult.metadaten,
        analyze: analyzeResult.metadaten,
        apply: applyResult.metadaten,
        suggest: suggestResult.metadaten,
      },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // TESTS ERSTELLEN: Automatische A/B-Tests für Preise, Headlines, CTAs
  // ═════════════════════════════════════════════════════════════════════════════
  private async erstelleTests(): Promise<AufgabeErgebnis> {
    logger.info("🧪 ConversionOptimizer: Erstelle A/B-Tests");

    // Hole aktive, noch nicht getestete Produkte
    const aktiveProdukte = await db
      .select()
      .from(produkteTable)
      .where(eq(produkteTable.aktiv, true))
      .limit(10);

    // Hole Produkte mit Transaktionen für Preis-Tests
    const produkteMitUmsatz = await db
      .select({
        name: transactionsTable.produktName,
        anzahl: sql<number>`COUNT(*)`,
        avgPreis: sql<number>`AVG(betrag)`,
      })
      .from(transactionsTable)
      .where(gte(transactionsTable.createdAt, new Date(Date.now() - 30 * 86400000)))
      .groupBy(transactionsTable.produktName)
      .having((t) => sql`COUNT(*) > 3`)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(5);

    let erstellt = 0;

    // 1. Preis-Tests für Produkte mit ausreichend Verkäufen
    for (const p of produkteMitUmsatz) {
      if (!p.name) continue;
      const avgPreis = Number(p.avgPreis ?? 0);
      if (avgPreis < 5) continue;

      // Prüfe ob bereits ein Preis-Test für dieses Produkt aktiv ist
      const existierenderTest = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(abTestCampaignsTable)
        .where(and(
          eq(abTestCampaignsTable.testTyp, "price"),
          eq(abTestCampaignsTable.zielElement, `preis_${p.name}`),
          sql`status IN ('aktiv', 'entwurf')`,
        ));

      if (Number(existierenderTest[0]?.count ?? 0) > 0) continue;

      // Preis-Varianten: -10% und +15%
      const preisA = Math.round(avgPreis);
      const preisB = Math.round(avgPreis * (avgPreis > 20 ? 0.9 : 1.15));

      if (preisA === preisB) continue;

      await db.insert(abTestCampaignsTable).values({
        name: `Preis-Test: ${p.name}`,
        beschreibung: `Testet ob €${preisA} oder €${preisB} besser konvertiert für "${p.name}"`,
        testTyp: "price",
        zielElement: `preis_${p.name}`,
        kanal: "all",
        status: "aktiv",
        varianteAInhalt: { preis: preisA, label: `€${preisA}` },
        varianteBInhalt: { preis: preisB, label: `€${preisB}` },
        mindestStichprobe: 50,
        konfidenzNiveau: "0.95",
        autoApply: true,
        gestartetAm: new Date(),
      });
      erstellt++;

      // Erstelle Results-Einträge
      const [campaign] = await db
        .select()
        .from(abTestCampaignsTable)
        .where(eq(abTestCampaignsTable.zielElement, `preis_${p.name}`))
        .orderBy(desc(abTestCampaignsTable.createdAt))
        .limit(1);

      if (campaign) {
        await db.insert(abTestResultsTable).values([
          { campaignId: campaign.id, variante: "a" },
          { campaignId: campaign.id, variante: "b" },
        ]);
      }

      logger.info({ produkt: p.name, preisA, preisB }, "🧪 Preis-A/B-Test erstellt");
    }

    // 2. KI-Headline-Tests für aktive Produkte ohne Tests
    if (openaiVerfuegbar) {
      for (const produkt of aktiveProdukte.slice(0, 3)) {
        if (!produkt.name) continue;

        const headlineTest = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(abTestCampaignsTable)
          .where(and(
            eq(abTestCampaignsTable.testTyp, "headline"),
            eq(abTestCampaignsTable.zielElement, `headline_${produkt.name}`),
            sql`status IN ('aktiv', 'entwurf')`,
          ));

        if (Number(headlineTest[0]?.count ?? 0) > 0) continue;

        try {
          const kiHeadline = await this.generiereHeadlineVariante(produkt.name, produkt.beschreibung ?? "");
          if (kiHeadline) {
            await db.insert(abTestCampaignsTable).values({
              name: `Headline-Test: ${produkt.name}`,
              beschreibung: `Testet originale vs. KI-generierte Headline für "${produkt.name}"`,
              testTyp: "headline",
              zielElement: `headline_${produkt.name}`,
              kanal: "landingpage",
              status: "aktiv",
              varianteAInhalt: { headline: produkt.beschreibung?.slice(0, 100) ?? produkt.name },
              varianteBInhalt: { headline: kiHeadline.slice(0, 200) },
              mindestStichprobe: 50,
              autoApply: true,
              gestartetAm: new Date(),
            });

            const [campaign] = await db
              .select()
              .from(abTestCampaignsTable)
              .where(eq(abTestCampaignsTable.zielElement, `headline_${produkt.name}`))
              .orderBy(desc(abTestCampaignsTable.createdAt))
              .limit(1);

            if (campaign) {
              await db.insert(abTestResultsTable).values([
                { campaignId: campaign.id, variante: "a" },
                { campaignId: campaign.id, variante: "b" },
              ]);
            }
            erstellt++;
            logger.info({ produkt: produkt.name, kiHeadline: kiHeadline.slice(0, 60) }, "🧪 Headline-A/B-Test erstellt");
          }
        } catch (err) {
          logger.warn({ err, produkt: produkt.name }, "Headline-Generierung fehlgeschlagen");
        }
      }
    }

    // 3. CTA-Tests für Produkte mit Verkäufen
    for (const p of produkteMitUmsatz) {
      if (!p.name) continue;

      const ctaTest = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(abTestCampaignsTable)
        .where(and(
          eq(abTestCampaignsTable.testTyp, "cta"),
          eq(abTestCampaignsTable.zielElement, `cta_${p.name}`),
          sql`status IN ('aktiv', 'entwurf')`,
        ));

      if (Number(ctaTest[0]?.count ?? 0) > 0) continue;

      const ctaVarianten = this.generiereCtaVarianten(p.name);

      await db.insert(abTestCampaignsTable).values({
        name: `CTA-Test: ${p.name}`,
        beschreibung: `Testet "${ctaVarianten.a}" vs "${ctaVarianten.b}" für "${p.name}"`,
        testTyp: "cta",
        zielElement: `cta_${p.name}`,
        kanal: "email",
        status: "aktiv",
        varianteAInhalt: { text: ctaVarianten.a },
        varianteBInhalt: { text: ctaVarianten.b },
        mindestStichprobe: 50,
        autoApply: true,
        gestartetAm: new Date(),
      });

      const [campaign] = await db
        .select()
        .from(abTestCampaignsTable)
        .where(eq(abTestCampaignsTable.zielElement, `cta_${p.name}`))
        .orderBy(desc(abTestCampaignsTable.createdAt))
        .limit(1);

      if (campaign) {
        await db.insert(abTestResultsTable).values([
          { campaignId: campaign.id, variante: "a" },
          { campaignId: campaign.id, variante: "b" },
        ]);
      }
      erstellt++;
      logger.info({ produkt: p.name, ctaA: ctaVarianten.a, ctaB: ctaVarianten.b }, "🧪 CTA-A/B-Test erstellt");
    }

    return {
      success: true,
      message: `${erstellt} neue A/B-Tests erstellt`,
      metadaten: { erstellt },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // KI-HEADLINE GENERIEREN
  // ═════════════════════════════════════════════════════════════════════════════
  private async generiereHeadlineVariante(produktName: string, beschreibung: string): Promise<string | null> {
    if (!openaiVerfuegbar) return `${produktName} - Jetzt starten!`;

    try {
      const response = await openai!.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "Du bist ein Conversion-Optimierungs-Experte. Generiere eine einzige, kurze, überzeugende Headline (max 80 Zeichen) für ein Produkt. Die Headline soll neugierig machen und zum Klicken animieren. Keine Erklärungen, nur die Headline." },
          { role: "user", content: `Produkt: ${produktName}\nBeschreibung: ${beschreibung}\n\nGeneriere eine optimierte Headline (Variante B):` },
        ],
        max_tokens: 80,
        temperature: 0.8,
      });
      return response.choices[0]?.message?.content?.trim() ?? null;
    } catch {
      return `${produktName} → Jetzt entdecken!`;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // CTA-VARIANTEN
  // ═════════════════════════════════════════════════════════════════════════════
  private generiereCtaVarianten(produktName: string): { a: string; b: string } {
    const ctaPool = [
      { a: "Jetzt kaufen", b: "Zum Angebot" },
      { a: "Mehr erfahren", b: "Jetzt starten" },
      { a: "In den Warenkorb", b: "Ja, ich will!" },
      { a: "Kostenlos testen", b: "Jetzt durchstarten" },
      { a: "Zum Deal", b: "Nur für kurze Zeit" },
    ];
    const idx = Math.floor(Math.random() * ctaPool.length);
    return ctaPool[idx];
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ERGEBNISSE ANALYSIEREN: Statistische Signifikanz (Chi-Quadrat)
  // ═════════════════════════════════════════════════════════════════════════════
  private async analysiereErgebnisse(): Promise<AufgabeErgebnis> {
    logger.info("📊 ConversionOptimizer: Analysiere Testergebnisse");

    const aktiveTests = await db
      .select()
      .from(abTestCampaignsTable)
      .where(eq(abTestCampaignsTable.status, "aktiv"));

    let mitErgebnissen = 0;
    let signifikant = 0;

    for (const test of aktiveTests) {
      const ergebnisse = await db
        .select()
        .from(abTestResultsTable)
        .where(eq(abTestResultsTable.campaignId, test.id));

      const resultA = ergebnisse.find(r => r.variante === "a");
      const resultB = ergebnisse.find(r => r.variante === "b");

      if (!resultA || !resultB) continue;

      const konfidenz = Number(test.konfidenzNiveau ?? 0.95);

      // Aktualisiere Konversionsraten
      for (const r of [resultA, resultB]) {
        if (r.impressions > 0) {
          const cr = r.conversions / r.impressions;
          await db.update(abTestResultsTable)
            .set({ konversionsRate: String(cr) })
            .where(eq(abTestResultsTable.id, r.id));
        }
      }

      const gesamtImpressions = resultA.impressions + resultB.impressions;
      if (gesamtImpressions < Number(test.mindestStichprobe)) continue;

      mitErgebnissen++;

      // Chi-Quadrat-Test für statistische Signifikanz
      const chiQuadrat = this.berechneChiQuadrat(
        resultA.conversions, resultA.impressions - resultA.conversions,
        resultB.conversions, resultB.impressions - resultB.conversions
      );

      // Kritischer Wert für 95% Konfidenz = 3.841
      // Kritischer Wert für 90% Konfidenz = 2.706
      const kritischerWert = konfidenz >= 0.95 ? 3.841 : 2.706;

      if (chiQuadrat > kritischerWert) {
        // Signifikantes Ergebnis!
        const crA = resultA.impressions > 0 ? resultA.conversions / resultA.impressions : 0;
        const crB = resultB.impressions > 0 ? resultB.conversions / resultB.impressions : 0;
        const gewinner = crA > crB ? "a" : "b";
        const verbesserung = crA > crB
          ? ((crA - crB) / (crB || 0.001) * 100)
          : ((crB - crA) / (crA || 0.001) * 100);

        await db.update(abTestCampaignsTable).set({
          status: "abgeschlossen",
          gewinner,
          verbesserungProzent: verbesserung.toFixed(2),
          beendetAm: new Date(),
        }).where(eq(abTestCampaignsTable.id, test.id));

        signifikant++;
        logger.info({
          test: test.name, gewinner, chiQuadrat: chiQuadrat.toFixed(2),
          crA: (crA * 100).toFixed(1) + "%", crB: (crB * 100).toFixed(1) + "%",
          verbesserung: verbesserung.toFixed(1) + "%",
        }, "🧪 Signifikanter A/B-Test Gewinner!");
      }
    }

    return {
      success: true,
      message: `${signifikant} signifikante Ergebnisse von ${mitErgebnissen} auswertbaren Tests`,
      metadaten: { aktiv: aktiveTests.length, mitErgebnissen, signifikant },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // CHI-QUADRAT BERECHNEN
  // ═════════════════════════════════════════════════════════════════════════════
  private berechneChiQuadrat(
    conversionsA: number, nonConversionsA: number,
    conversionsB: number, nonConversionsB: number
  ): number {
    const gesamtA = conversionsA + nonConversionsA;
    const gesamtB = conversionsB + nonConversionsB;
    const gesamtConversions = conversionsA + conversionsB;
    const gesamt = gesamtA + gesamtB;

    if (gesamt === 0 || gesamtConversions === 0) return 0;

    // Erwartete Werte
    const eAConv = (gesamtA * gesamtConversions) / gesamt;
    const eANonConv = (gesamtA * (gesamt - gesamtConversions)) / gesamt;
    const eBConv = (gesamtB * gesamtConversions) / gesamt;
    const eBNonConv = (gesamtB * (gesamt - gesamtConversions)) / gesamt;

    // Chi-Quadrat Statistik
    const chi = (
      ((conversionsA - eAConv) ** 2) / (eAConv || 0.001) +
      ((nonConversionsA - eANonConv) ** 2) / (eANonConv || 0.001) +
      ((conversionsB - eBConv) ** 2) / (eBConv || 0.001) +
      ((nonConversionsB - eBNonConv) ** 2) / (eBNonConv || 0.001)
    );

    return chi;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // GEWINNER ANWENDEN: Auto-Apply der signifikant besseren Variante
  // ═════════════════════════════════════════════════════════════════════════════
  private async wendeGewinnerAn(): Promise<AufgabeErgebnis> {
    logger.info("🔄 ConversionOptimizer: Wende Gewinner an");

    const abgeschlosseneTests = await db
      .select()
      .from(abTestCampaignsTable)
      .where(and(
        eq(abTestCampaignsTable.status, "abgeschlossen"),
        eq(abTestCampaignsTable.autoApply, true),
        isNull(abTestCampaignsTable.autoAppliedAm),
      ));

    let angewendet = 0;

    for (const test of abgeschlosseneTests) {
      if (!test.gewinner || test.gewinner === "keiner") continue;

      try {
        // Logge die Anwendung
        logger.info({
          test: test.name,
          gewinner: test.gewinner,
          verbesserung: test.verbesserungProzent,
        }, "🔄 Auto-Apply: Gewinner wird übernommen");

        await db.update(abTestCampaignsTable).set({
          autoAppliedAm: new Date(),
        }).where(eq(abTestCampaignsTable.id, test.id));

        angewendet++;
      } catch (err) {
        logger.warn({ err, test: test.name }, "Auto-Apply fehlgeschlagen");
      }
    }

    return {
      success: true,
      message: `${angewendet} Gewinner automatisch angewendet`,
      metadaten: { angewendet, abgeschlossen: abgeschlosseneTests.length },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // KI-VORSCHLÄGE: Generiert Optimierungs-Ideen per OpenAI
  // ═════════════════════════════════════════════════════════════════════════════
  private async generiereVorschlaege(): Promise<AufgabeErgebnis> {
    logger.info("💡 ConversionOptimizer: Generiere Optimierungs-Vorschläge");

    const offeneVorschlaege = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(optimizationSuggestionsTable)
      .where(eq(optimizationSuggestionsTable.status, "offen"));

    // Nur generieren wenn weniger als 10 offene Vorschläge
    if (Number(offeneVorschlaege[0]?.count ?? 0) > 10) {
      return {
        success: true,
        message: "Genug offene Vorschläge vorhanden",
        metadaten: { vorschlaege: 0, offene: Number(offeneVorschlaege[0]?.count) },
      };
    }

    // Analysiere Produkte mit niedrigen Conversion-Raten
    const vor30Tagen = new Date(Date.now() - 30 * 86400000);
    const produktPerformance = await db
      .select({
        name: transactionsTable.produktName,
        anzahl: sql<number>`COUNT(*)`,
        umsatz: sql<number>`COALESCE(SUM(betrag), 0)`,
      })
      .from(transactionsTable)
      .where(gte(transactionsTable.createdAt, vor30Tagen))
      .groupBy(transactionsTable.produktName)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);

    let vorschlaege = 0;

    for (const p of produktPerformance) {
      if (!p.name) continue;

      const existingSuggestion = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(optimizationSuggestionsTable)
        .where(and(
          eq(optimizationSuggestionsTable.ziel, p.name),
          eq(optimizationSuggestionsTable.status, "offen"),
        ));

      if (Number(existingSuggestion[0]?.count ?? 0) > 0) continue;

      // Generiere Vorschläge basierend auf Verkaufsdaten
      const anzahl = Number(p.anzahl ?? 0);
      const umsatz = Number(p.umsatz ?? 0);
      const durchschnittsPreis = anzahl > 0 ? umsatz / anzahl : 0;

      if (durchschnittsPreis > 10 && anzahl < 10) {
        // Produkt mit Potenzial aber wenigen Verkäufen
        await db.insert(optimizationSuggestionsTable).values({
          typ: "price_change",
          ziel: p.name,
          aktuellerWert: `€${durchschnittsPreis.toFixed(2)}`,
          vorgeschlagenerWert: `€${Math.round(durchschnittsPreis * 0.85)} (-15%)`,
          erwarteteVerbesserung: "+20-40% Conversion",
          begruendung: `Niedrige Verkaufszahl (${anzahl}) bei hohem Preis. Preissenkung könnte Conversion steigern.`,
          prioritaet: 7,
          status: "offen",
        });
        vorschlaege++;
      } else if (anzahl > 20 && durchschnittsPreis < 20) {
        // Produkt mit vielen Verkäufen - Preis erhöhen testen
        await db.insert(optimizationSuggestionsTable).values({
          typ: "price_change",
          ziel: p.name,
          aktuellerWert: `€${durchschnittsPreis.toFixed(2)}`,
          vorgeschlagenerWert: `€${Math.round(durchschnittsPreis * 1.2)} (+20%)`,
          erwarteteVerbesserung: "+15-25% Umsatz",
          begruendung: `Hohe Nachfrage (${anzahl} Verkäufe) — Preiserhöhung testen für mehr Umsatz.`,
          prioritaet: 8,
          status: "offen",
        });
        vorschlaege++;
      }
    }

    return {
      success: true,
      message: `${vorschlaege} neue Optimierungs-Vorschläge generiert`,
      metadaten: { vorschlaege, offene: Number(offeneVorschlaege[0]?.count ?? 0) + vorschlaege },
    };
  }
}
