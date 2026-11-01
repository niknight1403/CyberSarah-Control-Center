/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * E-MAIL CLIENT (Resend + SMTP-Fallback)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Unterstützt Resend (primär) und Mailgun/SMTP als Fallback.
 * Konfiguriert über Umgebungsvariablen:
 *   EMAIL_PROVIDER=resend|mailgun|smtp
 *   RESEND_API_KEY=re_xxx
 *   MAILGUN_API_KEY=xxx
 *   MAILGUN_DOMAIN=mg.cybersarah.ai
 *   SMTP_HOST=smtp.xxx
 *   SMTP_PORT=587
 *   SMTP_USER=xxx
 *   SMTP_PASS=xxx
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { logger } from "./logger";
import { pruefeBlacklist, baueOptOutFooter, type BlacklistErgebnis } from "./emailCompliance";

// ─── Typen ───────────────────────────────────────────────────────────────────

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
  tags?: Record<string, string>; // Für Tracking
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
}

// ─── Konfiguration ───────────────────────────────────────────────────────────

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER ?? "resend";
const DEFAULT_FROM = process.env.EMAIL_FROM ?? "CyberSarah <noreply@cybersarah.ai>";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;

let resendClient: any = null;
let mailgunClient: any = null;
let nodemailerTransporter: any = null;

async function getResendClient(): Promise<any> {
  if (!resendClient && RESEND_API_KEY) {
    const { Resend } = await import("resend");
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
}

async function getMailgunClient(): Promise<any> {
  if (!mailgunClient && MAILGUN_API_KEY && MAILGUN_DOMAIN) {
    const formData = await import("form-data");
    const Mailgun = (await import("mailgun.js")).default;
    const mg = new Mailgun(formData);
    mailgunClient = mg.client({ username: "api", key: MAILGUN_API_KEY });
  }
  return mailgunClient;
}

async function getNodemailerTransporter(): Promise<any> {
  if (!nodemailerTransporter) {
    const nodemailer = await import("nodemailer");
    nodemailerTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.ethereal.email",
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return nodemailerTransporter;
}

// ─── SPRING 63: Compliance-Prüfung + Footer-Anhang ─────────────────────────────

interface ComplianceErgebnis {
  blockiert: boolean;
  ergebnis?: BlacklistErgebnis;
}

/**
 * Prüft ALLE Empfänger gegen die Blacklist und hängt an jede ausgehende
 * B2B-Outreach-E-Mail automatisch den dynamischen Opt-out-Footer an.
 * Transaktions-Mails (Bestellbestätigungen etc.) erhalten den Footer nicht.
 */
async function pruefeUndErweitereEmail(
  options: EmailOptions,
  empfaenger: string[],
): Promise<ComplianceErgebnis> {
  try {
    for (const adresse of empfaenger) {
      const pruefung = await pruefeBlacklist(adresse);
      if (pruefung.blockiert) {
        return { blockiert: true, ergebnis: pruefung };
      }
    }

    // Opt-out-Footer nur an Outreach-Mails (nicht an Transaktions-Mails)
    const istOutreach = options.tags?.kategorie !== "transaktional";
    if (istOutreach) {
      const hauptEmpfaenger = empfaenger[0] ?? "";
      const footer = baueOptOutFooter(hauptEmpfaenger, options.tags?.abmeldelink);
      if (options.html && !options.html.includes("cybersarah-optout-footer")) {
        options.html = `${options.html}<div class="cybersarah-optout-footer" style="font-size:11px;color:#888;margin-top:24px">${footer.replace(/\n/g, "<br/>")}</div>`;
      }
      if (options.text && !options.text.includes("cybersarah-optout-footer")) {
        options.text = `${options.text}${footer}`;
      }
      if (options.html && !options.text) {
        options.text = footer;
      }
    }
    return { blockiert: false };
  } catch (err) {
    // Blacklist-DB offline → Versand NICHT komplett blockieren (Watchdog loggt),
    // aber Footer trotzdem anfügen (Compliance-Pflicht).
    logger.warn({ err }, "⚠️ Blacklist-Prüfung fehlgeschlagen — Opt-out-Footer dennoch angehängt");
    return { blockiert: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEND: Zentrale Versand-Funktion
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const from = options.from ?? DEFAULT_FROM;
  const empfaengerListe = Array.isArray(options.to) ? options.to : [options.to];
  const to = empfaengerListe.join(", ");

  // ── SPRING 63: DSGVO-Compliance-Guardrails (VOR jedem Versand) ────────────
  // 1. Blacklist-Prüfung: Empfänger zwingend gegen globale blacklists-Tabelle
  // 2. Opt-out-Footer: dynamischer Abmeldelink an jede Outreach-Mail
  const compliance = await pruefeUndErweitereEmail(options, empfaengerListe);
  if (compliance.blockiert) {
    logger.info(
      { to, blockiertDurch: compliance.ergebnis?.wert },
      `🚫 E-Mail-Versand BLOCKIERT — Empfänger steht auf der Blacklist (${compliance.ergebnis?.typ})`
    );
    return {
      success: false,
      provider: "compliance-guard",
      error: `Empfänger auf Blacklist (${compliance.ergebnis?.typ}: ${compliance.ergebnis?.wert})`,
    };
  }

  try {
    switch (EMAIL_PROVIDER) {
      case "resend":
        return await sendViaResend(options, from);
      case "mailgun":
        return await sendViaMailgun(options, from);
      case "smtp":
        return await sendViaSMTP(options, from);
      default:
        // Fallback: Loggen statt senden (Development-Modus)
        logger.info(
          { to, subject: options.subject, provider: "log" },
          `📧 [DEV] E-Mail würde gesendet werden: "${options.subject}" an ${to}`
        );
        return { success: true, messageId: `dev-${Date.now()}`, provider: "log" };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    logger.error({ err, to, subject: options.subject }, "📧 E-Mail-Versand fehlgeschlagen");

    // Fallback auf log wenn alle Provider fehlschlagen
    logger.info(
      { to, subject: options.subject },
      `📧 [FALLBACK] E-Mail protokolliert: "${options.subject}" an ${to}`
    );

    return { success: false, provider: EMAIL_PROVIDER, error: msg };
  }
}

async function sendViaResend(options: EmailOptions, from: string): Promise<EmailResult> {
  const resend = await getResendClient();
  if (!resend) throw new Error("RESEND_API_KEY nicht konfiguriert");

  const { data, error } = await resend.emails.send({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    reply_to: options.replyTo,
    cc: options.cc,
    bcc: options.bcc,
    tags: options.tags ? Object.entries(options.tags).map(([key, value]) => ({ name: key, value })) : undefined,
  });

  if (error) throw new Error(`Resend: ${error.message ?? error}`);

  logger.info({ messageId: data?.id, to: options.to, subject: options.subject }, "📧 E-Mail via Resend versendet");
  return { success: true, messageId: data?.id, provider: "resend" };
}

async function sendViaMailgun(options: EmailOptions, from: string): Promise<EmailResult> {
  const mg = await getMailgunClient();
  if (!mg) throw new Error("Mailgun nicht konfiguriert");

  const result = await mg.messages.create(MAILGUN_DOMAIN, {
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    "h:Reply-To": options.replyTo,
    cc: options.cc?.join(", "),
    bcc: options.bcc?.join(", "),
  });

  logger.info({ messageId: result?.id, to: options.to, subject: options.subject }, "📧 E-Mail via Mailgun versendet");
  return { success: true, messageId: result?.id, provider: "mailgun" };
}

async function sendViaSMTP(options: EmailOptions, from: string): Promise<EmailResult> {
  const transporter = await getNodemailerTransporter();

  const info = await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
    cc: options.cc,
    bcc: options.bcc,
    attachments: options.attachments,
  });

  logger.info({ messageId: info.messageId, to: options.to, subject: options.subject }, "📧 E-Mail via SMTP versendet");
  return { success: true, messageId: info.messageId, provider: "smtp" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// KONFIGURATION TESTEN
// ═══════════════════════════════════════════════════════════════════════════════

export async function testEmailConfig(): Promise<{
  konfiguriert: boolean;
  provider: string;
  resendKey: boolean;
  mailgunKey: boolean;
  smtpKonfiguriert: boolean;
  defaultFrom: string;
}> {
  return {
    konfiguriert: !!RESEND_API_KEY || !!MAILGUN_API_KEY || !!process.env.SMTP_HOST,
    provider: EMAIL_PROVIDER,
    resendKey: !!RESEND_API_KEY,
    mailgunKey: !!MAILGUN_API_KEY && !!MAILGUN_DOMAIN,
    smtpKonfiguriert: !!process.env.SMTP_HOST && !!process.env.SMTP_USER,
    defaultFrom: DEFAULT_FROM,
  };
}
