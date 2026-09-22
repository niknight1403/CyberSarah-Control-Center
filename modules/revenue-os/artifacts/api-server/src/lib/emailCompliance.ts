/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * EMAIL COMPLIANCE — DSGVO/§7 UWG Outreach-Guardrails
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Blacklist-Prüfung: Jede ausgehende B2B-Outreach-E-Mail wird VOR dem Versand
 *    zwingend gegen die globale `blacklists`-Tabelle geprüft (E-Mail + Domain).
 * 2. Opt-out-Footer: An jede abgehende Outreach-Mail wird automatisch ein
 *    dynamischer, unaufdringlicher Abmeldelink angehängt (DSGVO Art. 21 / §7 UWG).
 * 3. Inbound Classification: Eingehende Antworten werden auf Opt-out-Schlüsselwörter
 *    geprüft ("Stopp", "Unsubscribe", "Kein Interesse", "Austragen", ...) — bei
 *    Treffer wird die E-Mail/Domain SOFORT ohne menschlichen Zwischenschritt zur
 *    Blacklist hinzugefügt und laufende Sequenzen abgebrochen.
 */
import { db } from "@workspace/db";
import { blacklistsTable, leadsTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";
import { logger } from "./logger";

const PUBLIC_URL = process.env["PUBLIC_APP_URL"] ?? "https://cybersarah.app";

// ─── Blacklist-Prüfung (PRE-SEND) ───────────────────────────────────────────────

export interface BlacklistErgebnis {
  blockiert: boolean;
  wert?: string;
  typ?: "email" | "domain";
}

/**
 * Prüft eine Empfänger-E-Mail gegen die globale Blacklist (E-Mail-EXAKT + Domain).
 * Wird von sendEmail() zwingend vor jedem Versand aufgerufen.
 */
export async function pruefeBlacklist(email: string): Promise<BlacklistErgebnis> {
  const bereinigt = email.trim().toLowerCase();
  if (!bereinigt.includes("@")) return { blockiert: false };

  const domain = bereinigt.split("@")[1] ?? "";

  const treffer = await db
    .select({ typ: blacklistsTable.typ, wert: blacklistsTable.wert })
    .from(blacklistsTable)
    .where(
      or(
        and(eq(blacklistsTable.typ, "email"), eq(blacklistsTable.wert, bereinigt)),
        and(eq(blacklistsTable.typ, "domain"), eq(blacklistsTable.wert, domain)),
      ),
    )
    .limit(1);

  if (treffer.length > 0) {
    return { blockiert: true, wert: treffer[0]!.wert, typ: treffer[0]!.typ as "email" | "domain" };
  }
  return { blockiert: false };
}

// ─── Blacklist-Eintrag (idempotent) ────────────────────────────────────────────

export async function fuegeZurBlacklistHinzu(
  emailOderDomain: string,
  quelle: "inbound_reply" | "manuell" | "spam_bounce" = "inbound_reply",
  grund?: string,
  herkunftsNachrichtId?: string,
): Promise<void> {
  const wert = emailOderDomain.trim().toLowerCase();

  // Ganze Domain? (z. B. "firma.de" oder "@firma.de")
  const istDomain = !wert.includes("@") || wert.startsWith("@");
  const typ: "email" | "domain" = istDomain ? "domain" : "email";
  const normalisiert = istDomain ? wert.replace(/^@/, "") : wert;

  try {
    await db
      .insert(blacklistsTable)
      .values({
        typ,
        wert: normalisiert,
        quelle,
        grund: grund ?? null,
        herkunftsNachrichtId: herkunftsNachrichtId ?? null,
      })
      .onConflictDoNothing({ target: [blacklistsTable.typ, blacklistsTable.wert] });

    logger.info(
      { typ, wert: normalisiert, quelle },
      `🚫 Blacklist-Eintrag ${typ === "domain" ? "(Domain) " : ""}: ${normalisiert}`
    );
  } catch (err) {
    logger.error({ err, wert: normalisiert }, "❌ Blacklist-Eintrag fehlgeschlagen");
  }
}

// ─── Opt-out-Footer (POST, vor jedem B2B-Outreach-Versand) ─────────────────────

/**
 * Dynamischer, unaufdringlicher Opt-out-Footer.
 * Wird nur einmal angehängt (Idempotenz-Marker in der Signatur).
 */
export function baueOptOutFooter(empfaengerEmail: string, abmeldelink?: string): string {
  const link =
    abmeldelink ??
    `${PUBLIC_URL}/api/email/abmelden?email=${encodeURIComponent(empfaengerEmail)}`;

  return `


———
Du erhältst diese E-Mail, weil du dich für CyberSarah-Content interessiert hast.
Kein Interesse mehr? Trage dich hier mit einem Klick aus: ${link}
oder antworte einfach mit "Stopp".`;
}

// ─── Inbound Classification (Opt-out-Erkennung) ────────────────────────────────

const OPT_OUT_MUSTER = [
  /\bstopp\b/i,
  /\bunsubscribe\b/i,
  /nicht\s+(mehr\s+)?interessiert/i,
  /\bkein\s+interesse\b/i,
  /\b austragen\b/i,
  /\babmelden\b/i,
  /\bopt[-\s]?out\b/i,
  /\bremove\s+me\b/i,
  /\bnicht\s+kontaktieren\b/i,
  /\blist\s+me\s+out\b/i,
];

export interface InboundKlassifizierung {
  istOptOut: boolean;
  email: string;
  betroffeneLeads: number;
}

/**
 * Verarbeitet eine eingehende E-Mail-Antwort:
 * - Erkennt Opt-out-Schlüsselwörter ("Stopp", "Unsubscribe", "Kein Interesse",
 *   "Austragen", ...) im Betreff/Text
 * - Fügt die E-Mail SOFORT ohne menschliche Zwischenschritte zur Blacklist hinzu
 * - Bricht alle laufenden E-Mail-Sequenzen des Leads ab (status → "abgemeldet")
 */
export async function klassifiziereEingangsAntwort(
  fromEmail: string,
  text: string,
  betreff = "",
  messageId?: string,
): Promise<InboundKlassifizierung> {
  const email = fromEmail.trim().toLowerCase();
  const inhaltsText = `${betreff}\n${text}`;
  const istOptOut = OPT_OUT_MUSTER.some((muster) => muster.test(inhaltsText));

  if (!istOptOut) {
    return { istOptOut: false, email, betroffeneLeads: 0 };
  }

  // 1. Sofortige Blacklist-Aufnahme (ohne menschlichen Zwischenschritt)
  await fuegeZurBlacklistHinzu(email, "inbound_reply", "Opt-out via eingehender Antwort erkannt", messageId);

  // 2. Laufende Sequenzen abbrechen (Lead-Status → abgemeldet)
  let betroffeneLeads = 0;
  try {
    const abgebrochen = await db
      .update(leadsTable)
      .set({ status: "abgemeldet", updatedAt: new Date() })
      .where(and(eq(leadsTable.email, email), eq(leadsTable.status, "aktiv")))
      .returning({ id: leadsTable.id });
    betroffeneLeads = abgebrochen.length;
  } catch (err) {
    logger.error({ err, email }, "❌ Lead-Stopp fehlgeschlagen");
  }

  logger.info(
    { email, betroffeneLeads },
    `🚫 OPT-OUT erkannt — E-Mail blacklisted und ${betroffeneLeads} laufende Sequenz(en) abgebrochen`
  );

  return { istOptOut: true, email, betroffeneLeads };
}
