/**
 * Sprint 266 — Transaktionsmail-Logik (rein, testbar). Muster aus
 * revenue-os-app: Opt-in-Pflicht, Idempotenz, ehrliche Nicht-Konfiguration.
 *
 * Ehrlichkeits-Regeln:
 *   - Ohne dokumentiertes Opt-in wird keine Mail versendet — auch nicht
 *     "nur eine Erinnerung". Opt-in ist ein Fakt, kein Convenience-Flag.
 *   - Jede Mail hat einen Idempotenz-Schluessel: ein bereits gesendetes
 *     Ereignis wird nicht doppelt versendet, sondern als Duplikat benannt.
 *   - Ohne RESEND_API_KEY heisst es "nicht konfiguriert", nicht "versandt".
 */

export const EMAIL_LIMITS = {
  subject: { min: 5, max: 120 },
  body: { min: 10, max: 8000 },
  maxMailsPerDay: 200,
} as const;

export type EmailEventKind =
  | "receipt"
  | "onboarding_welcome"
  | "quota_warning"
  | "plan_change"
  /** Bestaetigung einer Erstgespraech-Anfrage von der Verkaufsseite. */
  | "intro_request_confirmation"
  /** Interne Benachrichtigung an den Betreiber, damit keine Anfrage liegen bleibt. */
  | "admin_notification"
  /** Nach dem Kauf: Anmeldelink, damit das Konto ohne Passwort entsteht. */
  | "magic_link"
  /** Follow-up auf eine bestehende Anfrage (kein Kaltkontakt). */
  | "outreach";

export type EmailDispatchInput = {
  kind: EmailEventKind;
  to: string;
  subject: string;
  body: string;
  optIn: { documented: boolean; source: string } | null;
  idempotencyKey: string;
};

export type EmailValidation = { valid: true } | { valid: false; reason: string };

/**
 * Freemail-Anbieter. Wird fuer die B2B-Priorisierung gebraucht: eine
 * gmx-Adresse ist kein Beleg gegen einen Betrieb, aber auch kein Beleg dafuer.
 */
const FREE_MAIL_DOMAINS: readonly string[] = [
  "gmail.com",
  "googlemail.com",
  "web.de",
  "gmx.de",
  "gmx.net",
  "gmx.at",
  "t-online.de",
  "freenet.de",
  "posteo.de",
  "mailbox.org",
  "outlook.de",
  "outlook.com",
  "hotmail.de",
  "hotmail.com",
  "live.de",
  "live.com",
  "yahoo.de",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
] as const;

export function isFreeMailDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase().replace(/^@/, "");
  if (!normalized) return true;
  return FREE_MAIL_DOMAINS.includes(normalized);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function validateEmailDispatch(input: EmailDispatchInput): EmailValidation {
  if (!isValidEmail(input.to)) return { valid: false, reason: "Ungültige Empfänger-Adresse." };
  if (!input.optIn?.documented) return { valid: false, reason: "Kein dokumentiertes Opt-in — kein Versand, keine Ausnahme." };
  if (!input.optIn.source?.trim()) return { valid: false, reason: "Opt-in ohne Quelle ist nicht nachvollziehbar — kein Versand." };
  const subject = input.subject.trim();
  if (subject.length < EMAIL_LIMITS.subject.min || subject.length > EMAIL_LIMITS.subject.max) {
    return { valid: false, reason: `Betreff braucht ${EMAIL_LIMITS.subject.min}–${EMAIL_LIMITS.subject.max} Zeichen.` };
  }
  const body = input.body.trim();
  if (body.length < EMAIL_LIMITS.body.min || body.length > EMAIL_LIMITS.body.max) {
    return { valid: false, reason: "Textkörper außerhalb der Grenzen." };
  }
  if (!input.idempotencyKey?.trim()) return { valid: false, reason: "Ohne Idempotenz-Schlüssel kein sicherer Versand." };
  return { valid: true };
}

export type EmailSendOutcome =
  | { status: "sent"; messageId: string }
  | { status: "duplicate" }
  | { status: "rejected"; reason: string };

export function evaluateEmailSend(
  input: EmailDispatchInput,
  alreadySentKeys: ReadonlySet<string>,
): { outcome: EmailSendOutcome; validation: EmailValidation } {
  const validation = validateEmailDispatch(input);
  if (!validation.valid) return { outcome: { status: "rejected", reason: validation.reason }, validation };
  if (alreadySentKeys.has(input.idempotencyKey)) {
    return { outcome: { status: "duplicate" }, validation };
  }
  return { outcome: { status: "sent", messageId: `mail-${input.idempotencyKey.slice(0, 16)}` }, validation };
}

// ---------------------------------------------------------------------------
// Resend-Konfiguration
//
// Zwei Stellen im System fragen die Absenderadresse unter verschiedenen Namen
// ab: der Einrichtungs-Assistent und die Revenue-Connectoren nutzen
// OUTREACH_FROM_ADDRESS, der Versanddienst liest RESEND_FROM_EMAIL. Wer nur
// einen davon setzt, bekam bisher "nicht konfiguriert" zu sehen, obwohl der
// Wert existiert. Diese Funktion liest beide und sagt, woher der Wert kommt.
// ---------------------------------------------------------------------------

export type ResendConfig = {
  apiKey: string | null;
  from: string | null;
  /** Woher die Absenderadresse stammt; null heisst: nirgends gesetzt. */
  fromSource: "RESEND_FROM_EMAIL" | "OUTREACH_FROM_ADDRESS" | null;
  configured: boolean;
  issues: string[];
};

const FROM_ENV_NAMES = ["RESEND_FROM_EMAIL", "OUTREACH_FROM_ADDRESS"] as const;

export function resolveResendConfig(env: Record<string, string | undefined>): ResendConfig {
  const apiKey = env.RESEND_API_KEY?.trim() || null;
  const issues: string[] = [];

  let from: string | null = null;
  let fromSource: ResendConfig["fromSource"] = null;
  for (const name of FROM_ENV_NAMES) {
    const value = env[name]?.trim();
    if (value) {
      from = value;
      fromSource = name;
      break;
    }
  }

  const conflicts = FROM_ENV_NAMES.map((name) => env[name]?.trim()).filter(
    (value): value is string => Boolean(value),
  );
  if (conflicts.length > 1 && new Set(conflicts).size > 1) {
    issues.push(
      `RESEND_FROM_EMAIL und OUTREACH_FROM_ADDRESS unterscheiden sich ("${conflicts[0]}" / "${conflicts[1]}") — es gilt RESEND_FROM_EMAIL.`,
    );
  }

  if (!apiKey) issues.push("RESEND_API_KEY fehlt.");
  else if (!apiKey.startsWith("re_")) issues.push("RESEND_API_KEY sieht nicht wie ein Resend-Schluessel aus (erwartet re_…).");

  if (!from) issues.push("Absenderadresse fehlt (RESEND_FROM_EMAIL oder OUTREACH_FROM_ADDRESS).");
  else if (!isValidEmail(from)) issues.push(`Absenderadresse "${from}" ist keine gueltige E-Mail-Adresse.`);
  else if (/(@resend\.dev|@example\.|@test\.)/i.test(from)) {
    issues.push(
      `Absender "${from}" ist nur fuer Tests geeignet — Resend verlangt eine verifizierte Domain fuer echten Versand.`,
    );
  }

  return {
    apiKey,
    from,
    fromSource,
    configured: issues.length === 0,
    issues,
  };
}
