/**
 * Email Sequence Agent — Automatische E-Mail-Kampagnen
 * 
 * Verarbeitet E-Mail-Sequenzen für Newsletter-Abonnenten.
 * Sendet Willkommens-E-Mails, Blog-Updates und Produkt-Empfehlungen.
 * 
 * Läuft ohne konfigurierten E-Mail-Provider (loggt in dev mode).
 * Sobald EMAIL_PROVIDER + API-Key gesetzt sind, werden echte Mails versendet.
 */
import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { db } from "@workspace/db";
import { leadsTable, emailSequenzenTable, seoContentTable } from "@workspace/db";
import { eq, and, lt, sql, desc } from "drizzle-orm";
import { sendEmail } from "../lib/emailClient";
import { getStripeClient } from "../lib/stripeClient";
import { logger } from "../lib/logger";

const PUBLIC_URL = process.env["PUBLIC_APP_URL"] ?? "http://167.233.196.20:3000";

export class EmailSequenceAgent extends AgentBase {
  constructor() {
    super("E-Mail Sequence Agent", "email_sequence");
  }

  protected beschreibungText(): string {
    return "AUTONOM: Verarbeitet E-Mail-Sequenzen, sendet Willkommens-Mails, Blog-Updates und Produkt-Empfehlungen";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const aktion = String(aufgabe.payload?.["aktion"] ?? "process_sequences");

    switch (aktion) {
      case "process_sequences":
        return this.verarbeiteSequenzen();
      case "send_blog_update":
        return this.sendeBlogUpdate();
      case "send_product_alert":
        return this.sendeProduktAlert();
      default:
        return this.verarbeiteSequenzen();
    }
  }

  // ─── Sequenzen verarbeiten ──────────────────────────────────────────────────
  private async verarbeiteSequenzen(): Promise<AufgabeErgebnis> {
    const aktiveLeads = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.status, "aktiv"))
      .limit(50);

    let verarbeitet = 0;

    for (const lead of aktiveLeads) {
      if (!lead.sequenzId) continue;

      const [sequenz] = await db
        .select()
        .from(emailSequenzenTable)
        .where(eq(emailSequenzenTable.id, lead.sequenzId))
        .limit(1);

      if (!sequenz || !sequenz.aktiv) continue;

      const emails = (sequenz.emails as Array<{ betreff: string; inhalt: string; tagNachAnmeldung: number }>) ?? [];
      if (lead.aktuellerSchritt >= emails.length) continue;

      const schritt = emails[lead.aktuellerSchritt];
      if (!schritt) continue;

      // Prüfen ob genug Zeit vergangen ist
      const anmeldung = lead.createdAt ? new Date(lead.createdAt) : new Date();
      const tageSeitAnmeldung = Math.floor((Date.now() - anmeldung.getTime()) / (1000 * 60 * 60 * 24));

      if (tageSeitAnmeldung < schritt.tagNachAnmeldung) continue;

      // E-Mail personalisieren
      const html = schritt.inhalt
        .replace(/\{\{email\}\}/g, lead.email)
        .replace(/\{\{public_url\}\}/g, PUBLIC_URL)
        .replace(/\{\{unsubscribe\}\}/g, `${PUBLIC_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(lead.email)}`);

      const result = await sendEmail({
        to: lead.email,
        subject: schritt.betreff,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">${html}</div><div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#6b7280;font-size:12px;border-top:1px solid #2a2a3e;margin-top:20px;"><p>Du erhältst diese E-Mail weil du dich bei CyberSarah angemeldet hast.</p><p><a href="{{unsubscribe}}" style="color:#a855f7;">Abmelden</a></p></div>`,
      });

      if (result.success) {
        await db.update(leadsTable)
          .set({
            aktuellerSchritt: lead.aktuellerSchritt + 1,
            letzteEmailAm: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(leadsTable.id, lead.id));
        verarbeitet++;
        logger.info({ email: lead.email, schritt: lead.aktuellerSchritt + 1 }, "📧 Sequence-Schritt gesendet");
      }
    }

    return {
      success: true,
      message: `${verarbeitet} Sequence-E-Mails verarbeitet`,
      metadaten: { verarbeitet, aktiveLeads: aktiveLeads.length },
    };
  }

  // ─── Blog-Update senden ────────────────────────────────────────────────────
  private async sendeBlogUpdate(): Promise<AufgabeErgebnis> {
    const aktiveLeads = await db
      .select({ id: leadsTable.id, email: leadsTable.email })
      .from(leadsTable)
      .where(eq(leadsTable.status, "aktiv"))
      .limit(100);

    if (aktiveLeads.length === 0) return { success: true, message: "Keine aktiven Abonnenten" };

    // Neueste Blog-Artikel abrufen
    const artikel = await db
      .select({ titel: seoContentTable.titel, slug: seoContentTable.slug, metaDescription: seoContentTable.metaDescription })
      .from(seoContentTable)
      .where(eq(seoContentTable.status, "veroeffentlicht"))
      .orderBy(desc(seoContentTable.veroeffentlichtAm))
      .limit(5);

    if (artikel.length === 0) return { success: true, message: "Keine neuen Artikel" };

    const artikelHtml = artikel.map(a =>
      `<li style="margin-bottom:12px;"><a href="${PUBLIC_URL}/blog/${a.slug}" style="color:#a855f7;text-decoration:none;font-weight:500;">${a.titel}</a><br><span style="color:#6b7280;font-size:13px;">${a.metaDescription ?? ""}</span></li>`
    ).join("\n");

    const html = `<h2>📰 Neue Blog-Artikel</h2>
<p>Hier sind die neuesten Artikel von CyberSarah:</p>
<ul>${artikelHtml}</ul>
<p style="margin-top:20px;"><a href="${PUBLIC_URL}" style="display:inline-block;background:linear-gradient(90deg,#a855f7,#06b6d4);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Alle Produkte ansehen →</a></p>`;

    let gesendet = 0;
    for (const lead of aktiveLeads) {
      const result = await sendEmail({
        to: lead.email,
        subject: `📰 Neue Artikel von CyberSarah (${artikel.length} Neuigkeiten)`,
        html: html.replace(/\{\{unsubscribe\}\}/g, `${PUBLIC_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(lead.email)}`),
      });
      if (result.success) gesendet++;
    }

    return {
      success: true,
      message: `${gesendet}/${aktiveLeads.length} Blog-Updates gesendet`,
      metadaten: { gesendet, gesamt: aktiveLeads.length, artikel: artikel.length },
    };
  }

  // ─── Produkt-Alert senden ──────────────────────────────────────────────────
  private async sendeProduktAlert(): Promise<AufgabeErgebnis> {
    const aktiveLeads = await db
      .select({ id: leadsTable.id, email: leadsTable.email })
      .from(leadsTable)
      .where(eq(leadsTable.status, "aktiv"))
      .limit(100);

    if (aktiveLeads.length === 0) return { success: true, message: "Keine Abonnenten" };

    const stripe = getStripeClient();
    if (!stripe) return { success: false, message: "Kein Stripe-Client" };

    const products = await stripe.products.list({ limit: 5, active: true });
    const prices = await stripe.prices.list({ limit: 10, active: true });

    const produktHtml = products.data.slice(0, 3).map(p => {
      const price = prices.data.find(pr => pr.product === p.id);
      const preis = price ? `€${(price.unit_amount ?? 0) / 100}` : "Preis auf Anfrage";
      return `<div style="background:#111118;border:1px solid #2a2a3e;border-radius:12px;padding:16px;margin-bottom:12px;">
        <h3 style="color:#f0f0f0;margin:0 0 8px;">${p.name}</h3>
        <div style="color:#a855f7;font-size:20px;font-weight:700;margin-bottom:8px;">${preis}</div>
        <a href="${PUBLIC_URL}/produkte" style="display:inline-block;background:linear-gradient(90deg,#a855f7,#06b6d4);color:#fff;padding:8px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Jetzt entdecken →</a>
      </div>`;
    }).join("\n");

    const html = `<h2>🔥 Aktuelle Angebote</h2>
<p>Hier sind unsere aktuellen KI-Produkte und Angebote:</p>
${produktHtml}
<p style="margin-top:20px;"><a href="${PUBLIC_URL}/produkte" style="color:#a855f7;">Alle Produkte anzeigen →</a></p>`;

    let gesendet = 0;
    for (const lead of aktiveLeads) {
      const result = await sendEmail({
        to: lead.email,
        subject: "🔥 Neue KI-Produkte & Angebote",
        html: html.replace(/\{\{unsubscribe\}\}/g, `${PUBLIC_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(lead.email)}`),
      });
      if (result.success) gesendet++;
    }

    return {
      success: true,
      message: `${gesendet} Produkt-Alerts gesendet`,
      metadaten: { gesendet, gesamt: aktiveLeads.length },
    };
  }
}
