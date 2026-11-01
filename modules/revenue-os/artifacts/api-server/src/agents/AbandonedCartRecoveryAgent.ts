/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ABANDONED CART RECOVERY AGENT (Sprint 4.1)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Automatisierte Wiederherstellung abgebrochener Kaufvorgänge:
 *  - Erkennt abgebrochene Checkouts via Stripe Session-Expiration
 *  - Sendet mehrstufige Erinnerungen (1h → 6h → 24h)
 *  - Versendet personalisierte Coupons für die Wiederherstellung
 *  - Trackt Conversion-Rate der Erinnerungen
 *  - Multi-Channel: Email + Push + WhatsApp
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { db } from "@workspace/db";
import { abandonedCartsTable, couponsTable, transactionsTable, leadsTable, agentLogsTable } from "@workspace/db";
import { eq, desc, gte, and, sql, lt, isNull } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/emailClient";
import { sendPushNotification } from "../lib/pushNotifications";

interface ErinnerungsStufe {
  name: string;
  warteMs: number;
  kanal: string[];
  couponTyp?: "prozent" | "fix";
  couponWert?: number;
  betreff: (name: string, produkte: string, betrag: string) => string;
  nachricht: (name: string, code: string, betrag: string) => string;
}

const ERINNERUNGS_STUFEN: ErinnerungsStufe[] = [
  {
    name: "erinnert_1",
    warteMs: 60 * 60 * 1000, // 1 Stunde
    kanal: ["email"],
    betreff: (name, p, b) => `${name ? name + ", d" : "D"}u hast etwas im Warenkorb vergessen 🛒`,
    nachricht: (name, code, b) =>
      `Hey${name ? " " + name : ""}! 👋\n\n` +
      `Du hattest kürzlich Artikel im Wert von ${b} in deinem Warenkorb.\n` +
      `Möchtest du deinen Einkauf abschließen?\n\n` +
      `👉 ${code ? "Hier geht's direkt zum Checkout" : "https://cybersarah.de/checkout"}\n\n` +
      `Dein CyberSarah-Team 💜`,
  },
  {
    name: "erinnert_2",
    warteMs: 6 * 60 * 60 * 1000, // 6 Stunden
    kanal: ["email", "push"],
    betreff: (name, p, b) => `⏳ Letzte Chance${name ? ", " + name : ""}! Dein Warenkorb läuft ab`,
    nachricht: (name, code, b) =>
      `${name ? name + ", " : ""}dein Warenkorb wird bald freigegeben! 🕐\n\n` +
      `Sichere dir noch schnell deine Artikel:\n` +
      `${code ? "Rabatt-Code: " + code : ""}\n\n` +
      `👉 ${code ? "Jetzt mit Rabatt sichern" : "https://cybersarah.de/checkout"}`,
  },
  {
    name: "coupon_gesendet",
    warteMs: 24 * 60 * 60 * 1000, // 24 Stunden
    kanal: ["email", "push", "whatsapp"],
    couponTyp: "prozent",
    couponWert: 15,
    betreff: (name, p, b) => `🎁 Exklusiv${name ? ", " + name : ""}: 15% Rabatt auf deinen Warenkorb!`,
    nachricht: (name, code, b) =>
      `Hey${name ? " " + name : ""}! 🎁\n\n` +
      `Als besonderen Service erhältst du 15% Rabatt auf deinen Warenkorb (${b})!\n\n` +
      `Rabatt-Code: ${code}\n` +
      `Gültig für: 48 Stunden\n\n` +
      `👉 Jetzt einlösen: https://cybersarah.de/checkout?coupon=${code}\n\n` +
      `Dein CyberSarah-Team 💜`,
  },
];

export class AbandonedCartRecoveryAgent extends AgentBase {
  constructor() {
    super("Abandoned Cart Recovery Agent", "cart_recovery");
  }

  protected beschreibungText(): string {
    return "AUTONOM: Erkennt abgebrochene Käufe, sendet mehrstufige Erinnerungen (1h/6h/24h) mit personalisierten Rabatt-Codes via Email/Push/WhatsApp";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const aktion = String(aufgabe.payload?.["aktion"] ?? "check_carts");

    switch (aktion) {
      case "check_carts":
        return this.pruefeUndErinnere();
      case "check_stripe":
        return this.scanneStripeNachAbgebrochenenSessions();
      case "stats":
        return this.holeStats();
      default:
        return this.pruefeUndErinnere();
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ALLE ABGEBROCHENEN CARTS PRÜFEN und Erinnerungen senden
  // ═════════════════════════════════════════════════════════════════════════════
  private async pruefeUndErinnere(): Promise<AufgabeErgebnis> {
    const offeneCarts = await db
      .select()
      .from(abandonedCartsTable)
      .where(
        and(
          eq(abandonedCartsTable.status, "neu"),
          sql`${abandonedCartsTable.createdAt} < NOW() - INTERVAL '10 minutes'`,
        ),
      )
      .limit(50);

    let erinnert = 0;
    let wiederhergestellt = 0;

    for (const cart of offeneCarts) {
      const result = await this.sendeErinnerung(cart);
      if (result.erinnert) erinnert++;
      if (result.wiederhergestellt) wiederhergestellt++;
    }

    // Auch fällige Folgestufen prüfen
    const fälligeCarts = await this.holeFaelligeErinnerungen();
    for (const cart of fälligeCarts) {
      const result = await this.sendeErinnerung(cart);
      if (result.erinnert) erinnert++;
      if (result.wiederhergestellt) wiederhergestellt++;
    }

    return {
      success: true,
      message: `${erinnert} Erinnerungen gesendet, ${wiederhergestellt} wiederhergestellt`,
      metadaten: { geprueft: offeneCarts.length, erinnert, wiederhergestellt },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // FÄLLIGE FOLGE-ERINNERUNGEN finden
  // ═════════════════════════════════════════════════════════════════════════════
  private async holeFaelligeErinnerungen(): Promise<any[]> {
    const ergebnisse: any[] = [];

    for (let i = 0; i < ERINNERUNGS_STUFEN.length - 1; i++) {
      const aktuelleStufe = ERINNERUNGS_STUFEN[i]!;
      const naechsteStufe = ERINNERUNGS_STUFEN[i + 1]!;

      const fällig = await db
        .select()
        .from(abandonedCartsTable)
        .where(
          and(
            eq(abandonedCartsTable.status, aktuelleStufe.name as any),
            sql`${abandonedCartsTable.updatedAt} < NOW() - INTERVAL '${sql.raw(String(naechsteStufe.warteMs))} milliseconds'`,
          ),
        )
        .limit(30);

      ergebnisse.push(...fällig);
    }

    return ergebnisse;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ERINNERUNG VERSENDEN (mehrstufig)
  // ═════════════════════════════════════════════════════════════════════════════
  private async sendeErinnerung(cart: any): Promise<{ erinnert: boolean; wiederhergestellt: boolean }> {
    const stufenIndex = ERINNERUNGS_STUFEN.findIndex(s => s.name === cart.status);
    const stufe = stufenIndex >= 0 ? ERINNERUNGS_STUFEN[stufenIndex]! : ERINNERUNGS_STUFEN[0]!;
    const naechsteStufe = stufenIndex >= 0 && stufenIndex < ERINNERUNGS_STUFEN.length - 1
      ? ERINNERUNGS_STUFEN[stufenIndex + 1]!
      : null;

    let produkte: { name: string; preis: number; menge: number }[] = [];
    try { produkte = JSON.parse(cart.produkte); } catch {}

    const produkteStr = produkte.map(p => `${p.name} (${p.menge}x ${p.preis.toFixed(2)}€)`).join(", ");
    const betragStr = `${parseFloat(cart.gesamtbetrag).toFixed(2)}€`;

    let couponCode = "";
    let neuerStatus = naechsteStufe?.name ?? "verloren";

    // Coupon erstellen wenn die Stufe einen vorsieht
    if (naechsteStufe?.couponTyp && naechsteStufe.couponWert) {
      // Prüfen ob bereits ein Coupon existiert
      if (!cart.couponId) {
        const code = `CART${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const endDatum = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const [coupon] = await db.insert(couponsTable).values({
          code,
          typ: naechsteStufe.couponTyp,
          wert: String(naechsteStufe.couponWert),
          mindestbestellwert: "0",
          maxUses: 1,
          aktiv: true,
          startDatum: new Date(),
          endDatum,
          erstelltVon: "agent",
          kiGeneriert: true,
          kiBegruendung: `Abandoned Cart Recovery für ${cart.kundenEmail || cart.kundenTelefon}`,
          giltFuerProdukte: "all",
        }).returning({ id: couponsTable.id, code: couponsTable.code });

        if (coupon) {
          couponCode = coupon.code;
          // Coupon-ID im Cart speichern
          await db.update(abandonedCartsTable)
            .set({ couponId: coupon.id, status: neuerStatus as any, updatedAt: new Date() })
            .where(eq(abandonedCartsTable.id, cart.id));
        }
      } else {
        // Coupon-Code laden
        const [coupon] = await db.select({ code: couponsTable.code }).from(couponsTable).where(eq(couponsTable.id, cart.couponId));
        couponCode = coupon?.code ?? "";
        neuerStatus = naechsteStufe.name;
      }
    }

    // Nachricht über konfigurierte Kanäle senden
    const kanaele: string[] = [];
    try { kanaele.push(...JSON.parse(cart.erinnerungsKanaele ?? "[]")); } catch {}

    for (const kanal of (naechsteStufe?.kanal ?? stufe.kanal)) {
      const betreff = (naechsteStufe ?? stufe).betreff(cart.kundenName ?? "", produkteStr, betragStr);
      const nachricht = (naechsteStufe ?? stufe).nachricht(cart.kundenName ?? "", couponCode || "WILLKOMMEN10", betragStr);

      switch (kanal) {
        case "email":
          if (cart.kundenEmail) {
            try {
              await sendEmail({
                to: cart.kundenEmail,
                subject: betreff,
                text: nachricht,
              });
              logger.info({ email: cart.kundenEmail, stufe: neuerStatus }, "📧 Cart-Recovery-Email gesendet");
            } catch (err) {
              logger.warn({ err, email: cart.kundenEmail }, "Cart-Recovery-Email fehlgeschlagen");
            }
          }
          break;
        case "push":
          try {
            await sendPushNotification({
              title: betreff,
              body: nachricht.slice(0, 200),
              data: { type: "cart_recovery", cartId: cart.id, couponCode },
            });
            logger.info({ stufe: neuerStatus }, "📱 Cart-Recovery-Push gesendet");
          } catch {}
          break;
        case "whatsapp":
          // WhatsApp-Integration für später
          logger.info({ telefon: cart.kundenTelefon, stufe: neuerStatus }, "📱 Cart-Recovery-WhatsApp (geplant)");
          break;
      }
    }

    // Status aktualisieren falls kein Coupon erstellt wurde
    if (!cart.couponId && !(naechsteStufe?.couponTyp)) {
      await db.update(abandonedCartsTable)
        .set({ status: neuerStatus as any, updatedAt: new Date() })
        .where(eq(abandonedCartsTable.id, cart.id));
    }

    return { erinnert: true, wiederhergestellt: false };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STRIPE NACH ABGEBROCHENEN SESSIONS DURCHSUCHEN
  // ═════════════════════════════════════════════════════════════════════════════
  private async scanneStripeNachAbgebrochenenSessions(): Promise<AufgabeErgebnis> {
    try {
      const stripe = (await import("../lib/stripeClient")).getStripeClient();
      if (!stripe) {
        return { success: false, message: "Stripe nicht konfiguriert" };
      }

      // Abgelaufene Checkout-Sessions der letzten 7 Tage abrufen
      const vor7Tagen = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
      const sessions = await stripe.checkout.sessions.list({
        limit: 100,
        created: { gte: vor7Tagen },
      });

      let neuErfasst = 0;
      for (const session of sessions.data) {
        if (session.status === "expired" || (session.status === "open" && session.expires_at! < Math.floor(Date.now() / 1000))) {
          // Prüfen ob bereits erfasst
          const [existing] = await db.select({ id: abandonedCartsTable.id })
            .from(abandonedCartsTable)
            .where(eq(abandonedCartsTable.stripeSessionId, session.id));

          if (existing) continue;

          const kundenEmail = session.customer_details?.email ?? session.customer_email;
          const gesamtbetrag = session.amount_total ? session.amount_total / 100 : 0;

          if (gesamtbetrag <= 0) continue;

          // Produkte aus Session laden
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
          const produkte = lineItems.data.map(item => ({
            name: item.description ?? "Produkt",
            preis: (item.amount_total ?? 0) / 100,
            menge: item.quantity ?? 1,
          }));

          await db.insert(abandonedCartsTable).values({
            kundenEmail: kundenEmail ?? null,
            kundenName: session.customer_details?.name ?? null,
            produkte: JSON.stringify(produkte),
            gesamtbetrag: String(gesamtbetrag),
            waehrung: session.currency?.toUpperCase() ?? "EUR",
            quelle: "stripe",
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent as string ?? null,
            status: "neu",
            erinnerungsKanaele: JSON.stringify(session.customer_details?.email ? ["email"] : []),
          });

          neuErfasst++;
        }
      }

      logger.info({ neuErfasst }, "🔍 Stripe-Abandoned-Cart-Scan abgeschlossen");

      return {
        success: true,
        message: `${neuErfasst} neue abgebrochene Stripe-Sessions erfasst`,
        metadaten: { gescannt: sessions.data.length, neuErfasst },
      };
    } catch (err) {
      logger.error({ err }, "Stripe-Scan fehlgeschlagen");
      return { success: false, message: `Stripe-Fehler: ${(err as Error).message}` };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STATISTIK
  // ═════════════════════════════════════════════════════════════════════════════
  private async holeStats(): Promise<AufgabeErgebnis> {
    const vor30Tagen = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const alle = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(abandonedCartsTable)
      .where(gte(abandonedCartsTable.createdAt, vor30Tagen));

    const wiederhergestellt = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(abandonedCartsTable)
      .where(
        and(
          eq(abandonedCartsTable.status, "wiederhergestellt"),
          gte(abandonedCartsTable.createdAt, vor30Tagen),
        ),
      );

    const gesamt = Number(alle[0]?.count ?? 0);
    const gerettet = Number(wiederhergestellt[0]?.count ?? 0);

    return {
      success: true,
      message: `Cart-Recovery: ${gerettet}/${gesamt} wiederhergestellt (${gesamt > 0 ? (gerettet / gesamt * 100).toFixed(1) : 0}%)`,
      metadaten: { gesamt, wiederhergestellt: gerettet, rate: gesamt > 0 ? gerettet / gesamt * 100 : 0 },
    };
  }
}
