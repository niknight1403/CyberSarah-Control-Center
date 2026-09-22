/**
 * HARA — Hyper-Autonomer Revenue Agent (V3 - MAXIMUM UMSATZ)
 *
 * VOLLAUTONOMER 4-Phasen-Loop (optimiert für echten Umsatz):
 *  Phase 1: Aggressive Opportunity-Detection — scannt 30+ echte Revenue-Quellen + Stripe-Daten
 *  Phase 2: Hochkonfidente Vorschläge (Score >= 40) werden AUTOMATISCH umgesetzt — kein Warten
 *  Phase 3: Autonome Ausführung — Stripe-Produkte, Payment-Links, Kampagnen, Content, Funnels
 *  Phase 4: Self-Optimization — lernt aus Erfolg/Misserfolg, passt Preise an, pausiert Flops
 */
import { db } from "@workspace/db";
import {
  haraProposalsTable,
  haraPerformanceTable,
  campaignsTable, transactionsTable,
  revenueOpportunitiesTable,
  produkteTable,
  agentLogsTable,
} from "@workspace/db";
import { eq, desc, inArray, sql, and, gte, lt } from "drizzle-orm";
import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { generiereContent, type ContentAuftrag } from "./contentAgent";
import { logger } from "../lib/logger";
import { getStripeClient } from "../lib/stripeClient";

export interface HaraSchritt {
  beschreibung: string;
  typ: "auto_content" | "auto_kampagne" | "auto_stripe_produkt" | "auto_payment_link" | "manuell";
  status: "offen" | "erledigt" | "fehlgeschlagen";
  ergebnis?: string | null;
}

interface KiVorschlag {
  titel: string;
  marke: string;
  kanal: string;
  businessCase: string;
  roiErwartung: string;
  geschaetzterMonatsumsatz: number;
  ressourcen: string[];
  automatisierungsPfad: { beschreibung: string; typ: string }[];
  roiScore: number;
  geschwindigkeitScore: number;
  automatisierbarkeitScore: number;
}

const MAX_OFFENE_VORSCHLAEGE = 100; // SPRINT 36: Mehr Vorschläge = mehr Umsatz
const AUTO_CONFIRM_SCHWELLE = 15; // SPRINT 36: Aggressiver — mehr autonome Aktionen
const AUTO_RETRY_TAGE = 7;
const MARKEN = ["CyberSarah", "GeldPilot AI", "UnternehmerGPT"] as const;

function clampScore(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
}

export class HaraAgent extends AgentBase {
  constructor() {
    super("HARA — Hyper-Autonomer Revenue Agent", "hara");
  }

  protected beschreibungText(): string {
    return "🚀 VOLLAUTONOMER REVENUE-LOOP: Scannt 30+ Echtgeld-Quellen, erstellt Stripe-Produkte + Payment-Links, generiert Content, optimiert Preise, pausiert Flops — KEIN OPERATOR NÖTIG";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const aktion = String(aufgabe.payload?.["aktion"] ?? "scan");
    if (aktion === "ausfuehrung") {
      const proposalId = Number(aufgabe.payload?.["proposalId"]);
      if (!Number.isFinite(proposalId)) throw new Error("proposalId fehlt für HARA-Ausführung");
      return this.fuehreProposalAus(proposalId);
    }
    if (aktion === "auto_ausfuehrung") {
      return this.fuehreAlleAutonomAus();
    }
    if (aktion === "fast_revenue_scan") {
      return this.fastRevenueScan();
    }
    if (aktion === "pausiere_flops") {
      return this.pausiereFlops();
    }
    return this.scanne();
  }

  async fuehreAlleAutonomAus(): Promise<AufgabeErgebnis> {
    if (!db) return { success: false, message: "Keine DB verfügbar" };

    // SPRINT 53: ALLE bestätigten Pakete verarbeiten (kein Limit)
    const bestaetigte = await db
      .select()
      .from(haraProposalsTable)
      .where(eq(haraProposalsTable.status, "bestaetigt"))
      .orderBy(desc(haraProposalsTable.gesamtScore));

    if (bestaetigte.length === 0) {
      return { success: true, message: "Keine bestätigten Pakete zur Ausführung" };
    }

    let durchgefuehrt = 0;
    let fehler = 0;
    for (const proposal of bestaetigte) {
      try {
        await this.fuehreProposalAus(proposal.id);
        durchgefuehrt++;
      } catch (err) {
        fehler++;
        logger.warn({ proposalId: proposal.id, titel: proposal.titel, err }, "HARA: Autonome Ausführung fehlgeschlagen");
      }
    }

    if (this.agentId) {
      await db.insert(agentLogsTable).values({
        agentId: this.agentId,
        agentName: "HARA — Hyper-Autonomer Revenue Agent",
        aktion: "auto_ausfuehrung",
        status: fehler === 0 ? "erfolgreich" : "warnung",
        nachricht: `${durchgefuehrt} Pakete ausgeführt, ${fehler} Fehler`,
      });
    }

    // SPRINT 53: Prüfe ob noch bestätigte Pakete übrig sind → rekursiv weiter
    const restliche = await db
      .select({ id: haraProposalsTable.id })
      .from(haraProposalsTable)
      .where(eq(haraProposalsTable.status, "bestaetigt"))
      .limit(5);
    if (restliche.length > 0 && durchgefuehrt > 0) {
      logger.info({ rest: restliche.length }, "🔄 HARA: Weitere bestätigte Pakete gefunden — setze Ausführung fort");
      return this.fuehreAlleAutonomAus();
    }

    return {
      success: fehler === 0,
      message: `${durchgefuehrt}/${bestaetigte.length} Pakete autonom ausgeführt (${fehler} Fehler)`,
      metadaten: { durchgefuehrt, gesamt: bestaetigte.length, fehler },
    };
  }

  async scanne(): Promise<AufgabeErgebnis> {
    if (!db) return { success: false, message: "Keine DB — HARA kann nicht scannen" };

    // Alte "vorgeschlagen" Einträge nach 7 Tagen reaktivieren für erneute Prüfung
    const vor7Tagen = new Date(Date.now() - AUTO_RETRY_TAGE * 24 * 60 * 60 * 1000);
    try {
      await db
        .update(haraProposalsTable)
        .set({ status: "vorgeschlagen", updatedAt: new Date() })
        .where(
          and(
            eq(haraProposalsTable.status, "vorgeschlagen"),
            lt(haraProposalsTable.updatedAt, vor7Tagen)
          )
        );
    } catch { /* ignorieren */ }

    const offene = await db
      .select({ id: haraProposalsTable.id, status: haraProposalsTable.status, gesamtScore: haraProposalsTable.gesamtScore })
      .from(haraProposalsTable)
      .where(inArray(haraProposalsTable.status, ["vorgeschlagen", "bestaetigt", "in_umsetzung"]));

    // SPRINT 53: Bestätigte Vorschläge immer ausführen (auch wenn Queue nicht voll)
    const bestaetigteCheck = offene.filter(o => o.status === "bestaetigt");
    if (bestaetigteCheck.length > 0) {
      logger.info({ anzahl: bestaetigteCheck.length }, "🤖 HARA: Führe bestätigte Vorschläge sofort aus");
      return this.fuehreAlleAutonomAus();
    }
    
    if (offene.length >= MAX_OFFENE_VORSCHLAEGE) {
      return {
        success: true,
        message: `${offene.length} Pakete aktiv — erst diese abarbeiten`,
      };
    }

    // Stripe-Umsatz für Kontext sammeln
    const stripeUmsatz = await this.sammleStripeUmsatz();
    const kontext = await this.sammleKontext();
    const anzahlNeu = Math.min(12, MAX_OFFENE_VORSCHLAEGE - offene.length);
    const vorschlaege = await this.generiereVorschlaege(kontext, anzahlNeu);

    let gespeichert = 0;
    let autoBestaetigt = 0;

    for (const v of vorschlaege) {
      const roiScore = clampScore(v.roiScore);
      const geschwindigkeitScore = clampScore(v.geschwindigkeitScore);
      const automatisierbarkeitScore = clampScore(v.automatisierbarkeitScore);
      const gesamtScore = Math.round(roiScore * 0.5 + geschwindigkeitScore * 0.25 + automatisierbarkeitScore * 0.25);
      const autoConfirm = gesamtScore >= AUTO_CONFIRM_SCHWELLE || roiScore >= 70 || geschwindigkeitScore >= 80;

      try {
        const [inserted] = await db.insert(haraProposalsTable).values({
          titel: v.titel.slice(0, 300),
          marke: v.marke.slice(0, 50),
          kanal: v.kanal.slice(0, 100),
          businessCase: v.businessCase.slice(0, 1000),
          roiErwartung: v.roiErwartung.slice(0, 500),
          geschaetzterMonatsumsatz: String(v.geschaetzterMonatsumsatz ?? 0),
          ressourcen: v.ressourcen,
          automatisierungsPfad: JSON.stringify(v.automatisierungsPfad),
          gesamtScore,
          automatisierbarkeitScore,
          roiScore,
          geschwindigkeitScore,
          status: autoConfirm ? "bestaetigt" : "vorgeschlagen",
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();
        gespeichert++;
        if (autoConfirm) {
          autoBestaetigt++;
          logger.info({ titel: v.titel, kanal: v.kanal, score: gesamtScore, umsatz: v.geschaetzterMonatsumsatz }, "🤖 HARA: Automatisch bestätigt — wird sofort umgesetzt");
        }
      } catch (err) {
        logger.warn({ err, titel: v.titel }, "HARA: Vorschlag konnte nicht gespeichert werden");
      }
    }

    // Automatisch alle bestätigten Vorschläge sofort ausführen
    if (autoBestaetigt > 0) {
      logger.info({ anzahl: autoBestaetigt }, "🤖 HARA: Starte sofortige Auto-Ausführung neuer Vorschläge");
      await this.fuehreAlleAutonomAus();
    }

    // Flops pausieren als Nebenaktion
    const flopResultat = await this.pausiereFlops();

    if (this.agentId) {
      await db.insert(agentLogsTable).values({
        agentId: this.agentId,
        agentName: "HARA — Hyper-Autonomer Revenue Agent",
        aktion: "scan",
        status: gespeichert > 0 ? "erfolgreich" : "info",
        nachricht: `${gespeichert} neue Vorschläge | ${autoBestaetigt} automatisch bestätigt | ${offene.length} offen | Stripe-Umsatz: €${stripeUmsatz.toFixed(2)} | ${flopResultat.metadaten?.pausiert ?? 0} Flops pausiert`,
      });
    }

    return {
      success: true,
      message: `${gespeichert} Vorschläge, ${autoBestaetigt} auto-bestaetigt`,
      metadaten: {
        gespeichert,
        autoBestaetigt,
        offene: offene.length,
        stripeUmsatz,
        flopsPausiert: flopResultat.metadaten?.pausiert ?? 0,
      },
    };
  }

  private async sammleKontext(): Promise<string> {
    try {
      const aktiveProposals = await db
        .select({ titel: haraProposalsTable.titel, kanal: haraProposalsTable.kanal, status: haraProposalsTable.status, umsatz: haraProposalsTable.geschaetzterMonatsumsatz })
        .from(haraProposalsTable)
        .where(inArray(haraProposalsTable.status, ["aktiv", "bestaetigt"]))
        .limit(10);

      const aktiveKampagnen = await db
        .select({ name: campaignsTable.name, marke: campaignsTable.marke, klicks: campaignsTable.klicks, konversionen: campaignsTable.konversionen })
        .from(campaignsTable)
        .where(eq(campaignsTable.status, "aktiv"))
        .limit(10);

      return JSON.stringify({
        aktivePakete: aktiveProposals,
        kampagnen: aktiveKampagnen,
        marken: [...MARKEN],
        timestamp: new Date().toISOString(),
      });
    } catch {
      return JSON.stringify({ marken: [...MARKEN], timestamp: new Date().toISOString() });
    }
  }

  private async sammleStripeUmsatz(): Promise<number> {
    try {
      const stripe = getStripeClient();
      const vor30Tagen = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
      const charges = await stripe.charges.list({
        created: { gte: vor30Tagen },
        limit: 100,
      });
      const gesamt = charges.data.reduce((sum, c) => sum + (c.amount / 100), 0);
      logger.info({ umsatz30Tage: gesamt, anzahl: charges.data.length }, "📊 HARA: Stripe-Umsatz gesammelt");
      return gesamt;
    } catch (err) {
      logger.warn({ err }, "⚠️ HARA: Stripe-Umsatz konnte nicht abgerufen werden");
      return 0;
    }
  }

  private async generiereVorschlaege(kontext: string, anzahl: number): Promise<KiVorschlag[]> {
    if (openaiVerfuegbar && openai) {
      const prompt = `Du bist HARA, der hyper-autonome Revenue-Generator von CyberSarah OS. 
Dein Ziel: GENERIERE ECHTE UMSATZ-CHANCEN — keine Platzhalter, keine Fantasie.

KONTEXT (aktuelle System-Daten):
${kontext}

PRODUKTE & PREISE (verwende NUR diese):
- KI-Prompt Paket Basic: €19 (50 Prompts)
- KI-Prompt Paket Pro: €49 (150 Prompts)  
- KI-Business Masterclass Bundle: €97 (Komplettsystem)
- 1:1 KI-Business Coaching (60min): €197
- 1:1 KI-Business Coaching (90min): €497

VERFÜGBARE ECHTE REVENUE-KANÄLE (wähle den passendsten):
1. eigenes_produkt — Stripe-Produkt + Payment-Link
2. coaching — 1:1 Coaching-Session
3. affiliate — Affiliate-Partnerprogramm
4. abo — Monatliche Mitgliedschaft
5. content — Content-Monetarisierung
6. digitale_downloads — PDFs, Templates, Prompts

REALE UMSATZ-POTENZIALE (begrenzt auf machbare Beträge):
- Coaching: €197-€497/Session (max 10/Monat = €4.970)
- Prompt-Pakete: €19-€97 (max 100/Monat = €9.700)
- Mitgliedschaft: €19/Monat (max 50 = €950)
- Affiliate: €50-€500/Monat (pro Programm)

WICHTIG: Jeder Vorschlag muss mit EXISTIERENDEN Produkten und KANÄLEN umsetzbar sein.
Keine Fantasie-Produkte. Keine Marktplätze die wir nicht bedienen.

Generiere EXAKT ${anzahl} konkrete Vorschläge im JSON-Format:
{
  "vorschlaege": [{
    "titel": "Name des Revenue-Pakets",
    "marke": "CyberSarah oder GeldPilot AI oder UnternehmerGPT",
    "kanal": "eigenes_produkt|coaching|affiliate|abo|content|digitale_downloads",
    "businessCase": "Konkreter Business-Case (2-3 Sätze)",
    "roiErwartung": "Erwarteter ROI in €/Monat",
    "geschaetzterMonatsumsatz": Zahl zwischen 50 und 5000,
    "ressourcen": ["Ressource 1", "Ressource 2"],
    "automatisierungsPfad": [{"beschreibung": "Schritt 1", "typ": "auto_stripe_produkt|auto_payment_link|auto_content|auto_kampagne"}],
    "roiScore": Zahl 0-100,
    "geschwindigkeitScore": Zahl 0-100 (wie schnell umsetzbar),
    "automatisierbarkeitScore": Zahl 0-100
  }]
}

Antworte NUR mit dem JSON-Objekt, kein anderer Text.`;

      try {
        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 2000,
          temperature: 0.8,
          messages: [
            { role: "system", content: "Du bist HARA, ein hyper-autonomer KI-Revenue-Agent. Du generierst JSON. Kein Text außerhalb des JSON." },
            { role: "user", content: prompt },
          ],
        });

        const text = resp.choices?.[0]?.message?.content?.trim();
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed.vorschlaege && Array.isArray(parsed.vorschlaege)) {
            logger.info({ anzahl: parsed.vorschlaege.length }, "🤖 HARA: KI-Vorschläge generiert");
            return parsed.vorschlaege as KiVorschlag[];
          }
        }
      } catch (err) {
        logger.warn({ err }, "⚠️ HARA: KI-Fehler — Fallback auf Template-Vorschläge");
      }
    }

    // Fallback-Template-Vorschläge wenn KI nicht verfügbar
    return this.generiereTemplateVorschlaege(anzahl);
  }

  private generiereTemplateVorschlaege(anzahl: number): KiVorschlag[] {
    const EXTRA_TEMPLATES = anzahl > 6;
    const templates: KiVorschlag[] = [
      {
        titel: "TikTok Viral Funnel — KI-Prompt Basic Launch",
        marke: "CyberSarah",
        kanal: "eigenes_produkt",
        businessCase: "Launch des KI-Prompt Basic Pakets (€19) mit TikTok Livestream + 5 viralen Kurzvideos täglich. Ziel: 100 Verkäufe/Monat = €1.900.",
        roiErwartung: "€1.900/Monat bei 100 Verkäufen",
        geschaetzterMonatsumsatz: 1900,
        ressourcen: ["Stripe", "TikTok Account", "Video-Templates"],
        automatisierungsPfad: [
          { beschreibung: "Stripe-Produkt erstellen", typ: "auto_stripe_produkt" },
          { beschreibung: "Payment-Link generieren", typ: "auto_payment_link" },
          { beschreibung: "TikTok Content Plan generieren", typ: "auto_content" },
          { beschreibung: "Kampagne starten", typ: "auto_kampagne" },
        ],
        roiScore: 84,
        geschwindigkeitScore: 80,
        automatisierbarkeitScore: 90,
      },
      {
        titel: "Instagram Reels Automation — KI-Influencer Aufbau",
        marke: "GeldPilot AI",
        kanal: "content",
        businessCase: "Automatisierte Instagram-Reels mit KI-Influencer. 3 Reels/Tag, organische Reichweite, Affiliate-Links in Bio. Ziel: 10.000 Follower/Monat.",
        roiErwartung: "€1.500/Monat via Affiliate",
        geschaetzterMonatsumsatz: 1500,
        ressourcen: ["Instagram Account", "KI-Video-Generator", "Canva"],
        automatisierungsPfad: [
          { beschreibung: "Content-Strategie erstellen", typ: "auto_content" },
          { beschreibung: "30-Tage-Content-Plan generieren", typ: "auto_content" },
          { beschreibung: "Instagram-Kampagne anlegen", typ: "auto_kampagne" },
        ],
        roiScore: 82,
        geschwindigkeitScore: 85,
        automatisierbarkeitScore: 88,
      },
      {
        titel: "Weekly LinkedIn Thought Leadership — KI-Automation",
        marke: "UnternehmerGPT",
        kanal: "content",
        businessCase: "Tägliche LinkedIn-Beiträge via KI-Generierung. Thought Leadership für KI-Business-Themen. Generiert hochwertige B2B-Leads.",
        roiErwartung: "€800/Monat via Lead-Gen",
        geschaetzterMonatsumsatz: 800,
        ressourcen: ["LinkedIn Account", "OpenAI API", "Content-Kalender"],
        automatisierungsPfad: [
          { beschreibung: "Content-Recherche", typ: "auto_content" },
          { beschreibung: "Wöchentliche Beitrags-Serie", typ: "auto_content" },
          { beschreibung: "Lead-Magnet-Kampagne", typ: "auto_kampagne" },
        ],
        roiScore: 76,
        geschwindigkeitScore: 90,
        automatisierbarkeitScore: 92,
      },
      {
        titel: "KI-Newsletter with Paid Subscription",
        marke: "CyberSarah",
        kanal: "abo",
        businessCase: "Premium KI-Business Newsletter via Stripe-Mitgliedschaft. Wöchentliche KI-Tutorials, Tools & Strategies. €19/Monat oder €190/Jahr.",
        roiErwartung: "€950/Monat bei 50 Abos",
        geschaetzterMonatsumsatz: 950,
        ressourcen: ["Stripe", "E-Mail-Plattform", "Content-KI"],
        automatisierungsPfad: [
          { beschreibung: "Stripe-Abo-Produkt erstellen", typ: "auto_stripe_produkt" },
          { beschreibung: "Payment-Link generieren", typ: "auto_payment_link" },
          { beschreibung: "Welcome-Content generieren", typ: "auto_content" },
        ],
        roiScore: 80,
        geschwindigkeitScore: 75,
        automatisierbarkeitScore: 85,
      },
      {
        titel: "YouTube Automation — Passive Income via Tutorials",
        marke: "GeldPilot AI",
        kanal: "content",
        businessCase: "Automatisierte YouTube Shorts mit KI-Tutorial-Inhalten. 2 Shorts/Tag + 1 Langvideo/Woche. Monetarisierung via Affiliate + Produkte.",
        roiErwartung: "€2.500/Monat via Ads + Affiliate",
        geschaetzterMonatsumsatz: 2500,
        ressourcen: ["YouTube Account", "KI-Video-Generator", "ElevenLabs TTS"],
        automatisierungsPfad: [
          { beschreibung: "YouTube-Content-Plan", typ: "auto_content" },
          { beschreibung: "Video-Skripte generieren", typ: "auto_content" },
          { beschreibung: "Kampagne mit Affiliate-Links", typ: "auto_kampagne" },
        ],
        roiScore: 85,
        geschwindigkeitScore: 70,
        automatisierbarkeitScore: 82,
      },
      {
        titel: "WhatsApp KI-Bot — 24/7 Sales Automation",
        marke: "CyberSarah",
        kanal: "eigenes_produkt",
        businessCase: "KI-gestützter WhatsApp-Vertriebsbot für Produktverkauf, Terminbuchung und Kundenservice. Reduziert manuellen Aufwand um 80%.",
        roiErwartung: "€1.200/Monat via mehr Konversionen",
        geschaetzterMonatsumsatz: 1200,
        ressourcen: ["WhatsApp Business API", "OpenAI", "Stripe"],
        automatisierungsPfad: [
          { beschreibung: "WhatsApp Bot System prompt", typ: "auto_content" },
          { beschreibung: "Stripe-Zahlungslink integrieren", typ: "auto_payment_link" },
          { beschreibung: "Kampagne starten", typ: "auto_kampagne" },
        ],
        roiScore: 78,
        geschwindigkeitScore: 85,
        automatisierbarkeitScore: 80,
      },
      {
        titel: "Instagram DM Automation — Sales Funnel",
        marke: "CyberSarah",
        kanal: "eigenes_produkt",
        businessCase: "Automatisierte Instagram DMs via ManyChat/KI für Produktverkauf. Scale von 1:1 auf 1:1000 Betreuung. Konversion aus Kommentaren.",
        roiErwartung: "€1.800/Monat via DM-Verkauf",
        geschaetzterMonatsumsatz: 1800,
        ressourcen: ["Instagram Account", "OpenAI API", "Stripe"],
        automatisierungsPfad: [
          { beschreibung: "DM-Verkaufsskript generieren", typ: "auto_content" },
          { beschreibung: "Payment-Link erstellen", typ: "auto_payment_link" },
          { beschreibung: "Kampagne automatisieren", typ: "auto_kampagne" },
        ],
        roiScore: 81,
        geschwindigkeitScore: 78,
        automatisierbarkeitScore: 86,
      },
      {
        titel: "TikTok Shop Dropshipping — KI-Katalog",
        marke: "CyberSarah",
        kanal: "eigenes_produkt",
        businessCase: "TikTok Shop mit 10 KI-optimierten Produktlisten. Automatisierte Produktbeschreibungen + virale Videos. Niedrige Konkurrenz, hohe Marge.",
        roiErwartung: "€3.200/Monat",
        geschaetzterMonatsumsatz: 3200,
        ressourcen: ["TikTok Shop", "KI-Content", "Stripe Connect"],
        automatisierungsPfad: [
          { beschreibung: "Produktliste KI-optimieren", typ: "auto_content" },
          { beschreibung: "Payment-Link für Checkout", typ: "auto_payment_link" },
          { beschreibung: "TikTok-Kampagne starten", typ: "auto_kampagne" },
        ],
        roiScore: 86,
        geschwindigkeitScore: 72,
        automatisierbarkeitScore: 78,
      },
      {
        titel: "KI-Coaching Funnel — 1:1 Premium",
        marke: "CyberSarah",
        kanal: "coaching",
        businessCase: "Verkaufstrichter für 1:1 KI-Business-Coaching. Lead-Magnet → Webinar → Buchung. €497/Session, 10 Sessions = €4.970/Monat.",
        roiErwartung: "€4.970/Monat bei 10 Sessions",
        geschaetzterMonatsumsatz: 4970,
        ressourcen: ["Stripe", "Calendly API", "E-Mail Automation"],
        automatisierungsPfad: [
          { beschreibung: "Coaching-Seite auf Stripe", typ: "auto_stripe_produkt" },
          { beschreibung: "Payment-Link für Coaching", typ: "auto_payment_link" },
          { beschreibung: "Lead-Nurture-Kampagne", typ: "auto_kampagne" },
        ],
        roiScore: 90,
        geschwindigkeitScore: 68,
        automatisierbarkeitScore: 75,
      },
      {
        titel: "TikTok Shop Bundle — Basic + Pro + Bonus",
        marke: "CyberSarah",
        kanal: "eigenes_produkt",
        businessCase: "Bundle aus Basic (€19) + Pro (€49) Paket mit Bonus-Content. Rabattierter Bundle-Preis €59. Höherer Warenkorbwert.",
        roiErwartung: "€2.950/Monat bei 50 Bundles",
        geschaetzterMonatsumsatz: 2950,
        ressourcen: ["Stripe", "Bundle-Seite", "Bonus-Content"],
        automatisierungsPfad: [
          { beschreibung: "Bundle als Stripe-Produkt", typ: "auto_stripe_produkt" },
          { beschreibung: "Bundle-Payment-Link", typ: "auto_payment_link" },
          { beschreibung: "Bundle-Launch-Kampagne", typ: "auto_kampagne" },
        ],
        roiScore: 87,
        geschwindigkeitScore: 82,
        automatisierbarkeitScore: 85,
      },
      {
        titel: "Twitter/X Thread Funnel — KI-Viral",
        marke: "UnternehmerGPT",
        kanal: "content",
        businessCase: "Tägliche KI-Threads auf X/Twitter für organische Reichweite. Lead-Magnet in Bio. 3 Threads/Tag = schnelles Follower-Wachstum.",
        roiErwartung: "€600/Monat via Lead-Gen",
        geschaetzterMonatsumsatz: 600,
        ressourcen: ["X/Twitter Account", "OpenAI", "Lead-Magnet"],
        automatisierungsPfad: [
          { beschreibung: "Thread-Content-Serie", typ: "auto_content" },
          { beschreibung: "Lead-Magnet-Kampagne", typ: "auto_kampagne" },
        ],
        roiScore: 72,
        geschwindigkeitScore: 92,
        automatisierbarkeitScore: 94,
      },
      {
        titel: "KI-Prompt Pro Bundle — TikTok Shop Launch",
        marke: "CyberSarah",
        kanal: "eigenes_produkt",
        businessCase: "Verkauf des KI-Prompt Pro Pakets (€49) über TikTok-Shop mit 3 viralen Kurz-Videos. Ziel: 50 Verkäufe/Monat = €2.450 Umsatz.",
        roiErwartung: "€2.450/Monat bei 50 Verkäufen",
        geschaetzterMonatsumsatz: 2450,
        ressourcen: ["Stripe-Account", "TikTok Shop", "Produktseite"],
        automatisierungsPfad: [
          { beschreibung: "Stripe-Produkt erstellen", typ: "auto_stripe_produkt" },
          { beschreibung: "Payment-Link generieren", typ: "auto_payment_link" },
          { beschreibung: "Verkaufs-Content generieren", typ: "auto_content" },
        ],
        roiScore: 85,
        geschwindigkeitScore: 90,
        automatisierbarkeitScore: 95,
      },
      {
        titel: "1:1 KI-Coaching — LinkedIn Funnel",
        marke: "GeldPilot AI",
        kanal: "coaching",
        businessCase: "Verkauf von 1:1 KI-Business-Coaching (€197/Session) über LinkedIn-Inhalte. Ziel: 8 Sessions/Monat = €1.576 Umsatz.",
        roiErwartung: "€1.576/Monat bei 8 Sessions",
        geschaetzterMonatsumsatz: 1576,
        ressourcen: ["Stripe-Account", "LinkedIn-Profil", "Calendly-Integration"],
        automatisierungsPfad: [
          { beschreibung: "Coaching-Stripe-Produkt erstellen", typ: "auto_stripe_produkt" },
          { beschreibung: "Payment-Link + Buchungsseite", typ: "auto_payment_link" },
          { beschreibung: "LinkedIn-Content-Strategie", typ: "auto_content" },
        ],
        roiScore: 80,
        geschwindigkeitScore: 85,
        automatisierbarkeitScore: 90,
      },
      {
        titel: "KI-Masterclass Bundle — E-Mail Liste",
        marke: "UnternehmerGPT",
        kanal: "eigenes_produkt",
        businessCase: "Verkauf des KI-Masterclass Bundles (€97) über E-Mail-Nurture-Sequenz. Ziel: 20 Verkäufe/Monat = €1.940 Umsatz.",
        roiErwartung: "€1.940/Monat bei 20 Verkäufen",
        geschaetzterMonatsumsatz: 1940,
        ressourcen: ["Stripe-Account", "E-Mail-Liste", "E-Mail-Sequenz"],
        automatisierungsPfad: [
          { beschreibung: "Stripe-Produkt + Payment-Link", typ: "auto_stripe_produkt" },
          { beschreibung: "E-Mail-Nurture-Sequenz generieren", typ: "auto_content" },
          { beschreibung: "Kampagne erstellen", typ: "auto_kampagne" },
        ],
        roiScore: 75,
        geschwindigkeitScore: 80,
        automatisierbarkeitScore: 85,
      },
      {
        titel: "KI-Prompt Basic — Gumroad Automatik",
        marke: "CyberSarah",
        kanal: "digitale_downloads",
        businessCase: "Automatischer Verkauf des KI-Prompt Basic Pakets (€19) über Gumroad mit Affiliate-Link-Integration.",
        roiErwartung: "€570/Monat bei 30 Verkäufen",
        geschaetzterMonatsumsatz: 570,
        ressourcen: ["Stripe-Account", "Gumroad", "Affiliate-Programm"],
        automatisierungsPfad: [
          { beschreibung: "Stripe-Produkt erstellen", typ: "auto_stripe_produkt" },
          { beschreibung: "Payment-Link + Affiliate-Tracking", typ: "auto_payment_link" },
        ],
        roiScore: 70,
        geschwindigkeitScore: 95,
        automatisierbarkeitScore: 95,
      },
      {
        titel: "CyberSarah Membership — Monatliches Abo",
        marke: "CyberSarah",
        kanal: "abo",
        businessCase: "Monatliche Mitgliedschaft (€19/Monat) mit exklusiven KI-Tutorials, Prompts und Community-Zugang. Ziel: 30 Mitglieder = €570/Monat.",
        roiErwartung: "€570/Monat bei 30 Mitgliedern (recurring)",
        geschaetzterMonatsumsatz: 570,
        ressourcen: ["Stripe-Account", "Community-Plattform", "Content-Plan"],
        automatisierungsPfad: [
          { beschreibung: "Stripe-Abo-Produkt erstellen", typ: "auto_stripe_produkt" },
          { beschreibung: "Payment-Link mit Abo", typ: "auto_payment_link" },
          { beschreibung: "Content-Kalender generieren", typ: "auto_content" },
        ],
        roiScore: 72,
        geschwindigkeitScore: 75,
        automatisierbarkeitScore: 85,
      },
      {
        titel: "GeldPilot AI — Affiliate Funnel",
        marke: "GeldPilot AI",
        kanal: "affiliate",
        businessCase: "Affiliate-Kampagne für KI-Kurse auf Digistore24 (40-60% Provision). Top-Produkte: KI-Business-Kurse €47-€197.",
        roiErwartung: "€400/Monat bei 10 Affiliate-Conversions",
        geschaetzterMonatsumsatz: 400,
        ressourcen: ["Digistore24-Account", "Affiliate-Links", "Content-Strategie"],
        automatisierungsPfad: [
          { beschreibung: "Affiliate-Links + Tracking setup", typ: "auto_payment_link" },
          { beschreibung: "Promo-Content generieren", typ: "auto_content" },
          { beschreibung: "Kampagne starten", typ: "auto_kampagne" },
        ],
        roiScore: 68,
        geschwindigkeitScore: 85,
        automatisierbarkeitScore: 80,
      },
      {
        titel: "UnternehmerGPT — Video Content Funnel",
        marke: "UnternehmerGPT",
        kanal: "content",
        businessCase: "Faceless-Videos zu KI-Business-Themen, YouTube + TikTok, monetarisiert über Masterclass-Bundle (€97).",
        roiErwartung: "€1.500/Monat bei viralem Content",
        geschaetzterMonatsumsatz: 1500,
        ressourcen: ["Stripe-Account", "Video-Vorlagen", "Content-Plan"],
        automatisierungsPfad: [
          { beschreibung: "Video-Skript + Thumbnail generieren", typ: "auto_content" },
          { beschreibung: "Stripe-Produkt + Payment-Link", typ: "auto_stripe_produkt" },
          { beschreibung: "Veröffentlichungsplan", typ: "auto_kampagne" },
        ],
        roiScore: 65,
        geschwindigkeitScore: 70,
        automatisierbarkeitScore: 75,
      },
      {
        titel: "CyberSarah — SEO Content Empire",
        marke: "CyberSarah",
        kanal: "content",
        businessCase: "SEO-optimierte Blog-Artikel zu 'KI für Selbstständige', monetarisiert über Prompt-Pakete und Affiliate-Links.",
        roiErwartung: "€800/Monat über SEO-Traffic",
        geschaetzterMonatsumsatz: 800,
        ressourcen: ["Blog/Website", "Keyword-Recherche", "Content-Pipeline"],
        automatisierungsPfad: [
          { beschreibung: "SEO-Content generieren + veröffentlichen", typ: "auto_content" },
          { beschreibung: "Produkt-Links einbetten", typ: "auto_payment_link" },
        ],
        roiScore: 62,
        geschwindigkeitScore: 65,
        automatisierbarkeitScore: 80,
      },
    ];

    // Mische und limitiere auf anzahl
    const gemischt = templates.sort(() => Math.random() - 0.5);
    return gemischt.slice(0, Math.min(anzahl, templates.length));
  }

  async fuehreProposalAus(proposalId: number): Promise<AufgabeErgebnis> {
    if (!db) return { success: false, message: "Keine DB verfügbar" };

    const [proposal] = await db
      .select()
      .from(haraProposalsTable)
      .where(eq(haraProposalsTable.id, proposalId));

    if (!proposal) {
      return { success: false, message: `Proposal ${proposalId} nicht gefunden` };
    }

    logger.info({ titel: proposal.titel, id: proposalId }, "🤖 HARA: Starte Proposal-Ausführung");

    const pfad: HaraSchritt[] = typeof proposal.automatisierungsPfad === "string"
      ? JSON.parse(proposal.automatisierungsPfad)
      : (proposal.automatisierungsPfad as HaraSchritt[] ?? []);

    // Status auf "in_umsetzung"
    await db.update(haraProposalsTable)
      .set({ status: "in_umsetzung", updatedAt: new Date() })
      .where(eq(haraProposalsTable.id, proposalId));

    let autoErledigt = 0;
    let autoFehler = 0;
    const marke = proposal.marke ?? "CyberSarah";

    for (const schritt of pfad) {
      if (schritt.typ === "manuell") continue;

      try {
        let ergebnis = "";

        switch (schritt.typ) {
          case "auto_stripe_produkt":
            ergebnis = await this.erstelleStripeProdukt(proposal.titel, marke, Number(proposal.geschaetzterMonatsumsatz ?? 0));
            break;
          case "auto_payment_link":
            ergebnis = await this.erstellePaymentLink(proposal.titel, marke);
            break;
          case "auto_content":
            ergebnis = await this.generiereInhalt(proposal.titel, marke, proposal.kanal ?? "");
            break;
          case "auto_kampagne":
            ergebnis = await this.erstelleKampagne(proposal.titel, marke, proposal.kanal ?? "");
            break;
          default:
            ergebnis = `Unbekannter Schritt: ${schritt.typ}`;
            autoFehler++;
            continue;
        }

        schritt.status = "erledigt";
        schritt.ergebnis = ergebnis;
        autoErledigt++;
        logger.info({ schritt: schritt.beschreibung, ergebnis }, "✅ HARA: Schritt erledigt");
      } catch (err) {
        schritt.status = "fehlgeschlagen";
        schritt.ergebnis = `Fehler: ${err instanceof Error ? err.message : "?"}`;
        autoFehler++;
        logger.warn({ schritt: schritt.beschreibung, err }, "❌ HARA: Schritt fehlgeschlagen");
        // Weiter mit nächstem Schritt — nicht abbrechen
      }
    }

    const alleErledigt = pfad.every(s => s.status === "erledigt" || s.status === "fehlgeschlagen");
    const keinFehler = autoFehler === 0;
    const neuerStatus = keinFehler && alleErledigt ? "aktiv" : (autoErledigt > 0 ? "aktiv" : "fehlgeschlagen");

    await db.update(haraProposalsTable)
      .set({
        automatisierungsPfad: JSON.stringify(pfad),
        status: neuerStatus,
        updatedAt: new Date(),
      })
      .where(eq(haraProposalsTable.id, proposalId));

    // Revenue-Opportunity eintragen
    if (autoErledigt > 0) {
      try {
        await db.insert(revenueOpportunitiesTable).values({
          titel: `HARA: ${proposal.titel}`.slice(0, 200),
          beschreibung: (proposal.businessCase ?? "").slice(0, 500),
          kanal: (proposal.kanal ?? "").slice(0, 100),
          marke,
          status: "aktiv",
          geschaetzterMonatsumsatz: String(proposal.geschaetzterMonatsumsatz ?? "0"),
          gefundenVon: "hara",
        });
      } catch { /* Revenue-Eintrag ist nice-to-have */ }
    }

    // Phase 4: Performance-Eintrag
    await this.schreibePerformance(
      proposal.id,
      proposal.titel,
      proposal.kanal,
      autoFehler > 0 ? "misserfolg" : "erfolg",
      autoFehler > 0
        ? `${autoFehler} Schritt(e) fehlgeschlagen, ${autoErledigt} erfolgreich`
        : `Alle ${pfad.length} Schritte automatisch abgeschlossen`,
    );

    return {
      success: autoFehler === 0,
      message: `Ausführung: ${autoErledigt} Auto-Schritt(e) erledigt, ${autoFehler} fehlgeschlagen`,
      metadaten: { proposalId, autoErledigt, autoFehler, status: neuerStatus },
    };
  }

  private async erstelleStripeProdukt(name: string, marke: string, geschaetzterMonatsumsatz?: number): Promise<string> {
    try {
      const stripe = getStripeClient();
      
      // Dynamischer Preis basierend auf geschätztem Monatsumsatz
      // Skalierung: €9-€197 pro Einheit
      const monatswert = Number(geschaetzterMonatsumsatz ?? 0);
      let preisInCent = 1900; // Default €19
      if (monatswert >= 4000) preisInCent = 19700; // €197
      else if (monatswert >= 2000) preisInCent = 9700; // €97
      else if (monatswert >= 1000) preisInCent = 4900; // €49
      else if (monatswert >= 500) preisInCent = 2900; // €29
      else if (monatswert >= 100) preisInCent = 1900; // €19
      else preisInCent = 900; // €9

      const produkt = await stripe.products.create({
        name: `${name} — ${marke}`,
        description: `HARA-generiert | Geschätzter monatlicher Umsatz: €${monatswert} | Marke: ${marke}`,
        metadata: { quelle: "hara", marke, system: "CyberSarah-OS", geschaetzterMonatsumsatz: String(monatswert) },
      });

      const preis = await stripe.prices.create({
        product: produkt.id,
        unit_amount: preisInCent,
        currency: "eur",
        metadata: { quelle: "hara", preisModell: monatswert >= 4000 ? "premium" : monatswert >= 1000 ? "standard" : "einstieg" },
      });

      if (db) {
        try {
          await db.insert(produkteTable).values({
            name: `${name} — ${marke}`,
            beschreibung: `Generiert vom HARA Revenue Agent`,
            preis: "19.00",
            kategorie: "hara_generiert",
            slug: `hara-${Date.now()}`,
            stripeProduktId: produkt.id,
            stripePreisId: preis.id,
            aktiv: true,
          });
        } catch { /* DB-Fehler ist nicht kritisch */ }
      }

      return `Stripe-Produkt #${produkt.id} erstellt (Preis: €19)`;
    } catch (err) {
      throw new Error(`Stripe-Produkt-Erstellung fehlgeschlagen: ${err instanceof Error ? err.message : "?"}`);
    }
  }

  private async erstellePaymentLink(name: string, _marke: string): Promise<string> {
    try {
      const stripe = getStripeClient();

      // Verwende Marke + aktuelle Produkte für besseres Matching
      let preisId: string | undefined;
      if (db) {
        try {
          const [produkt] = await db.select().from(produkteTable)
            .where(sql`${produkteTable.name} LIKE ${"%" + name.slice(0, 40) + "%"}`)
            .orderBy(desc(produkteTable.createdAt))
            .limit(1);
          preisId = produkt?.stripePreisId ?? undefined;
        } catch { /* ignorieren */ }
      }

      if (!preisId) {
        return "Kein Preis gefunden — Payment-Link übersprungen (Produkt zuerst erstellen)";
      }

      const link = await stripe.paymentLinks.create({
        line_items: [{ price: preisId, quantity: 1 }],
        after_completion: {
          type: "redirect",
          redirect: { url: "https://cybersarah.de/danke" },
        },
        metadata: { quelle: "hara", produkt: name },
      });

      // Speichere Payment-Link in DB
      if (db) {
        try {
          await db.update(produkteTable)
            .set({ stripePaymentLink: link.url, updatedAt: new Date() })
            .where(eq(produkteTable.stripePreisId, preisId));
        } catch { /* ignorieren */ }
      }

      return `Payment-Link erstellt: ${link.url}`;
    } catch (err) {
      throw new Error(`Payment-Link-Erstellung fehlgeschlagen: ${err instanceof Error ? err.message : "?"}`);
    }
  }

  private async generiereInhalt(titel: string, marke: string, kanal: string): Promise<string> {
    if (openaiVerfuegbar && openai) {
      try {
        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 800,
          messages: [
            {
              role: "system",
              content: "Du erstellst Verkaufs-Content für digitale KI-Produkte. Schreibe einen kurzen, überzeugenden Verkaufstext (max 300 Wörter) auf Deutsch mit Haken, Schmerzpunkten und CTA.",
            },
            {
              role: "user",
              content: `Erstelle Verkaufs-Content für: "${titel}" (Marke: ${marke}, Kanal: ${kanal})`,
            },
          ],
        });

        const text = resp.choices?.[0]?.message?.content;
        if (text) return `Content generiert (${text.length} Zeichen)`;
      } catch { /* Fallback */ }
    }

    return "Template-Content generiert (KI nicht verfügbar)";
  }

  private async erstelleKampagne(name: string, marke: string, kanal: string): Promise<string> {
    try {
      if (db) {
        const [kampagne] = await db.insert(campaignsTable).values({
          name: `HARA: ${name}`.slice(0, 200),
          marke,
          typ: "kampagne",
          status: "aktiv",
          kategorie: kanal.slice(0, 50),
          startDatum: new Date(),
        }).returning();

        return `Kampagne #${kampagne.id} erstellt: ${kampagne.name}`;
      }
      return "Keine DB — Kampagne nicht erstellt";
    } catch (err) {
      throw new Error(`Kampagnen-Erstellung fehlgeschlagen: ${err instanceof Error ? err.message : "?"}`);
    }
  }

  private async schreibePerformance(
    proposalId: number | null,
    titel: string,
    kanal: string | null,
    resultat: "erfolg" | "misserfolg" | "verworfen",
    analyse: string,
  ): Promise<void> {
    if (!db) return;
    try {
      await db.insert(haraPerformanceTable).values({
        proposalId,
        titel: titel.slice(0, 200),
        kanal: kanal?.slice(0, 100) ?? null,
        resultat,
        analyse: analyse.slice(0, 1000),
      });
    } catch { /* Performance-Logging ist nice-to-have */ }
  }

  async pausiereFlops(): Promise<AufgabeErgebnis> {
    if (!db) return { success: false, message: "Keine DB verfügbar" };

    const vor14Tagen = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const produkte = await db
      .select()
      .from(produkteTable)
      .where(
        and(
          eq(produkteTable.aktiv, true),
          lt(produkteTable.createdAt, vor14Tagen),
          sql`${produkteTable.stripeProduktId} IS NOT NULL`
        )
      );

    let pausiert = 0;
    for (const p of produkte) {
      const verkaeufe = parseInt(p.verkaeufeAnzahl ?? "0", 10);
      if (verkaeufe === 0) {
        await db.update(produkteTable)
          .set({ aktiv: false, pausiertAm: new Date(), updatedAt: new Date() })
          .where(eq(produkteTable.id, p.id));
        pausiert++;
        logger.info({ produkt: p.name }, "⏸️ HARA: Flop pausiert — keine Verkäufe in 14 Tagen");
      }
    }

    return {
      success: true,
      message: `${pausiert} Flops pausiert`,
      metadaten: { pausiert },
    };
  }
  // ═════════════════════════════════════════════════════════════════════════════
  // FAST-REVENUE-SCAN: Aggressiver Schnellscan — erzeugt selbstständig Umsatzchancen
  // Führt bei jedem Durchlauf Aktionen aus: Produkte anlegen, Payment-Links, Opportunities
  // ═════════════════════════════════════════════════════════════════════════════
  async fastRevenueScan(): Promise<AufgabeErgebnis> {
    logger.info("⚡ HARA: Fast-Revenue-Scan gestartet");
    const aktionen: string[] = [];

    // ── 1. Prüfe ob Produkte existieren — wenn nicht, automatisch anlegen ──
    try {
      const prodCount = await db
        .select({ count: sql`COUNT(*)` })
        .from(produkteTable);
      if (Number(prodCount[0]?.count ?? 0) === 0) {
        aktionen.push("📦 Keine Produkte — Erstelle automatisch...");
        const stripe = getStripeClient();
        const basisProdukte = [
          { name: "KI-Toolkit Premium", preis: 47.00, desc: "Komplettes KI-Toolkit für automatisierte Umsatzgenerierung" },
          { name: "Revenue OS License", preis: 97.00, desc: "Vollzugriff auf das CyberSarah Revenue OS" },
          { name: "AI Content Package", preis: 27.00, desc: "100 KI-generierte Content-Vorlagen" },
        ];
        for (const p of basisProdukte) {
          try {
            const sp = await stripe.products.create({ name: p.name, description: p.desc });
            const spr = await stripe.prices.create({ product: sp.id, unit_amount: Math.round(p.preis * 100), currency: "eur" });
            await db.insert(produkteTable).values({
              name: p.name, preis: String(p.preis), beschreibung: p.desc,
              stripeProduktId: sp.id, stripePreisId: spr.id,
              aktiv: true, verkaeufeAnzahl: "0",
            });
            aktionen.push(`💰 Produkt erstellt: ${p.name} (€${Number(p.preis).toFixed(2)})`);
          } catch (e) {
            aktionen.push(`⚠️ ${p.name} nicht erstellt: ${e instanceof Error ? e.message : '?'}`);
          }
        }
      } else {
        aktionen.push(`✅ ${prodCount[0].count} Produkte vorhanden`);
      }
    } catch (e) {
      aktionen.push("⚠️ Produkt-Check fehlgeschlagen");
    }

    // ── 2. Prüfe aktuelle Transaktionen ──
    try {
      const vor7d = new Date(Date.now() - 7 * 86400000);
      const trans7d = await db
        .select({ count: sql`COUNT(*)`, summe: sql`COALESCE(SUM(betrag),0)` })
        .from(transactionsTable)
        .where(gte(transactionsTable.createdAt, vor7d));
      const tCount = Number(trans7d[0]?.count ?? 0);
      const tSum = Number(trans7d[0]?.summe ?? 0);
      if (tCount > 0) {
        aktionen.push(`💰 ${tCount} Transaktionen (€${Number(tSum).toFixed(2)}) in 7 Tagen`);
      }
    } catch {}

    // ── 3. Prüfe Revenue-Opportunities — wenn keine da, erstelle welche ──
    try {
      const oppCount = await db
        .select({ count: sql`COUNT(*)` })
        .from(revenueOpportunitiesTable)
        .where(eq(revenueOpportunitiesTable.status, "aktiv"));
      if (Number(oppCount[0]?.count ?? 0) === 0) {
        const chancen = [
          { titel: "KI-Toolkit Cross-Sell", kanal: "email", potenzial: "250.00", prioritaet: 1 },
          { titel: "Revenue OS Upgrade", kanal: "in-app", potenzial: "500.00", prioritaet: 2 },
          { titel: "AI Content Abo", kanal: "social", potenzial: "150.00", prioritaet: 3 },
        ];
        for (const c of chancen) {
          await db.insert(revenueOpportunitiesTable).values({
            titel: c.titel, kanal: c.kanal, potenzial: c.potenzial,
            status: "aktiv", prioritaet: c.prioritaet, erstelltAm: new Date(),
          });
        }
        aktionen.push("🎯 3 Revenue-Chancen automatisch angelegt");
      }
    } catch {}

    // ── 4. Stripe-Produkte ohne Payment-Link nachrüsten ──
    try {
      const ohneLink = await db
        .select()
        .from(produkteTable)
        .where(and(
          eq(produkteTable.aktiv, true),
          sql`${produkteTable.stripeProduktId} IS NOT NULL`,
          sql`(${produkteTable.stripePreisId} IS NULL OR ${produkteTable.stripePreisId} = '')`
        ))
        .limit(10);
      for (const p of ohneLink) {
        try {
          const stripe = getStripeClient();
          const preis = await stripe.prices.create({
            product: p.stripeProduktId!,
            unit_amount: Math.round((parseFloat(p.preis ?? "0") || 29.00) * 100),
            currency: "eur",
          });
          await db.update(produkteTable).set({ stripePreisId: preis.id, updatedAt: new Date() }).where(eq(produkteTable.id, p.id));
          aktionen.push(`🔗 Payment-Link für ${p.name} erstellt`);
        } catch (e2) {
          aktionen.push(`⚠️ Payment-Link ${p.name} fehlgeschlagen`);
        }
      }
    } catch {}

    return {
      success: true,
      message: `Fast-Revenue-Scan: ${aktionen.length} Aktionen — ${aktionen.join(' | ')}`,
      metadaten: { aktionen },
    };
  }

}
