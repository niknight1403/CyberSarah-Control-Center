import { db } from "@workspace/db";
import { agentsTable, agentLogsTable, expansionChancenTable, contentTable } from "@workspace/db";
import { eq, desc, gte, sql, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";

// ─── Kostenlose Basis-Chancen (immer verfügbar, kein API-Key nötig) ──────────

const KOSTENLOSE_CHANCEN = [
  {
    titel: "Digistore24 Affiliate-Vermarkter",
    beschreibung: "Kostenlose Anmeldung bei Digistore24 — sofort alle KI-Kurse und Online-Business-Produkte bewerben. Provision: 30-70% pro Verkauf. Top-Produkte: €197-997 Kurse → €60-700 pro Sale.",
    kategorie: "affiliate",
    plattform: "Digistore24",
    kosten: "0",
    geschaetzterUmsatz: "800",
    roi: "9999",
    kostenlos: true,
    sofortStartbar: true,
    prioritaet: 1,
    aktionsUrl: "https://www.digistore24.com/vendor/register",
    zeitBisErstemUmsatz: "1-7 Tage",
    monatlichesWachstumPotenzial: "hoch",
  },
  {
    titel: "Copecart Affiliate-Netzwerk",
    beschreibung: "Deutsches Pendant zu Digistore24 — kostenlose Anmeldung, sofort Zugang zu 1000+ digitalen Produkten. Fokus: Coaching, KI-Tools, Business. Provision: 25-60%.",
    kategorie: "affiliate",
    plattform: "Copecart",
    kosten: "0",
    geschaetzterUmsatz: "500",
    roi: "9999",
    kostenlos: true,
    sofortStartbar: true,
    prioritaet: 1,
    aktionsUrl: "https://copecart.com/affiliates",
    zeitBisErstemUmsatz: "1-7 Tage",
    monatlichesWachstumPotenzial: "hoch",
  },
  {
    titel: "Amazon Associates (KI-Tools & Bücher)",
    beschreibung: "Affiliate-Programm für KI-Bücher, Microphones, Webcams, Tech-Zubehör. Kostenlose Anmeldung. Provision: 3-10%. Eignet sich für Blog + YouTube-Reviews.",
    kategorie: "affiliate",
    plattform: "Amazon",
    kosten: "0",
    geschaetzterUmsatz: "200",
    roi: "9999",
    kostenlos: true,
    sofortStartbar: true,
    prioritaet: 2,
    aktionsUrl: "https://affiliate-program.amazon.de",
    zeitBisErstemUmsatz: "1-4 Wochen",
    monatlichesWachstumPotenzial: "mittel",
  },
  {
    titel: "Stripe Zahlungslinks — Eigene KI-Produkte",
    beschreibung: "Sofort Stripe Payment Links für eigene digitale Produkte erstellen: KI-Prompts Pakete (€9-49), ChatGPT-Vorlagen (€19-97), Business-Templates (€29-197). 100% Marge, keine Plattformgebühren außer Stripe (2,9%).",
    kategorie: "eigenes_produkt",
    plattform: "Stripe",
    kosten: "0",
    geschaetzterUmsatz: "1200",
    roi: "9999",
    kostenlos: true,
    sofortStartbar: true,
    prioritaet: 1,
    aktionsUrl: "https://dashboard.stripe.com/payment-links",
    zeitBisErstemUmsatz: "sofort",
    monatlichesWachstumPotenzial: "hoch",
  },
  {
    titel: "TikTok Creator Fund + Live-Gifts",
    beschreibung: "TikTok Creator Fund ab 10.000 Follower (€0,02-0,05/1000 Views). ABER: TikTok Live-Geschenke sind sofort monetarisierbar! Fokus auf 15-60s KI-Hacks-Videos — hohes Viral-Potenzial.",
    kategorie: "content",
    plattform: "TikTok",
    kosten: "0",
    geschaetzterUmsatz: "300",
    roi: "9999",
    kostenlos: true,
    sofortStartbar: true,
    prioritaet: 2,
    aktionsUrl: "https://www.tiktok.com/creators/",
    zeitBisErstemUmsatz: "1-4 Wochen",
    monatlichesWachstumPotenzial: "viral",
  },
  {
    titel: "YouTube-Kanal Monetarisierung",
    beschreibung: "YouTube Partner Program ab 1.000 Abonnenten + 4.000 Watchstunden. KI-Tutorial-Videos erzielen schnell organisches Wachstum. Zusätzlich: YouTube Shopping für eigene Produkte, Channel Memberships ab 500 Abonnenten.",
    kategorie: "content",
    plattform: "YouTube",
    kosten: "0",
    geschaetzterUmsatz: "400",
    roi: "9999",
    kostenlos: true,
    sofortStartbar: true,
    prioritaet: 2,
    aktionsUrl: "https://www.youtube.com/account_monetization",
    zeitBisErstemUmsatz: "1-4 Wochen",
    monatlichesWachstumPotenzial: "hoch",
  },
  {
    titel: "Beehiiv Newsletter-Monetarisierung",
    beschreibung: "Kostenloser Newsletter mit Beehiiv (bis 2.500 Abonnenten gratis). Einnahmen durch: Sponsoren-Werbung, Premium-Abos (€9-19/Monat), Affiliate-Links im Newsletter. KI-Themen Newsletter sind sehr gefragt.",
    kategorie: "abo",
    plattform: "Beehiiv",
    kosten: "0",
    geschaetzterUmsatz: "350",
    roi: "9999",
    kostenlos: true,
    sofortStartbar: true,
    prioritaet: 2,
    aktionsUrl: "https://www.beehiiv.com",
    zeitBisErstemUmsatz: "1-4 Wochen",
    monatlichesWachstumPotenzial: "mittel",
  },
  {
    titel: "Gumroad Digitale Produkte",
    beschreibung: "Sofort digitale Produkte verkaufen: KI-Prompt-Pakete, eBooks, Checklisten, Vorlagen. Gumroad nimmt 10% Provision — kein Vorabkosten. Payout sofort ab erster Transaktion.",
    kategorie: "eigenes_produkt",
    plattform: "Gumroad",
    kosten: "0",
    geschaetzterUmsatz: "600",
    roi: "9999",
    kostenlos: true,
    sofortStartbar: true,
    prioritaet: 1,
    aktionsUrl: "https://app.gumroad.com/signup",
    zeitBisErstemUmsatz: "sofort",
    monatlichesWachstumPotenzial: "mittel",
  },
  {
    titel: "1:1 KI-Coaching via Calendly",
    beschreibung: "Sofort 1:1-Coaching-Sessions anbieten: 60min KI-Business-Coaching (€197-497/Session). Calendly kostenlos (bis 1 Meeting-Typ gratis). Zahlung via Stripe. Keine Vorkosten — sofort Umsatz möglich.",
    kategorie: "coaching",
    plattform: "Calendly + Stripe",
    kosten: "0",
    geschaetzterUmsatz: "1500",
    roi: "9999",
    kostenlos: true,
    sofortStartbar: true,
    prioritaet: 1,
    aktionsUrl: "https://calendly.com/signup",
    zeitBisErstemUmsatz: "sofort",
    monatlichesWachstumPotenzial: "hoch",
  },
  {
    titel: "Fiverr/Upwork KI-Freelancing",
    beschreibung: "KI-Dienstleistungen auf Fiverr und Upwork verkaufen: ChatGPT-Prompts erstellen, KI-Artikel schreiben, Automatisierungen bauen. Fiverr nimmt 20%, Upwork 10-20%. Start ab €19/Gig.",
    kategorie: "freelance",
    plattform: "Fiverr & Upwork",
    kosten: "0",
    geschaetzterUmsatz: "700",
    roi: "9999",
    kostenlos: true,
    sofortStartbar: true,
    prioritaet: 2,
    aktionsUrl: "https://www.fiverr.com/join",
    zeitBisErstemUmsatz: "1-7 Tage",
    monatlichesWachstumPotenzial: "mittel",
  },
  {
    titel: "Canva Affiliate-Programm",
    beschreibung: "Canva Pro empfehlen und €36 pro Neu-Abonnenten verdienen. Sehr einfach in KI-Tutorial-Content zu integrieren. Gilt als Pflicht-Tool für Content Creator → hohe Conversion.",
    kategorie: "affiliate",
    plattform: "Canva",
    kosten: "0",
    geschaetzterUmsatz: "180",
    roi: "9999",
    kostenlos: true,
    sofortStartbar: true,
    prioritaet: 3,
    aktionsUrl: "https://www.canva.com/affiliates/",
    zeitBisErstemUmsatz: "1-4 Wochen",
    monatlichesWachstumPotenzial: "gering",
  },
  {
    titel: "Instagram Paid Partnerships / Reel Bonus",
    beschreibung: "Instagram Reels Bonus (einladebasiert, kostenlos wenn aktiviert). Paid Partnerships: Marken zahlen €50-500 für gesponserte Posts in KI/Business-Nische. Reichweite aufbauen mit Content Agent.",
    kategorie: "content",
    plattform: "Instagram",
    kosten: "0",
    geschaetzterUmsatz: "250",
    roi: "9999",
    kostenlos: true,
    sofortStartbar: false,
    prioritaet: 3,
    aktionsUrl: "https://business.instagram.com",
    zeitBisErstemUmsatz: "1-4 Wochen",
    monatlichesWachstumPotenzial: "mittel",
  },
];

// ─── OpenAI-gestützte Chancen-Entdeckung ─────────────────────────────────────

async function entdeckeKIChancen(agentId: number): Promise<typeof KOSTENLOSE_CHANCEN> {
  if (!openaiVerfuegbar || !openai) return [];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1200,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `Du bist ein Revenue-Expansion-Experte für einen deutschen Solo-Operator mit 3 KI-Marken: CyberSarah, GeldPilot AI, UnternehmerGPT. 
Finde NEUE, aktuell (2026) relevante und KOSTENLOSE Umsatzmöglichkeiten.
Gib 3 spezifische Chancen als JSON-Array zurück mit exakt diesen Feldern:
{
  titel, beschreibung, kategorie (affiliate|eigenes_produkt|abo|coaching|freelance|content),
  plattform, kosten (€, 0=gratis), geschaetzterUmsatz (€/Monat), roi (Prozent, 9999=kostenlos),
  kostenlos (true/false), sofortStartbar (true/false), prioritaet (1-3),
  aktionsUrl, zeitBisErstemUmsatz, monatlichesWachstumPotenzial (gering|mittel|hoch|viral)
}
Nur JSON-Array zurückgeben, kein Markdown. Fokus auf: echte Plattformen, reale Zahlen, sofort umsetzbar.`,
        },
        {
          role: "user",
          content: "Entdecke 3 neue Umsatz-Chancen für 2026 die noch nicht abgedeckt sind: nicht Digistore24, Amazon, TikTok, YouTube, Beehiiv, Gumroad, Stripe, Calendly, Fiverr, Canva, Instagram, Copecart.",
        },
      ],
    });

    const text = response.choices[0]?.message.content ?? "[]";
    const cleanText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleanText) as typeof KOSTENLOSE_CHANCEN;

    await db.update(agentsTable)
      .set({ letzteAktivitaet: new Date(), ausgefuehrtAufgaben: agentsTable.ausgefuehrtAufgaben, updatedAt: new Date() })
      .where(eq(agentsTable.id, agentId));

    logger.info({ anzahl: parsed.length }, "KI-Expansion-Chancen entdeckt");
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch (err) {
    handleOpenAIFehler(err, "ExpansionAgent");
    return [];
  }
}

// ─── Chancen in DB speichern ─────────────────────────────────────────────────

async function speichereChancen(chancen: typeof KOSTENLOSE_CHANCEN): Promise<number> {
  let gespeichert = 0;
  for (const chance of chancen) {
    try {
      // Nur speichern wenn noch nicht vorhanden (by titel)
      const vorhandene = await db
        .select({ id: expansionChancenTable.id })
        .from(expansionChancenTable)
        .where(eq(expansionChancenTable.titel, chance.titel))
        .limit(1);

      if (vorhandene.length === 0) {
        await db.insert(expansionChancenTable).values({
          ...chance,
          entdecktVon: "expansion_scanner",
          validiert: chance.roi === "9999" || parseFloat(chance.roi ?? "0") > 200,
        });
        gespeichert++;
      }
    } catch (err) {
      logger.warn({ err, titel: chance.titel }, "Chance konnte nicht gespeichert werden");
    }
  }
  return gespeichert;
}

// ─── Haupt-Scan-Funktion ──────────────────────────────────────────────────────

export async function scanneExpansionChancen(agentId: number): Promise<{
  entdeckt: number;
  gespeichert: number;
  chancen: typeof KOSTENLOSE_CHANCEN;
}> {
  try {
    // Phase 1: Basis-Chancen (immer kostenlos, kein API-Key nötig)
    const basisChancen = [...KOSTENLOSE_CHANCEN];

    // Phase 2: KI-gestützte zusätzliche Chancen (wenn OpenAI verfügbar)
    const kiChancen = await entdeckeKIChancen(agentId);

    const alleChancen = [...basisChancen, ...kiChancen];
    const gespeichert = await speichereChancen(alleChancen);

    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "Opportunity Scanner Agent",
      aktion: "expansion_scan",
      status: "erfolgreich",
      nachricht: `${alleChancen.length} Chancen gescannt, ${gespeichert} neu in DB gespeichert`,
    });

    return { entdeckt: alleChancen.length, gespeichert, chancen: alleChancen };
  } catch (err) {
    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "Opportunity Scanner Agent",
      aktion: "expansion_scan",
      status: "fehler",
      nachricht: err instanceof Error ? err.message : "Unbekannter Fehler",
    });
    throw err;
  }
}

// ─── ROI-Validator ────────────────────────────────────────────────────────────

export async function validiereROI(chancenId: number): Promise<{
  validiert: boolean;
  roiSicher: boolean;
  empfehlung: string;
}> {
  const [chance] = await db
    .select()
    .from(expansionChancenTable)
    .where(eq(expansionChancenTable.id, chancenId))
    .limit(1);

  if (!chance) return { validiert: false, roiSicher: false, empfehlung: "Chance nicht gefunden" };

  const kosten = parseFloat(chance.kosten ?? "0");
  const umsatz = parseFloat(chance.geschaetzterUmsatz ?? "0");
  const roi = kosten === 0 ? Infinity : ((umsatz - kosten) / kosten) * 100;

  const roiSicher = kosten === 0 || roi > 200;
  const empfehlung = kosten === 0
    ? `✅ KOSTENLOS — Sofort starten! Geschätzter Umsatz: €${umsatz}/Monat`
    : roiSicher
    ? `✅ ROI ${roi.toFixed(0)}% — Kosten €${kosten} werden durch €${umsatz} Umsatz mehr als gedeckt`
    : `⚠️ ROI ${roi.toFixed(0)}% — Nur starten wenn organischer Beweis vorliegt`;

  await db.update(expansionChancenTable)
    .set({ validiert: roiSicher, roi: roiSicher ? String(roi.toFixed(2)) : chance.roi, updatedAt: new Date() })
    .where(eq(expansionChancenTable.id, chancenId));

  return { validiert: true, roiSicher, empfehlung };
}

// ─── Status-Check ─────────────────────────────────────────────────────────────

export async function holeExpansionStatus(): Promise<{
  gesamt: number;
  aktiv: number;
  kostenlos: number;
  sofortStartbar: number;
  geschaetzterMonatsumsatz: number;
}> {
  const chancen = await db.select().from(expansionChancenTable).orderBy(desc(expansionChancenTable.prioritaet));

  return {
    gesamt: chancen.length,
    aktiv: chancen.filter(c => c.status === "aktiv").length,
    kostenlos: chancen.filter(c => c.kostenlos).length,
    sofortStartbar: chancen.filter(c => c.sofortStartbar).length,
    geschaetzterMonatsumsatz: chancen
      .filter(c => c.status === "aktiv")
      .reduce((sum, c) => sum + parseFloat(c.geschaetzterUmsatz ?? "0"), 0),
  };
}

// ─── Expansion-Autopilot ──────────────────────────────────────────────────────
// Identifiziert die Top-3 Content-Formate der letzten 24h, kombiniert sie mit
// neuen Partnerprogrammen und speichert sie als "Auto-Generated-Revenue-Stream".

/** Nur die Affiliate-/Partnerprogramme aus den kostenlosen Basis-Chancen. */
const PARTNER_PROGRAMME = KOSTENLOSE_CHANCEN.filter(c => c.kategorie === "affiliate");

export async function generiereAutoRevenueStreams(): Promise<{
  topFormate: Array<{ typ: string; plattform: string; anzahl: number }>;
  erstellteStreams: number;
}> {
  const seit24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Top-3 Content-Formate (typ × plattform) der letzten 24h nach Häufigkeit
  const topFormate = await db
    .select({
      typ: contentTable.typ,
      plattform: contentTable.plattform,
      anzahl: sql<number>`COUNT(*)`,
    })
    .from(contentTable)
    .where(gte(contentTable.createdAt, seit24h))
    .groupBy(contentTable.typ, contentTable.plattform)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(3);

  if (topFormate.length === 0) {
    logger.info("Expansion-Autopilot: Keine Content-Daten der letzten 24h — kein Auto-Stream erstellt");
    return { topFormate: [], erstellteStreams: 0 };
  }

  let erstellteStreams = 0;

  for (let i = 0; i < topFormate.length; i++) {
    const format = topFormate[i]!;
    // Partnerprogramm rotierend zuordnen (Format × neues Partnerprogramm)
    const partner = PARTNER_PROGRAMME[i % PARTNER_PROGRAMME.length]!;
    const titel = `Auto-Stream: ${format.typ} auf ${format.plattform} × ${partner.plattform}`;

    // Dedup: gleicher Titel in den letzten 24h → überspringen (kein Spam)
    const vorhanden = await db
      .select({ id: expansionChancenTable.id })
      .from(expansionChancenTable)
      .where(and(
        eq(expansionChancenTable.titel, titel),
        gte(expansionChancenTable.createdAt, seit24h),
      ))
      .limit(1);

    if (vorhanden.length > 0) continue;

    const anzahl = Number(format.anzahl);
    // Umsatzschätzung: Partner-Basis skaliert mit Content-Volumen des Formats
    const geschaetzterUmsatz = (parseFloat(partner.geschaetzterUmsatz) * (1 + anzahl * 0.1)).toFixed(2);

    await db.insert(expansionChancenTable).values({
      titel,
      beschreibung:
        `Auto-generierter Revenue-Stream: Das Top-Format "${format.typ}" auf ${format.plattform} ` +
        `(${anzahl} Stück in 24h) wird mit dem Partnerprogramm ${partner.plattform} kombiniert. ` +
        `${partner.beschreibung}`,
      kategorie: "affiliate",
      plattform: `${format.plattform} + ${partner.plattform}`,
      kosten: "0",
      geschaetzterUmsatz,
      roi: "9999",
      kostenlos: true,
      sofortStartbar: true,
      prioritaet: 1,
      status: "entdeckt",
      aktionsUrl: partner.aktionsUrl,
      zeitBisErstemUmsatz: "1-7 Tage",
      monatlichesWachstumPotenzial: "hoch",
      entdecktVon: "auto_stream",
      validiert: true,
    });
    erstellteStreams++;
  }

  logger.info(
    { topFormate, erstellteStreams },
    `Expansion-Autopilot: ${erstellteStreams} Auto-Revenue-Streams aus Top-${topFormate.length}-Formaten erstellt`,
  );

  return {
    topFormate: topFormate.map(f => ({ typ: f.typ, plattform: f.plattform, anzahl: Number(f.anzahl) })),
    erstellteStreams,
  };
}
