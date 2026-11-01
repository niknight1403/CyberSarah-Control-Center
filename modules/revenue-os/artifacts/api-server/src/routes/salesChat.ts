/**
 * AI Sales Chat API Route — Conversational Commerce
 * Leichtgewichtiger Chatbot für die Landing Page.
 * Nutzt In-Memory-Speicher (keine DB-Tabelle nötig).
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { leadsTable, produkteTable } from "@workspace/db";
import { openai, openaiVerfuegbar } from "../lib/openaiClient";
import { getStripeClient } from "../lib/stripeClient";
import { logger } from "../lib/logger";
import { eq } from "drizzle-orm";

const router = Router();
const PUBLIC_URL = process.env["PUBLIC_APP_URL"] ?? "http://167.233.196.20:3000";

// In-Memory Chat-Verlauf (flüchtig — OK für Sales Chat)
const chatVerlauf = new Map<string, Array<{ rolle: string; inhalt: string }>>();
const MAX_VERLAUF = 50;

// Produktliste aus DB für den Kontext
async function ladeProduktKontext(): Promise<string> {
  try {
    const produkte = await db
      .select({ name: produkteTable.name, preis: produkteTable.preis, kategorie: produkteTable.kategorie })
      .from(produkteTable)
      .where(eq(produkteTable.aktiv, true))
      .limit(30);
    if (produkte.length === 0) return "Keine Produkte verfügbar.";
    return JSON.stringify(produkte.map(p => ({ name: p.name, preis: `€${p.preis}`, kategorie: p.kategorie })));
  } catch { return "Produkte temporär nicht verfügbar."; }
}

async function erstellePaymentLink(produktName: string): Promise<string | null> {
  try {
    const stripe = getStripeClient();
    if (!stripe) return null;
    const products = await stripe.products.list({ limit: 20, active: true });
    const match = products.data.find(p => p.name.toLowerCase().includes(produktName.toLowerCase()));
    const produkt = match ?? await stripe.products.create({
      name: produktName, description: `KI-empfohlen: ${produktName}`,
    });
    const prices = match ? await stripe.prices.list({ product: produkt.id, limit: 1, active: true }) : { data: [] };
    const price = prices.data[0] ?? await stripe.prices.create({
      product: produkt.id, unit_amount: 1999, currency: "eur",
    });
    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
    });
    return link.url;
  } catch { return null; }
}

router.post("/sales-chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body as { message?: string; sessionId?: string };
    if (!message || !sessionId) { res.status(400).json({ error: "message + sessionId required" }); return; }

    // Verlauf initialisieren
    if (!chatVerlauf.has(sessionId)) chatVerlauf.set(sessionId, []);
    const verlauf = chatVerlauf.get(sessionId)!;
    verlauf.push({ rolle: "user", inhalt: message });
    if (verlauf.length > MAX_VERLAUF) verlauf.splice(0, verlauf.length - MAX_VERLAUF);

    if (!openaiVerfuegbar) {
      const reply = `Hallo! 👋 Unser KI-Assistent ist kurz nicht erreichbar. Schau dir gerne direkt unsere Produkte an: ${PUBLIC_URL}/produkte`;
      verlauf.push({ rolle: "assistant", inhalt: reply });
      res.json({ reply, action: null }); return;
    }

    const produkteKontext = await ladeProduktKontext();
    const systemPrompt = `Du bist ein freundlicher KI-Sales-Assistent für CyberSarah. 
Auf Deutsch antworten. Produkte: ${produkteKontext}
Wenn jemand kaufen will → "Ich erstelle dir einen Zahlungslink!" + [KAUFEN:Produktname]
Wenn jemand seine E-Mail teilt → bestätigen + in DB speichern
Sei hilfreich, kurz, professionell.`;

    const msgs = [
      { role: "system", content: systemPrompt },
      ...verlauf.slice(-10).map(m => ({ role: m.rolle, content: m.inhalt })),
    ] as Array<{ role: "system" | "user" | "assistant"; content: string }>;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", messages: msgs, max_tokens: 400, temperature: 0.7,
    });
    let reply = completion.choices[0]?.message?.content ?? "Danke für deine Nachricht!";

    // Kauf-Link
    let paymentLink: string | null = null;
    const kauf = reply.match(/\[KAUFEN:([^\]]+)\]/);
    if (kauf) {
      paymentLink = await erstellePaymentLink(kauf[1]!.trim());
      reply = reply.replace(/\[KAUFEN:[^\]]+\]/, "");
      if (paymentLink) reply += `\n\n🔗 **Zahlungslink:** [Hier klicken zum Kauf](${paymentLink})`;
    }

    // E-Mail speichern
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      try {
        await db.insert(leadsTable).values({
          email: emailMatch[0], quelle: "sales_chat", status: "neu",
          notizen: `Chat-Session: ${sessionId}`,
        });
        reply += "\n\n📧 E-Mail gespeichert! Du bekommst exklusive KI-Tipps.";
      } catch {}
    }

    verlauf.push({ rolle: "assistant", inhalt: reply });
    res.json({ reply, action: paymentLink ? { type: "payment_link", url: paymentLink } : null });
  } catch (err) {
    logger.error({ err }, "Sales Chat Error");
    res.json({ reply: "🔄 Chat kurz nicht verfügbar. Schau dir direkt unsere Produkte an!", action: null });
  }
});

export default router;
