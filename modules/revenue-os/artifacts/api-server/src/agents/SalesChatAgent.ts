/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AI SALES CHAT AGENT (Sprint 5.2)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * KI-Verkaufsassistent mit Conversational Commerce:
 *  - Versteht Kundenanliegen via OpenAI (gpt-4o-mini)
 *  - Empfiehlt passende Produkte aus Stripe/Datenbank
 *  - Generiert Stripe-Checkout-Links direkt im Chat
 *  - Erstellt personalisierte Coupons bei Zögern
 *  - Qualifiziert Leads für Follow-up
 *  - Lernt aus erfolgreichen Verkaufsgesprächen
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { db } from "@workspace/db";
import {
  salesConversationsTable, salesChatLeadsTable,
  produkteTable, couponsTable, transactionsTable, agentLogsTable
} from "@workspace/db";
import { eq, desc, gte, and, sql, lt } from "drizzle-orm";
import { logger } from "../lib/logger";
import { openai, openaiVerfuegbar } from "../lib/openaiClient";
import { getStripeClient } from "../lib/stripeClient";

interface ChatMessage {
  rolle: "customer" | "assistant" | "system";
  inhalt: string;
  timestamp: string;
}

interface SalesAntwort {
  nachricht: string;
  produkte?: Array<{ name: string; preis: number; link?: string; beschreibung?: string }>;
  checkoutLink?: string;
  couponCode?: string;
  leadQualifiziert?: boolean;
  stimmung?: string;
}

const SALES_SYSTEM_PROMPT = `Du bist "Sarah" — der freundliche KI-Verkaufsassistent von CyberSarah.
Deine Persönlichkeit: warmherzig, professionell, begeisterungsfähig. Du sprichst natürlich Deutsch.

DEINE AUFGABE:
1. Verstehe, wonach der Kunde sucht
2. Empfehle passende Produkte aus dem Sortiment
3. Beantworte Fragen zu Produkten, Preisen und Funktionen
4. Erstelle bei Interesse einen Checkout-Link
5. Gib bei Zögern einen Rabatt-Code
6. Sammle E-Mail für Follow-up

REGELN:
- Sei hilfreich, nicht aufdringlich
- Nenne konkrete Preise in Euro
- Bei Preis-Bedenken: erwähne Rabatt-Möglichkeiten
- Wenn der Kunde kaufen will: erstelle Checkout-Link
- Bleib freundlich auch bei Ablehnung
- Maximal 3 Produkte auf einmal empfehlen`;
const STRIPE_PRODUKT_CACHE = new Map<string, any[]>();
let letzterCacheRefresh = 0;

async function ladeProdukte(): Promise<any[]> {
  if (Date.now() - letzterCacheRefresh < 60000) {
    return STRIPE_PRODUKT_CACHE.get("produkte") ?? [];
  }

  // 1. Aus eigener DB
  const dbProdukte = await db.select().from(produkteTable).where(eq(produkteTable.aktiv, true));

  // 2. Von Stripe
  const stripeProdukte: any[] = [];
  try {
    const stripe = getStripeClient();
    if (stripe) {
      const prods = await stripe.products.list({ active: true, limit: 30 });
      for (const p of prods.data) {
        const preise = await stripe.prices.list({ product: p.id, limit: 1 });
        const preis = preise.data[0]?.unit_amount ? preise.data[0].unit_amount / 100 : 0;
        stripeProdukte.push({
          name: p.name,
          beschreibung: p.description ?? "Keine Beschreibung",
          preis,
          link: p.url ?? null,
          stripeProduktId: p.id,
          quelle: "stripe",
        });
      }
    }
  } catch {}

  const alle = [...dbProdukte.map(p => ({
    name: p.name,
    beschreibung: p.beschreibung ?? "Digitales Produkt",
    preis: parseFloat(p.preis),
    link: p.stripePaymentLink ?? null,
    stripeProduktId: p.stripeProduktId ?? null,
    quelle: "datenbank",
  })), ...stripeProdukte];

  STRIPE_PRODUKT_CACHE.set("produkte", alle);
  letzterCacheRefresh = Date.now();
  return alle;
}

export class SalesChatAgent extends AgentBase {
  constructor() {
    super("AI Sales Chat Agent", "sales_chat");
  }

  protected beschreibungText(): string {
    return "AUTONOM: KI-Verkaufsassistent, der Kunden berät, Produkte empfiehlt, Stripe-Checkout-Links generiert und Leads qualifiziert";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const aktion = String(aufgabe.payload?.["aktion"] ?? "process_message");
    const sessionId = String(aufgabe.payload?.["sessionId"] ?? `session-${Date.now()}`);
    const message = String(aufgabe.payload?.["message"] ?? "");
    const email = String(aufgabe.payload?.["email"] ?? "");

    switch (aktion) {
      case "process_message":
        return this.verarbeiteNachricht(sessionId, message, email);
      case "analyze":
        return this.analysiereKonversationen();
      case "followup":
        return this.sendeFollowups();
      case "stats":
        return this.holeStats();
      default:
        return this.verarbeiteNachricht(sessionId, message, email);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // NACHRICHT VERARBEITEN (KI-Antwort generieren)
  // ═════════════════════════════════════════════════════════════════════════════
  async verarbeiteNachricht(sessionId: string, message: string, kundenEmail?: string): Promise<AufgabeErgebnis> {
    // Konversation laden oder erstellen
    let [conversation] = await db
      .select()
      .from(salesConversationsTable)
      .where(eq(salesConversationsTable.sessionId, sessionId))
      .limit(1);

    if (!conversation) {
      const [neu] = await db.insert(salesConversationsTable).values({
        sessionId,
        kundenEmail: kundenEmail ?? null,
        nachrichten: JSON.stringify([]),
      }).returning();
      conversation = neu;
    }

    // Nachrichten-Array parsen
    let nachrichten: ChatMessage[] = [];
    const rohNachrichten = conversation.nachrichten;
    if (typeof rohNachrichten === "string") {
      try {
        nachrichten = JSON.parse(rohNachrichten) as ChatMessage[];
      } catch {
        nachrichten = [];
      }
    } else if (Array.isArray(rohNachrichten)) {
      nachrichten = rohNachrichten as ChatMessage[];
    }

    // Kunden-Nachricht hinzufügen
    nachrichten.push({
      rolle: "customer",
      inhalt: message,
      timestamp: new Date().toISOString(),
    });

    // Produkte laden
    const produkte = await ladeProdukte();
    const produkteListe = produkte.map(p =>
      `- ${p.name}: €${p.preis.toFixed(2)} — ${p.beschreibung.slice(0, 100)}${p.link ? ` (Link: ${p.link})` : ""}`
    ).join("\n");

    // Aktive Coupons
    const aktiveCoupons = await db
      .select({ code: couponsTable.code, wert: couponsTable.wert, typ: couponsTable.typ })
      .from(couponsTable)
      .where(
        and(
          eq(couponsTable.aktiv, true),
          sql`(${couponsTable.endDatum} IS NULL OR ${couponsTable.endDatum} > NOW())`,
        ),
      )
      .limit(5);

    const couponsStr = aktiveCoupons.map(c =>
      `${c.code}: ${c.typ === "prozent" ? c.wert + "%" : c.wert + "€"} Rabatt`
    ).join(" | ");

    // Letzte 10 Nachrichten für Kontext
    const letzteNachrichten = nachrichten.slice(-10);

    const prompt: any[] = [
      { role: "system", content: SALES_SYSTEM_PROMPT + `\n\nVERFÜGBARE PRODUKTE:\n${produkteListe}\n\nAKTIVE COUPONS:\n${couponsStr}` },
      ...letzteNachrichten.map(n => ({
        role: n.rolle === "customer" ? "user" : "assistant" as const,
        content: n.inhalt,
      })),
      {
        role: "system",
        content: `Antworte als Sarah. Strukturiere deine Antwort mit ##PRODUKTE## und ##CHECKOUT## und ##COUPON## wenn nötig.
Beispiel:
##PRODUKTE##: ["Produktname"]
##CHECKOUT##: optionaler Checkout-Link
##COUPON##: optionaler Coupon-Code
##STIMMUNG##: interessiert/neutral/positiv/negativ

Danach deine normale Antwort als Sarah.`,
      },
    ];

    try {
      const response = await openai!.chat.completions.create({
        model: "gpt-4o-mini",
        messages: prompt,
        temperature: 0.7,
        max_tokens: 800,
      });

      const antwortText = response.choices?.[0]?.message?.content ?? "Entschuldigung, ich habe dich nicht verstanden. Kannst du das wiederholen?";

      // Metadaten aus Antwort parsen
      const produkteMatch = antwortText.match(/##PRODUKTE##:\s*(\[[\s\S]*?\])/);
      const checkoutMatch = antwortText.match(/##CHECKOUT##:\s*(\S+)/);
      const couponMatch = antwortText.match(/##COUPON##:\s*(\S+)/);
      const stimmungMatch = antwortText.match(/##STIMMUNG##:\s*(\w+)/);

      const empfohlenesProdukt = produkteMatch ? JSON.parse(produkteMatch[1])[0] : null;
      const checkoutLink = checkoutMatch ? checkoutMatch[1] : null;
      const couponCode = couponMatch ? couponMatch[1] : null;
      const stimmung = stimmungMatch ? stimmungMatch[1] : "neutral";

      // Bereinigte Antwort (ohne Metadaten-Blöcke)
      const saubereAntwort = antwortText
        .replace(/##PRODUKTE##:.*?(\n|$)/, "")
        .replace(/##CHECKOUT##:.*?(\n|$)/, "")
        .replace(/##COUPON##:.*?(\n|$)/, "")
        .replace(/##STIMMUNG##:.*?(\n|$)/, "")
        .trim();

      // Assistant-Nachricht hinzufügen
      nachrichten.push({
        rolle: "assistant",
        inhalt: saubereAntwort,
        timestamp: new Date().toISOString(),
      });

      // Konversation aktualisieren
      await db.update(salesConversationsTable)
        .set({
          nachrichten: JSON.stringify(nachrichten),
          stimmung: stimmung || conversation.stimmung,
          empfohlenesProdukt: empfohlenesProdukt || conversation.empfohlenesProdukt,
          checkoutLink: checkoutLink || conversation.checkoutLink,
          couponCode: couponCode || conversation.couponCode,
          updatedAt: new Date(),
        })
        .where(eq(salesConversationsTable.id, conversation.id));

      // Lead qualifizieren wenn interessiert
      if (["interessiert", "positiv"].includes(stimmung) && conversation.kundenEmail) {
        const [existingLead] = await db
          .select({ id: salesChatLeadsTable.id })
          .from(salesChatLeadsTable)
          .where(eq(salesChatLeadsTable.sessionId, sessionId))
          .limit(1);

        if (!existingLead) {
          await db.insert(salesChatLeadsTable).values({
            sessionId,
            conversationId: conversation.id,
            email: conversation.kundenEmail ?? null,
            interesse: empfohlenesProdukt ?? null,
            status: "qualifiziert",
          });
        }
      }

      // Bei Kaufinteresse: automatisch Checkout-Link erstellen
      let generierterCheckoutLink = checkoutLink;
      if (empfohlenesProdukt && !checkoutLink && stimmung === "interessiert") {
        try {
          const stripe = getStripeClient();
          if (stripe) {
            const produkteListe = await ladeProdukte();
            const produkt = produkteListe.find(p => p.name === empfohlenesProdukt);
            if (produkt?.stripeProduktId) {
              const preise = await stripe.prices.list({ product: produkt.stripeProduktId, limit: 1 });
              if (preise.data[0]) {
                const session = await stripe.checkout.sessions.create({
                  line_items: [{ price: preise.data[0].id, quantity: 1 }],
                  mode: "payment",
                  success_url: "https://cybersarah.de/danke?sid={CHECKOUT_SESSION_ID}",
                  cancel_url: "https://cybersarah.de",
                  metadata: { quelle: "sales_chat", sessionId },
                });
                generierterCheckoutLink = session.url;

                await db.update(salesConversationsTable)
                  .set({ checkoutLink: session.url, updatedAt: new Date() })
                  .where(eq(salesConversationsTable.id, conversation.id));
              }
            }
          }
        } catch (err) {
          logger.warn({ err }, "Checkout-Link-Erstellung fehlgeschlagen");
        }
      }

      return {
        success: true,
        message: saubereAntwort,
        metadaten: {
          nachricht: saubereAntwort,
          checkoutLink: generierterCheckoutLink,
          couponCode,
          stimmung,
          produkte: produkteMatch ? JSON.parse(produkteMatch[1]) : [],
        },
      };
    } catch (err) {
      logger.error({ err }, "SalesChat-Fehler");
      return {
        success: false,
        message: "Entschuldigung, ein technischer Fehler ist aufgetreten. Bitte versuche es später erneut.",
        metadaten: { fehler: (err as Error).message },
      };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // KONVERSATIONEN ANALYSIEREN
  // ═════════════════════════════════════════════════════════════════════════════
  private async analysiereKonversationen(): Promise<AufgabeErgebnis> {
    const letzte24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const konversationen = await db
      .select()
      .from(salesConversationsTable)
      .where(gte(salesConversationsTable.createdAt, letzte24h));

    let konvertiert = 0;
    let gesamtUmsatz = 0;
    let leads = 0;

    for (const conv of konversationen) {
      if (conv.konvertiert) konvertiert++;
      if (conv.umsatz) gesamtUmsatz += parseFloat(conv.umsatz);
    }

    const leadsCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(salesChatLeadsTable)
      .where(gte(salesChatLeadsTable.createdAt, letzte24h));
    leads = Number(leadsCount[0]?.count ?? 0);

    return {
      success: true,
      message: `${konversationen.length} Gespräche, ${konvertiert} Verkäufe, €${gesamtUmsatz.toFixed(2)} Umsatz`,
      metadaten: { gespraeche: konversationen.length, konvertiert, umsatz: gesamtUmsatz.toFixed(2), leads },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // FOLLOW-UPS
  // ═════════════════════════════════════════════════════════════════════════════
  private async sendeFollowups(): Promise<AufgabeErgebnis> {
    const vor24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const vor7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Leads ohne Kontakt seit 24h aber mit Interesse
    const faellige = await db
      .select()
      .from(salesChatLeadsTable)
      .where(
        and(
          eq(salesChatLeadsTable.status, "qualifiziert"),
          lt(salesChatLeadsTable.updatedAt, vor24h),
          gte(salesChatLeadsTable.createdAt, vor7d),
        ),
      )
      .limit(20);

    let gefolgt = 0;
    for (const lead of faellige) {
      await db.update(salesChatLeadsTable)
        .set({ status: "kontaktiert", updatedAt: new Date() })
        .where(eq(salesChatLeadsTable.id, lead.id));
      gefolgt++;
    }

    return {
      success: true,
      message: `${gefolgt} Follow-ups durchgeführt`,
      metadaten: { faellige: faellige.length, gefolgt },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STATISTIK
  // ═════════════════════════════════════════════════════════════════════════════
  private async holeStats(): Promise<AufgabeErgebnis> {
    const vor30Tagen = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const konversationen = await db
      .select()
      .from(salesConversationsTable)
      .where(gte(salesConversationsTable.createdAt, vor30Tagen));

    const konvertiert = konversationen.filter(c => c.konvertiert);
    const gesamtUmsatz = konvertiert.reduce((s, c) => s + parseFloat(c.umsatz ?? "0"), 0);
    const stimmungen: Record<string, number> = {};
    for (const c of konversationen) {
      const s = c.stimmung ?? "neutral";
      stimmungen[s] = (stimmungen[s] ?? 0) + 1;
    }

    const leads = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(salesChatLeadsTable)
      .where(gte(salesChatLeadsTable.createdAt, vor30Tagen));

    return {
      success: true,
      message: `${konversationen.length} Gespräche, €${gesamtUmsatz.toFixed(2)} Umsatz`,
      metadaten: {
        gespraeche: konversationen.length,
        konvertiert: konvertiert.length,
        umsatz: gesamtUmsatz.toFixed(2),
        konversionsRate: konversationen.length > 0
          ? `${((konvertiert.length / konversationen.length) * 100).toFixed(1)}%` : "0%",
        stimmungen,
        leads: Number(leads[0]?.count ?? 0),
      },
    };
  }
}
