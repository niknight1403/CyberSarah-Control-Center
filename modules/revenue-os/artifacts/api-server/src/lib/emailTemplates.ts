/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * E-MAIL TEMPLATES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * HTML-Templates für:
 *  - Bestellbestätigung (nach erfolgreicher Zahlung)
 *  - Zahlungseingang (bei manuellen Überweisungen)
 *  - Willkommens-E-Mail (bei Lead-Anmeldung)
 *  - Lead-Benachrichtigung (Admin)
 *  - Newsletter-Basis
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { logger } from "./logger";

// ─── Basis-HTML-Wrapper ───────────────────────────────────────────────────────

function baseHtml(inhalt: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f4f4f5; }
  .container { max-width: 600px; margin: 0 auto; padding: 24px; }
  .card { background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .header { text-align: center; padding-bottom: 24px; border-bottom: 1px solid #e4e4e7; margin-bottom: 24px; }
  .header h1 { margin: 0; font-size: 24px; color: #18181b; }
  .header p { margin: 4px 0 0; color: #71717a; font-size: 14px; }
  .footer { text-align: center; padding-top: 24px; border-top: 1px solid #e4e4e7; margin-top: 24px; font-size: 12px; color: #a1a1aa; }
  .footer a { color: #71717a; text-decoration: underline; }
  .button { display: inline-block; padding: 12px 24px; background: #7c3aed; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0; }
  .button:hover { background: #6d28d9; }
  .detail { background: #f4f4f5; border-radius: 8px; padding: 16px; margin: 16px 0; }
  .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e4e4e7; }
  .detail-row:last-child { border-bottom: none; }
  .label { color: #71717a; font-size: 14px; }
  .value { font-weight: 600; font-size: 14px; }
  .price { font-size: 28px; font-weight: 700; color: #059669; text-align: center; padding: 16px 0; }
</style></head><body>
<div class="container"><div class="card">${inhalt}</div></div>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BESTELLBESTÄTIGUNG (nach erfolgreicher Checkout-Session)
// ═══════════════════════════════════════════════════════════════════════════════

export function orderConfirmation(params: {
  kundenName?: string;
  produktName: string;
  betrag: number;
  waehrung: string;
  transaktionsId?: string;
  downloadLink?: string;
  marke: string;
}): { subject: string; html: string; text: string } {
  const betragFormatiert = `${params.betrag.toFixed(2)} ${params.waehrung}`;
  const subject = `✅ Bestellbestätigung — ${params.produktName}`;

  const html = baseHtml(`
    <div class="header">
      <h1>🎉 Vielen Dank für deine Bestellung!</h1>
      <p>Deine Bestellung bei ${params.marke} wurde erfolgreich verarbeitet.</p>
    </div>
    <div class="price">${betragFormatiert}</div>
    <div class="detail">
      <div class="detail-row"><span class="label">Produkt</span><span class="value">${params.produktName}</span></div>
      <div class="detail-row"><span class="label">Betrag</span><span class="value">${betragFormatiert}</span></div>
      ${params.transaktionsId ? `<div class="detail-row"><span class="label">Transaktions-ID</span><span class="value" style="font-size:12px">${params.transaktionsId}</span></div>` : ""}
    </div>
    ${params.downloadLink ? `<div style="text-align:center"><a href="${params.downloadLink}" class="button">📥 Produkt herunterladen</a></div>` : ""}
    <p style="text-align:center;color:#71717a;font-size:14px;">Du erhältst in Kürze eine E-Mail mit deinen Zugangsdaten.<br>Bei Fragen antworte einfach auf diese E-Mail.</p>
    <div class="footer">
      <p>${params.marke} — Dein KI-Business-System</p>
    </div>
  `);

  return {
    subject,
    html,
    text: `Bestellung bestätigt: ${params.produktName} (${betragFormatiert})\n\nVielen Dank für deine Bestellung bei ${params.marke}.\n\nTransaktions-ID: ${params.transaktionsId ?? "–"}\n\nDein Team von ${params.marke}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ZAHLUNGSEINGANG (bei manuellen Zahlungen / Rechnungen)
// ═══════════════════════════════════════════════════════════════════════════════

export function paymentReceived(params: {
  kundenName?: string;
  betrag: number;
  waehrung: string;
  rechnungsNummer?: string;
  marke: string;
}): { subject: string; html: string; text: string } {
  const betragFormatiert = `${params.betrag.toFixed(2)} ${params.waehrung}`;
  const subject = `💰 Zahlung erhalten — ${betragFormatiert}`;

  const html = baseHtml(`
    <div class="header">
      <h1>💰 Zahlung erhalten</h1>
      <p>Wir haben deine Zahlung erfolgreich verbucht.</p>
    </div>
    <div class="price">${betragFormatiert}</div>
    <div class="detail">
      ${params.rechnungsNummer ? `<div class="detail-row"><span class="label">Rechnungs-Nr.</span><span class="value">${params.rechnungsNummer}</span></div>` : ""}
      <div class="detail-row"><span class="label">Betrag</span><span class="value">${betragFormatiert}</span></div>
      <div class="detail-row"><span class="label">Datum</span><span class="value">${new Date().toLocaleDateString("de-DE")}</span></div>
    </div>
    <div class="footer">
      <p>${params.marke} — Dein KI-Business-System</p>
    </div>
  `);

  return {
    subject,
    html,
    text: `Zahlung erhalten: ${betragFormatiert}\n\nVielen Dank! Deine Zahlung wurde verbucht.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// WILLKOMMENS-E-MAIL (nach Lead-Anmeldung)
// ═══════════════════════════════════════════════════════════════════════════════

export function welcomeEmail(params: {
  kundenName?: string;
  marke: string;
  leadMagnet?: string;
  downloadLink?: string;
}): { subject: string; html: string; text: string } {
  const subject = `🚀 Willkommen bei ${params.marke}!`;

  const html = baseHtml(`
    <div class="header">
      <h1>🚀 Willkommen bei ${params.marke}!</h1>
      <p>Freut mich, dass du dabei bist!</p>
    </div>
    ${params.leadMagnet ? `<p style="text-align:center;font-size:16px;">Dein Gratis-Guide <strong>"${params.leadMagnet}"</strong> ist bereit:</p>` : ""}
    ${params.downloadLink ? `<div style="text-align:center"><a href="${params.downloadLink}" class="button">📥 Jetzt herunterladen</a></div>` : ""}
    <p style="color:#71717a;font-size:14px;">In den nächsten Tagen erhältst du weitere wertvolle Tipps und Strategien per E-Mail.</p>
    <div class="footer">
      <p>${params.marke} · <a href="%UNSUBSCRIBE_LINK%">Abbestellen</a></p>
    </div>
  `);

  return {
    subject,
    html,
    text: `Willkommen bei ${params.marke}!\n\nDein Guide "${params.leadMagnet ?? ""}" ist bereit.\n\nDownload: ${params.downloadLink ?? "–"}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// E-MAIL SEQUENZ-TEMPLATE (für Nurture-Sequenzen)
// ═══════════════════════════════════════════════════════════════════════════════

export function nurtureEmail(params: {
  marke: string;
  betreff: string;
  inhalt: string;
  ctaText?: string;
  ctaLink?: string;
  schritt: number;
  gesamt: number;
}): { html: string; text: string } {
  const html = baseHtml(`
    <div class="header">
      <h1>${params.betreff}</h1>
      <p>${params.marke} · Schritt ${params.schritt}/${params.gesamt}</p>
    </div>
    <div style="line-height:1.7;font-size:15px;color:#18181b;">
      ${params.inhalt.replace(/\n/g, "<br>")}
    </div>
    ${params.ctaLink ? `<div style="text-align:center"><a href="${params.ctaLink}" class="button">${params.ctaText ?? "Jetzt ansehen"}</a></div>` : ""}
    <div class="footer">
      <p>Du erhältst diese E-Mail weil du dich bei ${params.marke} angemeldet hast.</p>
      <p><a href="%UNSUBSCRIBE_LINK%">Abbestellen</a></p>
    </div>
  `);

  return { html, text: params.inhalt };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BESTELL-BENACHRICHTIGUNG (Admin — bei neuer Bestellung)
// ═══════════════════════════════════════════════════════════════════════════════

export function adminOrderNotification(params: {
  kundenEmail: string;
  kundenName?: string;
  produktName: string;
  betrag: number;
  waehrung: string;
  marke: string;
}): { subject: string; html: string; text: string } {
  const betragFormatiert = `${params.betrag.toFixed(2)} ${params.waehrung}`;
  const subject = `🛒 Neue Bestellung: ${params.produktName} — ${betragFormatiert}`;

  const html = baseHtml(`
    <div class="header">
      <h1>🛒 Neue Bestellung eingegangen</h1>
      <p>${params.marke} hat eine neue Bestellung erhalten</p>
    </div>
    <div class="detail">
      <div class="detail-row"><span class="label">Produkt</span><span class="value">${params.produktName}</span></div>
      <div class="detail-row"><span class="label">Betrag</span><span class="value">${betragFormatiert}</span></div>
      <div class="detail-row"><span class="label">Kunde</span><span class="value">${params.kundenName ?? "Unbekannt"}</span></div>
      <div class="detail-row"><span class="label">E-Mail</span><span class="value">${params.kundenEmail}</span></div>
    </div>
  `);

  return { subject, html, text: `Neue Bestellung: ${params.produktName} (${betragFormatiert}) von ${params.kundenEmail}` };
}
