/**
 * Digitalprodukt-Katalog-Agent
 * Erweitert den Produktkatalog autonom: generiert neue Produktideen (OpenAI),
 * erstellt ECHTE Stripe-Produkte + Payment-Links, testet Preispunkte (A/B) und
 * pausiert Flops ohne Verkäufe automatisch. Baut auf produkteTable auf
 * (gleiche Tabelle wie SofortStart-Agent, unterschieden über `quelle`).
 */
import { db } from "@workspace/db";
import { produkteTable, agentLogsTable, agentsTable } from "@workspace/db";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getStripeClient, stripeLiveKey } from "../lib/stripeClient";
import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { inkrementiereFallbackZaehler, setzeSmartPause, istSmartPausiert } from "./watchdog";

const MAX_NEUE_PRODUKTE_PRO_SCAN = 2;
const FLOP_SCHWELLE_TAGE = 10; // ohne Verkauf → Preistest, dann Pause
const PREISTEST_RABATT = 0.7; // Variante B = 30% günstiger

async function holeEigeneAgentId(): Promise<number | null> {
  const [agent] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.name, "Digitalprodukt-Katalog-Agent"));
  return agent?.id ?? null;
}

// ─── Fallback-Ideen (falls OpenAI nicht verfügbar) ───────────────────────────

const FALLBACK_IDEEN = [
  { name: "KI-Automatisierungs-Blueprint", beschreibung: "Schritt-für-Schritt-Anleitung: 10 Business-Prozesse mit KI automatisieren, inkl. fertiger Prompt-Vorlagen", preis: "29.00", kategorie: "template" as const },
  { name: "Social-Media-Content-Kalender KI-Edition", beschreibung: "90 Tage fertig geplanter Content-Kalender mit KI-Prompts für jeden Tag, für 3 Plattformen", preis: "39.00", kategorie: "template" as const },
  { name: "ChatGPT E-Mail-Marketing Masterkit", beschreibung: "40 verkaufsstarke E-Mail-Vorlagen + KI-Prompts zur Personalisierung für höhere Öffnungsraten", preis: "34.00", kategorie: "prompt_paket" as const },
  { name: "KI-Freelancer Starter-Kit", beschreibung: "Verträge, Angebotsvorlagen und KI-Prompts um als Freelancer schneller Kunden zu gewinnen", preis: "45.00", kategorie: "template" as const },
];

interface ProduktIdee {
  name: string;
  beschreibung: string;
  preis: string;
  kategorie: "prompt_paket" | "coaching" | "kurs" | "template";
}

// ─── OpenAI: neue, differenzierte Produktideen generieren ────────────────────

async function generiereProduktIdeen(agentId: number | null, vorhandeneNamen: string[], anzahl: number): Promise<ProduktIdee[]> {
  if (!openaiVerfuegbar || !openai) {
    if (agentId !== null) inkrementiereFallbackZaehler(agentId, "Digitalprodukt-Katalog-Agent");
    return FALLBACK_IDEEN.filter(i => !vorhandeneNamen.includes(i.name)).slice(0, anzahl);
  }
  if (agentId !== null && istSmartPausiert(agentId)) {
    return FALLBACK_IDEEN.filter(i => !vorhandeneNamen.includes(i.name)).slice(0, anzahl);
  }

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: "Du entwickelst neue digitale Produktideen für ein deutschsprachiges KI-Business (CyberSarah, GeldPilot AI, UnternehmerGPT). Gib NUR valides JSON zurück: ein Array von Objekten mit name, beschreibung, preis (String, z.B. \"39.00\"), kategorie (einer von: prompt_paket, template, kurs).",
        },
        {
          role: "user",
          content: `Erstelle ${anzahl} neue Digitalprodukt-Ideen (PDF-Guides, Prompt-Pakete, Templates, Checklisten) für Selbstständige/Online-Unternehmer. Vermeide Überschneidung mit bereits vorhandenen Produkten: ${vorhandeneNamen.join(", ") || "keine"}. Preise zwischen 19 und 59 Euro.`,
        },
      ],
    });
    const raw = resp.choices[0]?.message.content ?? "[]";
    const cleaned = raw.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as ProduktIdee[] | { produkte: ProduktIdee[] };
    const liste = Array.isArray(parsed) ? parsed : parsed.produkte;
    return (liste ?? []).filter(i => i?.name && !vorhandeneNamen.includes(i.name)).slice(0, anzahl);
  } catch (err) {
    const { istApiKeyFehler } = handleOpenAIFehler(err, "Digitalprodukt-Katalog-Agent");
    if (istApiKeyFehler && agentId !== null) {
      setzeSmartPause(agentId, "Digitalprodukt-Katalog-Agent", "OpenAI 401 — API-Key ungültig");
    }
    logger.warn({ err }, "Digitalprodukt-Agent: OpenAI-Ideengenerierung fehlgeschlagen, nutze Fallback");
    return FALLBACK_IDEEN.filter(i => !vorhandeneNamen.includes(i.name)).slice(0, anzahl);
  }
}

// ─── Stripe: echtes Produkt + Preis + Payment-Link erstellen ────────────────

async function erstelleStripeProduktUndLink(
  name: string,
  beschreibung: string,
  preis: string,
): Promise<{ produktId: string; preisId: string; paymentLink: string }> {
  const stripe = getStripeClient();

  const produkt = await stripe.products.create({
    name,
    description: beschreibung,
    metadata: { system: "CyberSarah-OS", quelle: "digitalprodukt_agent" },
  });

  const preisObj = await stripe.prices.create({
    product: produkt.id,
    unit_amount: Math.round(parseFloat(preis) * 100),
    currency: "eur",
  });

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: preisObj.id, quantity: 1 }],
    after_completion: { type: "redirect", redirect: { url: "https://cybersarah.de/danke" } },
    metadata: { produkt: name, system: "CyberSarah-OS" },
  });

  return { produktId: produkt.id, preisId: preisObj.id, paymentLink: link.url };
}

// ─── Phase 1: neue Produkte scannen + erstellen ─────────────────────────────

export async function scanneNeueProdukte(): Promise<{
  erstellt: number;
  produkte: Array<{ name: string; preis: string; paymentLink: string }>;
  fehler: string[];
}> {
  const fehler: string[] = [];

  if (!process.env.STRIPE_SECRET_KEY) {
    fehler.push("Stripe-Key fehlt — bitte STRIPE_SECRET_KEY als Umgebungsvariable setzen");
    return { erstellt: 0, produkte: [], fehler };
  }
  if (!stripeLiveKey) {
    logger.warn("Digitalprodukt-Agent: Stripe im TEST-Modus — Produkte werden erstellt, generieren aber keinen echten Umsatz");
  }

  const agentId = await holeEigeneAgentId();
  const vorhandene = await db.select({ name: produkteTable.name }).from(produkteTable);
  const vorhandeneNamen = vorhandene.map(p => p.name);

  const ideen = await generiereProduktIdeen(agentId, vorhandeneNamen, MAX_NEUE_PRODUKTE_PRO_SCAN);
  const erstellt: Array<{ name: string; preis: string; paymentLink: string }> = [];

  for (const idee of ideen) {
    try {
      const { produktId, preisId, paymentLink } = await erstelleStripeProduktUndLink(idee.name, idee.beschreibung, idee.preis);

      await db.insert(produkteTable).values({
        name: idee.name,
        beschreibung: idee.beschreibung,
        preis: idee.preis,
        kategorie: idee.kategorie,
        stripeProduktId: produktId,
        stripePreisId: preisId,
        stripePaymentLink: paymentLink,
        quelle: "digitalprodukt_agent",
        aktiv: true,
      });

      erstellt.push({ name: idee.name, preis: `€${idee.preis}`, paymentLink });
      logger.info({ produktName: idee.name, paymentLink }, "✅ Digitalprodukt-Agent: neues Stripe-Produkt erstellt");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fehler.push(`${idee.name}: ${msg}`);
      logger.error({ err, produktName: idee.name }, "Digitalprodukt-Agent: Fehler beim Erstellen");
    }
  }

  if (agentId !== null) {
    await db.insert(agentLogsTable).values({
      agentId,
      agentName: "Digitalprodukt-Katalog-Agent",
      aktion: "produkte_scannen",
      status: fehler.length === 0 ? "erfolgreich" : erstellt.length > 0 ? "erfolgreich" : "fehler",
      nachricht: `${erstellt.length} neue Produkte erstellt, ${fehler.length} Fehler`,
    });
  }

  return { erstellt: erstellt.length, produkte: erstellt, fehler };
}

// ─── Phase 2: echte Verkäufe je Produkt aus Stripe abgleichen ───────────────

export async function synchronisiereVerkaeufe(): Promise<{ aktualisiert: number }> {
  if (!process.env.STRIPE_SECRET_KEY) return { aktualisiert: 0 };

  const stripe = getStripeClient();
  const produkte = await db.select().from(produkteTable).where(sql`${produkteTable.stripePaymentLink} IS NOT NULL`);

  let aktualisiert = 0;
  for (const p of produkte) {
    if (!p.stripePaymentLink) continue;
    try {
      const linkId = await findePaymentLinkId(p.stripePaymentLink);
      if (!linkId) continue;

      let summe = 0;
      let anzahl = 0;
      for await (const session of stripe.checkout.sessions.list({ payment_link: linkId, limit: 100 })) {
        if (session.payment_status === "paid") {
          summe += (session.amount_total ?? 0) / 100;
          anzahl++;
        }
      }

      if (summe.toFixed(2) !== parseFloat(p.verkauft ?? "0").toFixed(2) || anzahl !== parseInt(p.verkaeufeAnzahl ?? "0", 10)) {
        await db.update(produkteTable)
          .set({ verkauft: summe.toFixed(2), verkaeufeAnzahl: anzahl.toString(), updatedAt: new Date() })
          .where(eq(produkteTable.id, p.id));
        aktualisiert++;
      }
    } catch (err) {
      logger.warn({ err, produktId: p.id }, "Digitalprodukt-Agent: Verkaufs-Sync für Produkt fehlgeschlagen");
    }
  }

  return { aktualisiert };
}

async function findePaymentLinkId(url: string): Promise<string | null> {
  const stripe = getStripeClient();
  for await (const link of stripe.paymentLinks.list({ limit: 100 })) {
    if (link.url === url) return link.id;
  }
  return null;
}

// ─── Phase 3: Preistests starten + Flops pausieren ──────────────────────────

export async function optimierePreiseUndPausiereFlops(): Promise<{
  preistestsGestartet: number;
  pausiert: number;
}> {
  const schwelle = new Date(Date.now() - FLOP_SCHWELLE_TAGE * 24 * 60 * 60 * 1000);

  // Kandidaten: aktive Original-Produkte (keine Variante), älter als Schwelle, 0 Verkäufe, noch kein Preistest
  const kandidaten = await db
    .select()
    .from(produkteTable)
    .where(and(
      eq(produkteTable.aktiv, true),
      isNull(produkteTable.preisVariante),
      isNull(produkteTable.basisProduktId),
      lt(produkteTable.createdAt, schwelle),
    ));

  let preistestsGestartet = 0;
  let pausiert = 0;

  for (const original of kandidaten) {
    const verkaeufe = parseInt(original.verkaeufeAnzahl ?? "0", 10);
    if (verkaeufe > 0) continue;

    // Existiert bereits eine Preisvariante B für dieses Produkt?
    const [variante] = await db
      .select()
      .from(produkteTable)
      .where(eq(produkteTable.basisProduktId, original.id))
      .limit(1);

    if (!variante) {
      // Preistest starten: Variante B mit reduziertem Preis
      try {
        const neuerPreis = (parseFloat(original.preis) * PREISTEST_RABATT).toFixed(2);
        const { produktId, preisId, paymentLink } = await erstelleStripeProduktUndLink(
          `${original.name} (Preistest B)`,
          original.beschreibung ?? "",
          neuerPreis,
        );
        await db.insert(produkteTable).values({
          name: `${original.name} (Preistest B)`,
          beschreibung: original.beschreibung,
          preis: neuerPreis,
          kategorie: original.kategorie,
          stripeProduktId: produktId,
          stripePreisId: preisId,
          stripePaymentLink: paymentLink,
          quelle: "digitalprodukt_agent",
          basisProduktId: original.id,
          preisVariante: "B",
          aktiv: true,
        });
        await db.update(produkteTable)
          .set({ preisVariante: "A", updatedAt: new Date() })
          .where(eq(produkteTable.id, original.id));
        preistestsGestartet++;
        logger.info({ original: original.name, neuerPreis }, "🧪 Digitalprodukt-Agent: Preistest (Variante B) gestartet");
      } catch (err) {
        logger.warn({ err, produkt: original.name }, "Preistest fehlgeschlagen");
      }
    } else {
      // Preistest läuft bereits — nach weiteren FLOP_SCHWELLE_TAGE ohne Verkauf beide pausieren
      const varianteAlt = variante.createdAt ?? new Date();
      const testSchwelle = new Date(Date.now() - FLOP_SCHWELLE_TAGE * 24 * 60 * 60 * 1000);
      const varianteVerkaeufe = parseInt(variante.verkaeufeAnzahl ?? "0", 10);
      if (varianteVerkaeufe === 0 && varianteAlt < testSchwelle) {
        await db.update(produkteTable)
          .set({ aktiv: false, pausiertAm: new Date(), updatedAt: new Date() })
          .where(eq(produkteTable.id, original.id));
        await db.update(produkteTable)
          .set({ aktiv: false, pausiertAm: new Date(), updatedAt: new Date() })
          .where(eq(produkteTable.id, variante.id));
        pausiert += 2;
        logger.info({ original: original.name }, "⏸️ Digitalprodukt-Agent: Flop pausiert (beide Preisvarianten ohne Verkauf)");
      }
    }
  }

  if (preistestsGestartet > 0 || pausiert > 0) {
    const agentId = await holeEigeneAgentId();
    if (agentId !== null) {
      await db.insert(agentLogsTable).values({
        agentId,
        agentName: "Digitalprodukt-Katalog-Agent",
        aktion: "preise_optimieren",
        status: "erfolgreich",
        nachricht: `${preistestsGestartet} Preistests gestartet, ${pausiert} Produkte pausiert`,
      });
    }
  }

  return { preistestsGestartet, pausiert };
}

// ─── Übersicht laden ─────────────────────────────────────────────────────────

export async function ladeKatalogUebersicht() {
  const autoGenerierteProdukte = await db
    .select()
    .from(produkteTable)
    .where(eq(produkteTable.quelle, "digitalprodukt_agent"));
  const gesamtUmsatz = autoGenerierteProdukte.reduce((sum, p) => sum + parseFloat(p.verkauft ?? "0"), 0);
  const gesamtVerkaeufe = autoGenerierteProdukte.reduce((sum, p) => sum + parseInt(p.verkaeufeAnzahl ?? "0", 10), 0);
  return {
    produkte: autoGenerierteProdukte,
    stats: {
      gesamt: autoGenerierteProdukte.length,
      aktiv: autoGenerierteProdukte.filter(p => p.aktiv).length,
      pausiert: autoGenerierteProdukte.filter(p => p.pausiertAm).length,
      autoGeneriert: autoGenerierteProdukte.length,
      gesamtUmsatz: gesamtUmsatz.toFixed(2),
      gesamtVerkaeufe,
    },
  };
}

export async function pausiereProdukt(id: number): Promise<void> {
  await db.update(produkteTable)
    .set({ aktiv: false, pausiertAm: new Date(), updatedAt: new Date() })
    .where(eq(produkteTable.id, id));
}

export async function reaktiviereProdukt(id: number): Promise<void> {
  await db.update(produkteTable)
    .set({ aktiv: true, pausiertAm: null, updatedAt: new Date() })
    .where(eq(produkteTable.id, id));
}
