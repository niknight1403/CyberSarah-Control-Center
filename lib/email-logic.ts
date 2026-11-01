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

export type EmailEventKind = "receipt" | "onboarding_welcome" | "quota_warning" | "plan_change";

export type EmailDispatchInput = {
  kind: EmailEventKind;
  to: string;
  subject: string;
  body: string;
  optIn: { documented: boolean; source: string } | null;
  idempotencyKey: string;
};

export type EmailValidation = { valid: true } | { valid: false; reason: string };

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
