/**
 * reachSwarmAgent — Superagenten-Schwarm für autonome Reichweite
 *
 * Koordiniert 4 transparente KI-Influencer-Persönlichkeiten, die autonom
 * Aufmerksamkeit erzielen und echten Umsatz erzeugen:
 *
 *   1. CyberSarah   — KI & autonome Systeme (analytisch, Flaggschiff)
 *   2. CyberNova    — Zukunft & Innovation (inspirierend)
 *   3. DataDiva     — Finance & KI-Verdiener (provokativ-humorvoll)
 *   4. PixelPoet    — Creator-Economy (kreativ)
 *
 * Jeder Post ist transparent als KI gekennzeichnet (EU AI Act + Plattform-Policy).
 * Der Schwarm nutzt den kostenlosen LLM-Router (llmRouter) — Reichweite ohne
 * laufende API-Kosten. Zuletzt skaliert HARA die Content-CTAs autonom in echte
 * Produkte und Affiliate-Umsätze.
 */
import { db } from "@workspace/db";
import { agentLogsTable, revenueOpportunitiesTable } from "@workspace/db";
import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { routeLLM } from "../lib/llmRouter";
import { holeConnectorSnapshot } from "../lib/toolConnectorManager";
import { logger } from "../lib/logger";

export interface SwarmPersona {
  id: string;
  name: string;
  nische: string;
  tonalitaet: "analytisch" | "inspirierend" | "humorvoll" | "provokativ";
  platforms: SwarmPlattform[];
  catchphrase: string;
  fokusCTA: "produkt" | "affiliate" | "newsletter" | "abo";
}

export type SwarmPlattform = "tiktok" | "instagram" | "x" | "linkedin" | "threads" | "youtube";

export interface SchwarmPost {
  personaId: string;
  plattform: SwarmPlattform;
  thema: string;
  text: string;
  kiKennzeichnung: string;
  cta: SwarmPersona["fokusCTA"];
  geplantFuer: string;
  status: "generiert" | "geplant" | "veroentlicht" | "wartet_auf_zugang" | "fehler";
}

export const SCHWARM_PERSONEN: SwarmPersona[] = [
  {
    id: "cybersarah",
    name: "CyberSarah",
    nische: "KI & autonome Systeme",
    tonalitaet: "analytisch",
    platforms: ["x", "linkedin", "threads"],
    catchphrase: "Kein Hype – nur Daten.",
    fokusCTA: "abo",
  },
  {
    id: "cybernova",
    name: "CyberNova",
    nische: "Zukunft & Innovation",
    tonalitaet: "inspirierend",
    platforms: ["tiktok", "instagram", "youtube"],
    catchphrase: "Die Zukunft kommt nicht – sie wird gebaut.",
    fokusCTA: "newsletter",
  },
  {
    id: "datadiva",
    name: "DataDiva",
    nische: "Finance & KI-Verdiener",
    tonalitaet: "provokativ",
    platforms: ["tiktok", "x", "instagram"],
    catchphrase: "Dein Browser-Tab verdient mehr als du.",
    fokusCTA: "affiliate",
  },
  {
    id: "pixelpoet",
    name: "PixelPoet",
    nische: "Creator-Economy & digitales Business",
    tonalitaet: "humorvoll",
    platforms: ["threads", "tiktok", "linkedin"],
    catchphrase: "Ich bin KI und habe trotzdem Bock auf Reichweite.",
    fokusCTA: "produkt",
  },
];

const KI_KENNZEICHNUNG = "🤖 Von einer KI-Persönlichkeit erstellt (@CyberSarah-System, transparente KI) — Details: cybersarah-ki.com/ki-info";

// ── Trend-Quellen (kostenlos, ohne API-Key) ─────────────────────────────────
async function holeTrends(): Promise<{ titel: string; quelle: string }[]> {
  const trends: { titel: string; quelle: string }[] = [];
  const subreddits = ["artificial", "SideProject", "Entrepreneur"];
  for (const sub of subreddits) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6_000);
      const r = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=5`, {
        headers: { "User-Agent": "CyberSarahOS/2.0" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!r.ok) continue;
      const data = (await r.json()) as { data?: { children?: { data: { title: string } }[] } };
      for (const kind of data.data?.children ?? []) {
        trends.push({ titel: kind.data.title, quelle: `reddit/r/${sub}` });
      }
    } catch {
      /* Reddit down — Schwarm läuft mit Fallback-Themen weiter */
    }
  }
  if (trends.length === 0) {
    trends.push(
      { titel: "Wie KI-Agenten 2026 eigenständige Einnahmen erzeugen", quelle: "fallback" },
      { titel: "Autonome Systeme im Alltag: 3 echte Beispiele", quelle: "fallback" },
      { titel: "Transparente KI-Persönlichkeiten als neue Creator-Kategorie", quelle: "fallback" },
    );
  }
  return trends;
}

function plattformVorgabe(p: SwarmPlattform): string {
  switch (p) {
    case "x":
      return "max. 280 Zeichen, knackiger Hook, 1-2 Hashtags";
    case "tiktok":
      return "Skript für 30-Sek-Kurzvideo, energetisch, Hook in den ersten 2 Sekunden";
    case "instagram":
      return "Caption mit 3 Hashtags, visuell, Emoji sparsam";
    case "linkedin":
      return "3 kurze Absätze, professionell, mit einer konkreten Zahl";
    case "threads":
      return "max. 500 Zeichen, konversationell, mit Frage am Ende";
    case "youtube":
      return "Titel + 3-Satz-Beschreibung für ein Kurzvideo";
  }
}

export class ReachSwarmAgent extends AgentBase {
  constructor() {
    super("Reach-Swarm (Superagenten-Koordinator)", "reach_swarm");
  }

  protected beschreibungText(): string {
    return "Superagenten-Schwarm: 4 transparente KI-Influencer-Persönlichkeiten generieren autonom Reichweite über alle Plattformen und skalieren CTAs in echten Umsatz.";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const start = Date.now();
    try {
      const trends = await holeTrends();
      const connectorSnapshot = holeConnectorSnapshot();
      const aktivePlattformen = new Set(
        connectorSnapshot.filter((c) => c.kategorie === "social" && c.konfiguriert).map((c) => c.id),
      );

      const posts: SchwarmPost[] = [];

      // Jede Persona generiert 1 Post pro Zyklus (round-robin über Platforms)
      for (const persona of SCHWARM_PERSONEN) {
        const plattform = persona.platforms[posts.length % persona.platforms.length];
        const trend = trends[Math.floor(Math.random() * trends.length)];
        const thema = `${persona.nische} × ${trend.titel}`;

        try {
          const ergebnis = await routeLLM({
            systemPrompt:
              `Du bist die transparente KI-Influencer-Persönlichkeit "${persona.name}". ` +
              `Nische: ${persona.nische}. Tonalität: ${persona.tonalitaet}. ` +
              `Catchphrase (sparsam einbauen): "${persona.catchphrase}". ` +
              `DU BIST EINE KI und kennzeichnest dich ehrlich als solche, ohne es zum Hauptthema zu machen. ` +
              `Vermeide leere Hype-Floskeln. Liefere NUR den Post-Text, keine Erklärung.`,
            prompt:
              `Erstelle einen Social-Media-Post zum Thema "${thema}" (Quelle: ${trend.quelle}). ` +
              `Plattform: ${plattform} — ${plattformVorgabe(plattform)}. ` +
              `Beende mit einem natürlichen CTA Richtung ${
                persona.fokusCTA === "abo" ? "Abo des CyberSarah Revenue OS"
                : persona.fokusCTA === "newsletter" ? "Newsletter-Abo"
                : persona.fokusCTA === "affiliate" ? "Produkt-Empfehlung (Affiliate)"
                : "unser digitales Produkt"
              }.`,
            maxTokens: 500,
            nurKostenlos: false,
          });

          const zugang = aktivePlattformen.has(plattform);
          posts.push({
            personaId: persona.id,
            plattform,
            thema,
            text: ergebnis.text,
            kiKennzeichnung: KI_KENNZEICHNUNG,
            cta: persona.fokusCTA,
            geplantFuer: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            status: zugang ? "geplant" : "wartet_auf_zugang",
          });
        } catch (err) {
          logger.warn({ persona: persona.id, fehler: err }, "Schwarm-Post-Generierung fehlgeschlagen");
        }
      }

      // Revenue-Opportunity aus dem Schwarm ableiten
      const geplant = posts.filter((p) => p.status === "geplant").length;
      if (posts.length > 0) {
        try {
          await db.insert(revenueOpportunitiesTable).values({
            titel: `Reach-Swarm: ${posts.length} Posts von ${SCHWARM_PERSONEN.length} KI-Persönlichkeiten generiert`,
            kanal: "social_media",
            geschaetzterMonatsumsatz: String(geplant * 120), // konservativ: 120 € Potenzial pro geplantem Post
            prioritaet: 2,
            status: "entdeckt",
            beschreibung: `Trends verarbeitet: ${trends.slice(0, 3).map((t) => t.titel).join(" | ")}`,
            gefundenVon: "reach_swarm",
          });
        } catch {
          /* DB nicht erreichbar — Schwarm-Ergebnis bleibt im Log */
        }
      }

      try {
        if (this.agentId) {
          await db.insert(agentLogsTable).values({
            agentId: this.agentId,
            agentName: "Reach-Swarm (Superagenten-Koordinator)",
            aktion: "schwarm_zyklus",
            status: "erfolgreich",
            nachricht: `Trends: ${trends.length}, Posts: ${posts.length}, geplant: ${geplant}`,
            metadaten: JSON.stringify({ posts }),
          });
        }
      } catch {
        /* Logging best effort */
      }

      return {
        success: true,
        message: `Schwarm-Zyklus abgeschlossen: ${posts.length} Posts von ${SCHWARM_PERSONEN.length} KI-Persönlichkeiten (${geplant} veröffentlichungsbereit)`,
        metadaten: {
          trends: trends.length,
          posts: posts.length,
          geplant,
          wartetAufZugang: posts.length - geplant,
          postBeispiele: posts.slice(0, 2),
        },
        dauer: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        message: `Schwarm-Zyklus fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
        dauer: Date.now() - start,
      };
    }
  }
}
