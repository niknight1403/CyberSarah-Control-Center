import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { analysiereUmsatz } from "./revenueAgent";
import { db } from "@workspace/db";
import { campaignsTable, transactionsTable } from "@workspace/db";
import { eq, sql, gte } from "drizzle-orm";
import { logger } from "../lib/logger";

export type RevenueAktion = "umsatz_analysieren" | "kampagnen_optimieren" | "roi_berechnen" | "forecast_erstellen";

export interface RevenueAufgabePayload {
  aktion: RevenueAktion;
  zeitraum?: "tag" | "woche" | "monat";
}

export class RevenueAgent extends AgentBase {
  constructor() {
    super("Revenue Agent", "revenue");
  }

  protected beschreibungText(): string {
    return "Analysiert Umsatzdaten in Echtzeit, optimiert Kampagnen-ROI und erstellt Finanz-Forecasts.";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const payload = aufgabe.payload as unknown as RevenueAufgabePayload;

    switch (payload.aktion) {
      case "umsatz_analysieren":
        return this.analysiere(aufgabe);
      case "kampagnen_optimieren":
        return this.optimiereKampagnen();
      case "roi_berechnen":
        return this.berechneRoi(payload.zeitraum ?? "monat");
      case "forecast_erstellen":
        return this.erstelleForecast();
      default:
        return { success: false, message: `Unbekannte Revenue-Aktion: ${payload.aktion}` };
    }
  }

  private async analysiere(_aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const agentId = this.holeAgentId() ?? 0;
    const report = await analysiereUmsatz(agentId);
    const roiText = report.roi !== null ? `${report.roi}%` : "keine Ausgaben";
    return {
      success: true,
      message: `Einnahmen heute: €${report.umsatzHeute.toFixed(2)} | Monat: €${report.umsatzMonat.toFixed(2)} | ROI: ${roiText}`,
      metadaten: report as unknown as Record<string, unknown>,
    };
  }

  private async optimiereKampagnen(): Promise<AufgabeErgebnis> {
    const kampagnen = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.status, "aktiv"))
      .limit(20);

    const empfehlungen: string[] = [];
    for (const k of kampagnen) {
      const klicks = k.klicks ?? 0;
      const konversionen = k.konversionen ?? 0;
      const rate = klicks > 0 ? konversionen / klicks : 0;

      if (klicks > 100 && konversionen === 0) {
        empfehlungen.push(`"${k.name}": ${klicks} Klicks ohne Konversionen → Landingpage und Tracking prüfen`);
      } else if (klicks < 10) {
        empfehlungen.push(`"${k.name}": Nur ${klicks} Klicks → Traffic-Quelle stärken`);
      } else if (rate > 0 && rate < 0.01) {
        empfehlungen.push(`"${k.name}": Konversionsrate ${(rate * 100).toFixed(2)}% → A/B-Test der Headline starten`);
      }
    }

    return {
      success: true,
      message: `${kampagnen.length} Kampagnen analysiert, ${empfehlungen.length} Optimierungen identifiziert`,
      metadaten: { gesamtKampagnen: kampagnen.length, empfehlungen },
    };
  }

  private async berechneRoi(zeitraum: string): Promise<AufgabeErgebnis> {
    const tageZurueck = zeitraum === "tag" ? 1 : zeitraum === "woche" ? 7 : 30;
    const seit = new Date();
    seit.setDate(seit.getDate() - tageZurueck);

    const [[einnahmenRes], [ausgabenRes]] = await Promise.all([
      db.select({ summe: sql<string>`COALESCE(SUM(betrag), 0)`, anzahl: sql<number>`COUNT(*)` })
        .from(transactionsTable)
        .where(sql`created_at >= ${seit} AND typ = 'einnahme'`),
      db.select({ summe: sql<string>`COALESCE(SUM(betrag), 0)` })
        .from(transactionsTable)
        .where(sql`created_at >= ${seit} AND typ = 'ausgabe'`),
    ]);

    const einnahmen = parseFloat(einnahmenRes?.summe ?? "0");
    const ausgaben = parseFloat(ausgabenRes?.summe ?? "0");
    const roi = ausgaben > 0 ? ((einnahmen - ausgaben) / ausgaben) * 100 : null;
    const roiText = roi !== null ? `${roi.toFixed(2)}%` : "keine Ausgaben im Zeitraum";

    return {
      success: true,
      message: `ROI (${zeitraum}): ${roiText} | Einnahmen: €${einnahmen.toFixed(2)} | Ausgaben: €${ausgaben.toFixed(2)}`,
      metadaten: { zeitraum, einnahmen, ausgaben, roi, transaktionen: einnahmenRes?.anzahl ?? 0 },
    };
  }

  private async erstelleForecast(): Promise<AufgabeErgebnis> {
    const vor30Tage = new Date(); vor30Tage.setDate(vor30Tage.getDate() - 30);
    const vor60Tage = new Date(); vor60Tage.setDate(vor60Tage.getDate() - 60);

    const [[monatNeuRes], [monatAltRes]] = await Promise.all([
      db.select({ summe: sql<string>`COALESCE(SUM(betrag), 0)` })
        .from(transactionsTable)
        .where(sql`created_at >= ${vor30Tage} AND typ = 'einnahme'`),
      db.select({ summe: sql<string>`COALESCE(SUM(betrag), 0)` })
        .from(transactionsTable)
        .where(sql`created_at >= ${vor60Tage} AND created_at < ${vor30Tage} AND typ = 'einnahme'`),
    ]);

    const monatNeu = parseFloat(monatNeuRes?.summe ?? "0");
    const monatAlt = parseFloat(monatAltRes?.summe ?? "0");

    // Echte Wachstumsrate aus historischen Daten
    const wachstumsrate = monatAlt > 0
      ? (monatNeu - monatAlt) / monatAlt
      : 0;

    const forecast30 = monatNeu * (1 + wachstumsrate);
    const forecast90 = monatNeu * Math.pow(1 + wachstumsrate, 3);
    const wachstumText = monatAlt > 0
      ? `${(wachstumsrate * 100).toFixed(1)}% (aus echten Daten)`
      : "0% (noch keine Vorperiode)";

    return {
      success: true,
      message: `Forecast: 30T: €${forecast30.toFixed(2)} | 90T: €${forecast90.toFixed(2)} | Wachstum/Monat: ${wachstumText}`,
      metadaten: {
        basisUmsatz: monatNeu,
        vormonatsUmsatz: monatAlt,
        wachstumsrate: Math.round(wachstumsrate * 10000) / 100,
        forecast30Tage: Math.round(forecast30 * 100) / 100,
        forecast90Tage: Math.round(forecast90 * 100) / 100,
      },
    };
  }
}
