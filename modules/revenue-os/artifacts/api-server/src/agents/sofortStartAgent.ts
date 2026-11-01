/**
 * SofortStart-Agent
 * Erstellt sofort echte Stripe-Produkte + Payment-Links + generiert Produkt-Inhalte
 * Vollständig autonom — kein manuelles Eingreifen nötig
 */
import { db } from "@workspace/db";
import { produkteTable, setupSchritteTable, agentLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getStripeClient, stripeLiveKey } from "../lib/stripeClient";
import { openai, openaiVerfuegbar } from "../lib/openaiClient";

// ─── Produkt-Definitionen ─────────────────────────────────────────────────────

const PRODUKT_DEFINITIONEN = [
  {
    name: "KI-Prompt Paket Basic",
    beschreibung: "50 bewährte ChatGPT-Prompts für Selbstständige — sofort einsetzbar für Content, Marketing und Automatisierung",
    preis: "19.00",
    kategorie: "prompt_paket" as const,
    slug: "ki-prompt-basic",
  },
  {
    name: "KI-Prompt Paket Pro",
    beschreibung: "150 Premium ChatGPT-Prompts + 10 Automatisierungs-Workflows — für ernsthafte Online-Unternehmer",
    preis: "49.00",
    kategorie: "prompt_paket" as const,
    slug: "ki-prompt-pro",
  },
  {
    name: "KI-Business Masterclass Bundle",
    beschreibung: "Komplettes KI-Business-System: 300 Prompts + Video-Skripte + E-Mail-Sequenzen + 30-Tage-Aktionsplan",
    preis: "97.00",
    kategorie: "prompt_paket" as const,
    slug: "ki-masterclass-bundle",
  },
  {
    name: "1:1 KI-Business Coaching (60min)",
    beschreibung: "Persönliche KI-Business-Session: Dein KI-Umsatzsystem aufbauen — von Null auf erste €1.000/Monat",
    preis: "197.00",
    kategorie: "coaching" as const,
    slug: "coaching-60min",
  },
  {
    name: "1:1 KI-Business Coaching (90min + Follow-up)",
    beschreibung: "Deep-Dive Session + 2 Wochen E-Mail-Support: Vollständiges KI-Revenue-System implementieren",
    preis: "497.00",
    kategorie: "coaching" as const,
    slug: "coaching-90min-premium",
  },
];

// ─── Stripe Produkt + Payment-Link erstellen ──────────────────────────────────

async function erstelleStripeProduktUndLink(def: typeof PRODUKT_DEFINITIONEN[0]): Promise<{
  produktId: string;
  preisId: string;
  paymentLink: string;
}> {
  const stripe = getStripeClient();

  // Produkt erstellen (oder vorhandenes suchen)
  const produkt = await stripe.products.create({
    name: def.name,
    description: def.beschreibung,
    metadata: { kategorie: def.kategorie, slug: def.slug, system: "CyberSarah-OS" },
  });

  // Preis erstellen (in Cents)
  const preis = await stripe.prices.create({
    product: produkt.id,
    unit_amount: Math.round(parseFloat(def.preis) * 100),
    currency: "eur",
    metadata: { slug: def.slug },
  });

  // Payment Link erstellen
  const link = await stripe.paymentLinks.create({
    line_items: [{ price: preis.id, quantity: 1 }],
    after_completion: {
      type: "redirect",
      redirect: { url: "https://cybersarah.de/danke" }, // Fallback-Danke-Seite
    },
    metadata: { produkt: def.name, system: "CyberSarah-OS" },
  });

  return {
    produktId: produkt.id,
    preisId: preis.id,
    paymentLink: link.url,
  };
}

// ─── OpenAI Produkt-Inhalt generieren ────────────────────────────────────────

async function generiereProduktInhalt(produktName: string, kategorie: string): Promise<string> {
  if (!openaiVerfuegbar || !openai) {
    // Fallback: strukturierter Template-Inhalt
    if (kategorie === "coaching") {
      return JSON.stringify({
        was_bekommst_du: [
          "60-minütige 1:1 Zoom-Session mit KI-Business-Experte",
          "Persönliche KI-Strategie für dein Business",
          "Konkrete Schritt-für-Schritt Aktionsplan",
          "Aufzeichnung der Session",
          "E-Mail-Support für 7 Tage nach der Session",
        ],
        fuer_wen: "Selbstständige, Freelancer und Online-Unternehmer die mit KI ihren Umsatz skalieren wollen",
        was_du_mitnimmst: "Ein fertiges KI-System das sofort Umsatz generiert",
        buchungslink_text: "Wähle deinen Wunschtermin und bezahle sicher via Stripe",
        bonus: "Gratis: ChatGPT-Prompt-Paket (Wert €49) für jeden Coaching-Kunden",
      });
    }
    return JSON.stringify({
      prompts_inklusive: 50,
      kategorien: ["Content-Erstellung", "Marketing", "E-Mail", "Social Media", "Verkauf"],
      bonus: "Kurzanleitung: Die 5 besten ChatGPT-Strategien für Selbstständige",
      format: "PDF + Google Docs Vorlage",
      sofort_verfuegbar: true,
    });
  }

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content: "Du erstellst Produkt-Inhalte für digitale KI-Produkte auf Deutsch. Gib strukturiertes JSON zurück ohne Markdown.",
        },
        {
          role: "user",
          content: kategorie === "coaching"
            ? `Erstelle einen überzeugenden Produktinhalt für: "${produktName}". JSON mit: was_bekommst_du (Array), fuer_wen (Text), was_du_mitnimmst (Text), buchungslink_text (Text), bonus (Text)`
            : `Erstelle einen überzeugenden Produktinhalt für: "${produktName}". JSON mit: prompts_inklusive (Zahl), kategorien (Array), bonus (Text), format (Text), top_use_cases (Array von 3)`,
        },
      ],
    });
    return resp.choices[0]?.message.content ?? "{}";
  } catch {
    return "{}";
  }
}

// ─── Setup-Schritte initialisieren ───────────────────────────────────────────

async function initialisiereSetupSchritte(): Promise<void> {
  const schritte = [
    { schluessel: "stripe_produkte", name: "Stripe-Produkte & Payment-Links erstellen" },
    { schluessel: "gumroad", name: "Gumroad-Konto anlegen & Produkte hochladen" },
    { schluessel: "digistore24", name: "Digistore24 Affiliate-Account anmelden" },
    { schluessel: "coaching_buchung", name: "Coaching-Buchungsseite aktivieren" },
  ];

  for (const schritt of schritte) {
    const vorhandene = await db
      .select()
      .from(setupSchritteTable)
      .where(eq(setupSchritteTable.schluessel, schritt.schluessel))
      .limit(1);
    if (vorhandene.length === 0) {
      await db.insert(setupSchritteTable).values(schritt);
    }
  }
}

// ─── Haupt-Funktion: Stripe-Produkte erstellen ────────────────────────────────

export async function erstelleSofortProdukte(): Promise<{
  erstellt: number;
  produkte: Array<{ name: string; preis: string; paymentLink: string; kategorie: string }>;
  fehler: string[];
}> {
  await initialisiereSetupSchritte();

  const erstellt: Array<{ name: string; preis: string; paymentLink: string; kategorie: string }> = [];
  const fehler: string[] = [];

  if (!stripeLiveKey && !process.env.STRIPE_SECRET_KEY) {
    fehler.push("Stripe-Key fehlt — bitte STRIPE_SECRET_KEY als Umgebungsvariable setzen");
    return { erstellt: 0, produkte: [], fehler };
  }

  for (const def of PRODUKT_DEFINITIONEN) {
    try {
      // Prüfen ob Produkt bereits existiert
      const vorhandene = await db
        .select()
        .from(produkteTable)
        .where(eq(produkteTable.name, def.name))
        .limit(1);

      if (vorhandene.length > 0 && vorhandene[0]?.stripePaymentLink) {
        erstellt.push({
          name: def.name,
          preis: `€${def.preis}`,
          paymentLink: vorhandene[0].stripePaymentLink,
          kategorie: def.kategorie,
        });
        continue;
      }

      // Stripe Produkt + Link erstellen
      const { produktId, preisId, paymentLink } = await erstelleStripeProduktUndLink(def);

      // Produkt-Inhalt generieren
      const inhalt = await generiereProduktInhalt(def.name, def.kategorie);

      // In DB speichern
      if (vorhandene.length === 0) {
        await db.insert(produkteTable).values({
          name: def.name,
          beschreibung: def.beschreibung,
          preis: def.preis,
          kategorie: def.kategorie,
          stripeProduktId: produktId,
          stripePreisId: preisId,
          stripePaymentLink: paymentLink,
          inhalt,
          aktiv: true,
        });
      } else {
        await db.update(produkteTable)
          .set({ stripeProduktId: produktId, stripePreisId: preisId, stripePaymentLink: paymentLink, inhalt, aktiv: true, updatedAt: new Date() })
          .where(eq(produkteTable.name, def.name));
      }

      erstellt.push({ name: def.name, preis: `€${def.preis}`, paymentLink, kategorie: def.kategorie });
      logger.info({ produktName: def.name, paymentLink }, "✅ Stripe-Produkt + Payment-Link erstellt");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fehler.push(`${def.name}: ${msg}`);
      logger.error({ err, produktName: def.name }, "Fehler beim Erstellen des Stripe-Produkts");
    }
  }

  // Setup-Schritt als erledigt markieren
  if (erstellt.length > 0) {
    await db.update(setupSchritteTable)
      .set({ erledigt: true, erledigtAm: new Date(), updatedAt: new Date() })
      .where(eq(setupSchritteTable.schluessel, "stripe_produkte"));
  }

  // SPRINT 53: Agent-ID aus der DB holen (statt hardcodiertem Wert 0)
  let sofortAgentId = 0;
  try {
    const { agentsTable } = await import("@workspace/db");
    const [agent] = await db.select({ id: agentsTable.id })
      .from(agentsTable)
      .where(eq(agentsTable.name, "SofortStart Agent"))
      .limit(1);
    if (agent) sofortAgentId = agent.id;
  } catch {}
  
  if (sofortAgentId > 0) {
    await db.insert(agentLogsTable).values({
      agentId: sofortAgentId,
      agentName: "SofortStart Agent",
      aktion: "stripe_produkte_erstellen",
      status: fehler.length === 0 ? "erfolgreich" : erstellt.length > 0 ? "erfolgreich" : "fehler",
      nachricht: `${erstellt.length} Produkte erstellt, ${fehler.length} Fehler`,
    });
  }

  return { erstellt: erstellt.length, produkte: erstellt, fehler };
}

// ─── Alle Produkte laden ──────────────────────────────────────────────────────

export async function ladeProdukte() {
  return db.select().from(produkteTable).where(eq(produkteTable.aktiv, true));
}

// ─── Setup-Status laden ───────────────────────────────────────────────────────

export async function ladeSetupStatus() {
  await initialisiereSetupSchritte();
  return db.select().from(setupSchritteTable);
}

// ─── Setup-Schritt manuell als erledigt markieren ─────────────────────────────

export async function markiereSetupSchritt(schluessel: string, metadaten?: Record<string, string>): Promise<void> {
  await db.update(setupSchritteTable)
    .set({
      erledigt: true,
      erledigtAm: new Date(),
      metadaten: metadaten ? JSON.stringify(metadaten) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(setupSchritteTable.schluessel, schluessel));
}

// ─── Gumroad Produkt-Beschreibungen generieren ────────────────────────────────

export async function generiereGumroadBeschreibungen(): Promise<Array<{
  name: string;
  preis: string;
  titelVorschlag: string;
  beschreibungVorschlag: string;
  tagsVorschlag: string[];
  stripeLink: string;
}>> {
  const produkte = await db.select().from(produkteTable);

  return produkte.map(p => {
    const inhalt = p.inhalt ? (() => { try { return JSON.parse(p.inhalt!) as Record<string, unknown>; } catch { return {}; } })() : {};
    return {
      name: p.name,
      preis: `€${p.preis}`,
      titelVorschlag: p.name,
      beschreibungVorschlag: p.beschreibung ?? "",
      tagsVorschlag: ["ChatGPT", "KI", "Prompts", "Automatisierung", "Online Business", "Passives Einkommen"],
      stripeLink: p.stripePaymentLink ?? "",
      inhalt,
    };
  });
}

// ─── Digistore24 Content-Templates ───────────────────────────────────────────

export function generiereAffiliateContentTemplates(): Array<{
  platform: string;
  vorlage: string;
  platzhalter: string;
}> {
  return [
    {
      platform: "TikTok/Instagram Caption",
      vorlage: `Ich nutze diese KI-Tools um €X/Monat passiv zu verdienen 🤖💰

Die 3 Tools die ich täglich benutze:
1. ChatGPT + diese Prompt-Sammlung (Link in Bio)
2. [DEIN-DIGISTORE-AFFILIATE-LINK]
3. Automatisierung statt Überstunden

Willst du wissen wie? Schreib mir "KI" in die Kommentare ⬇️

#KI #ChatGPT #PassivesEinkommen #OnlineBusiness #Automatisierung`,
      platzhalter: "[DEIN-DIGISTORE-AFFILIATE-LINK]",
    },
    {
      platform: "E-Mail Newsletter",
      vorlage: `Betreff: Das KI-Tool das alles verändert hat

Hallo [NAME],

Ich muss dir etwas zeigen.

Seit ich [PRODUKT-NAME] nutze, hat sich mein Business komplett verändert.

In nur 30 Tagen:
✅ 5x mehr Content in der Hälfte der Zeit
✅ Erste automatische Umsätze
✅ Weniger Stress, mehr Ergebnis

Hier ist dein exklusiver Link: [DEIN-DIGISTORE-AFFILIATE-LINK]

Mit freundlichen Grüßen
[DEIN NAME]`,
      platzhalter: "[DEIN-DIGISTORE-AFFILIATE-LINK]",
    },
    {
      platform: "YouTube Videobeschreibung",
      vorlage: `🔥 Die Tools die ich in diesem Video verwende:

📦 KI-Prompt Paket (50 bewährte Prompts): [STRIPE-PAYMENT-LINK]
💼 Empfohlenes KI-Kurs-Paket: [DEIN-DIGISTORE-AFFILIATE-LINK]

━━━━━━━━━━━━━━━━━━━━━━━━
⏱️ Kapitel:
0:00 Intro
1:30 Tool-Übersicht  
5:00 Live-Demo
10:00 Ergebnisse
━━━━━━━━━━━━━━━━━━━━━━━━`,
      platzhalter: "[DEIN-DIGISTORE-AFFILIATE-LINK]",
    },
  ];
}
