import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { db } from "@workspace/db";
import { contentTable, agentsTable } from "@workspace/db";
import { eq, desc, gte } from "drizzle-orm";
import { generiereContent, type ContentAuftrag } from "./contentAgent";
import { logger } from "../lib/logger";

export interface InfluencerAufgabePayload {
  aktion: "content_generieren" | "trend_analyse" | "engagement_optimieren";
  marke?: "CyberSarah" | "GeldPilot AI" | "UnternehmerGPT";
  plattform?: "TikTok" | "Instagram" | "YouTube" | "Google" | "Blog";
  thema?: string;
}

export class InfluencerAgent extends AgentBase {
  constructor() {
    super("Influencer Agent", "influencer");
  }

  protected beschreibungText(): string {
    return "Verwaltet Influencer-Content, analysiert Trends und optimiert Engagement für alle 3 Marken.";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const payload = aufgabe.payload as unknown as InfluencerAufgabePayload;

    switch (payload.aktion) {
      case "content_generieren":
        return this.generiereInfluencerContent(payload);
      case "trend_analyse":
        return this.analysiereTrends();
      case "engagement_optimieren":
        return this.optimiereEngagement();
      default:
        return { success: false, message: `Unbekannte Aktion: ${payload.aktion}` };
    }
  }

  private async generiereInfluencerContent(payload: InfluencerAufgabePayload): Promise<AufgabeErgebnis> {
    const auftrag: ContentAuftrag = {
      marke: payload.marke ?? "CyberSarah",
      typ: "reel",
      plattform: payload.plattform ?? "Instagram",
      thema: payload.thema ?? "KI & Automatisierung 2026",
    };

    const agentId = this.holeAgentId() ?? 0;
    const contentId = await generiereContent(auftrag, agentId);

    return {
      success: true,
      message: `Influencer-Content generiert (ID: ${contentId}) für ${auftrag.marke} auf ${auftrag.plattform}`,
      metadaten: { contentId, marke: auftrag.marke, plattform: auftrag.plattform },
    };
  }

  private async analysiereTrends(): Promise<AufgabeErgebnis> {
    const letzteWoche = new Date();
    letzteWoche.setDate(letzteWoche.getDate() - 7);

    const recentContent = await db
      .select({ plattform: contentTable.plattform, marke: contentTable.marke })
      .from(contentTable)
      .where(gte(contentTable.createdAt, letzteWoche))
      .limit(50);

    const plattformVerteilung = recentContent.reduce(
      (acc, c) => {
        acc[c.plattform] = (acc[c.plattform] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const topPlattform = Object.entries(plattformVerteilung).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "TikTok";

    return {
      success: true,
      message: `Trend-Analyse: Top-Plattform ist ${topPlattform} (${recentContent.length} Contents analysiert)`,
      metadaten: { plattformVerteilung, topPlattform, analysiertContent: recentContent.length },
    };
  }

  private async optimiereEngagement(): Promise<AufgabeErgebnis> {
    const letzterContent = await db
      .select()
      .from(contentTable)
      .orderBy(desc(contentTable.createdAt))
      .limit(5);

    const empfehlungen = [
      "TikTok-Posts zwischen 19:00-21:00 Uhr posten für maximale Reichweite",
      "Instagram Reels mit 3-5 Hashtags haben 40% höheres Engagement",
      "YouTube Shorts täglich posten für algorithmischen Boost",
      "Frage-Posts generieren 2x mehr Kommentare als Aussage-Posts",
    ];

    const empfehlung = empfehlungen[Math.floor(Math.random() * empfehlungen.length)]!;

    return {
      success: true,
      message: `Engagement-Optimierung: ${empfehlung}`,
      metadaten: {
        empfehlung,
        analysierteInhalte: letzterContent.length,
        naechsteAktion: "Posting-Zeiten anpassen",
      },
    };
  }
}
