/**
 * Transaktions-Mails des Funnels als reine Textbausteine.
 *
 * Warum hier und nicht im Versanddienst: Der Wortlaut ist der Teil, den man
 * pruefen und testen kann. Der Versand (Resend, Idempotenz, Tageslimit) liegt in
 * server/email-service.ts. Diese Datei entscheidet nichts ueber Zustellung, sie
 * baut nur Text — deshalb ist sie ohne Netzwerk und ohne Uhr testbar.
 *
 * Grundsaetze:
 * - Jede Mail sagt, warum sie kommt und was als naechstes passiert.
 * - Keine Werbung, kein Newsletter-Hinweis, keine Erfolgsversprechen.
 * - Kein erfundener Absender, kein erfundener Termin: nur der genannte
 *   Wunschzeitraum.
 */
import type { EmailDispatchInput, EmailEventKind } from "./email-logic";

export type EmailDraft = {
  kind: EmailEventKind;
  subject: string;
  body: string;
  idempotencyKey: string;
};

/** Quelle, die als Opt-in-Nachweis in der Mail mitlaeuft. */
export const INTRO_REQUEST_OPT_IN_SOURCE = "https://app.cybersarah-ki.com/ai-influenza#erstgespraech";

function clean(value: string | null | undefined, fallback = ""): string {
  return (value ?? "").replace(/\s+/g, " ").trim() || fallback;
}

/** Administrator-Adresse fuer interne Hinweise; bewusst ohne Rate-Fallback. */
export function resolveAdminNotifyAddress(env: Record<string, string | undefined>): string | null {
  const candidates = [env.AI_INFLUENZA_NOTIFY_EMAIL, env.ADMIN_NOTIFY_EMAIL, env.ADMIN_EMAIL];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && value.includes("@")) return value;
  }
  return null;
}

/** Bestaetigung an die anfragende Person. */
export function buildIntroRequestConfirmation(input: {
  name: string;
  email: string;
  packageLabel: string;
  preferredWindowLabel: string;
  goal?: string | null;
  receivedAt: string;
  requestId: string;
}): { draft: EmailDraft; to: string } {
  const name = clean(input.name, "Hallo");
  const goal = clean(input.goal ?? "");
  const body = [
    `Hallo ${name},`,
    "",
    "deine Anfrage für ein Erstgespräch beim AI Influenza Team ist angekommen. Diese Mail bestätigt nur den Eingang, nicht einen Termin.",
    "",
    "Was du angegeben hast:",
    `- Paket: ${clean(input.packageLabel, "noch offen")}`,
    `- Wunschzeitraum: ${clean(input.preferredWindowLabel, "flexibel")}`,
    ...(goal ? [`- Anliegen: ${goal}`] : []),
    "",
    "So geht es weiter: Wir melden uns per E-Mail an diese Adresse, um einen Termin abzustimmen. Es gibt keinen automatischen Werbeversand, keine Weitergabe an Dritte und keine Zahlung durch diese Anfrage.",
    "",
    "Wenn du die Anfrage nicht gestellt hast, antworte kurz auf diese Mail. Dann löschen wir den Eintrag.",
    "",
    `Referenz: ${input.requestId}`,
    `Eingegangen: ${input.receivedAt}`,
    "",
    "CyberSarah · AI Influenza Team",
  ].join("\n");

  return {
    to: input.email,
    draft: {
      kind: "intro_request_confirmation",
      subject: "Deine Anfrage für ein Erstgespräch ist angekommen",
      body,
      // Eine Bestaetigung je Anfrage, nicht je Tag: der Nutzer darf zwei
      // Anfragen an zwei Tagen stellen und beide bestaetigt bekommen.
      idempotencyKey: `intro-request-confirm:${input.requestId}`,
    },
  };
}

/** Interner Hinweis an den Betreiber, damit keine Anfrage liegen bleibt. */
export function buildIntroRequestAdminNotice(input: {
  requestId: string;
  name: string;
  email: string;
  company: string;
  domain?: string | null;
  packageLabel: string;
  preferredWindowLabel: string;
  goal?: string | null;
  leadScore: number | null;
  leadTier: string | null;
  receivedAt: string;
  adminUrl: string;
}): EmailDraft {
  const body = [
    "Neue Erstgespräch-Anfrage über die Verkaufsseite.",
    "",
    `Eingegangen: ${input.receivedAt}`,
    `Name: ${clean(input.name)}`,
    `E-Mail: ${clean(input.email)}`,
    `Unternehmen: ${clean(input.company, "nicht angegeben")}`,
    `Domain: ${clean(input.domain ?? "", "nicht angegeben")}`,
    `Paketwunsch: ${clean(input.packageLabel, "noch offen")}`,
    `Wunschzeitraum: ${clean(input.preferredWindowLabel, "flexibel")}`,
    `Lead-Score: ${input.leadScore ?? "—"}${input.leadTier ? ` (${input.leadTier})` : ""}`,
    ...(clean(input.goal ?? "") ? ["", `Anliegen: ${clean(input.goal)}`] : []),
    "",
    "Es wurde nichts automatisch versendet oder gebucht. Die Antwort schreibt ein Mensch.",
    `Im Dashboard als erledigt markieren: ${input.adminUrl}`,
    "",
    `Referenz: ${input.requestId}`,
  ].join("\n");

  return {
    kind: "admin_notification",
    subject: `Erstgespräch-Anfrage: ${clean(input.company, input.name)}`,
    body,
    idempotencyKey: `intro-request-admin:${input.requestId}`,
  };
}

/** Anmeldelink nach dem Kauf: Konto entsteht ohne Passwort. */
export function buildMagicLinkEmail(input: {
  magicUrl: string;
  packageLabel: string;
  orderId: string;
  expiresAt: string;
}): EmailDraft {
  const body = [
    "Danke für deine Zahlung.",
    "",
    `Paket: ${clean(input.packageLabel, "AI Influenza Team")}`,
    `Auftrag: ${input.orderId}`,
    "",
    "Mit dem folgenden Link öffnest du dein Konto. Ein Passwort brauchst du nicht:",
    input.magicUrl,
    "",
    `Der Link gilt bis ${input.expiresAt}. Danach forderst du in der App einfach einen neuen an.`,
    "",
    "Rechnung und Kündigung findest du anschließend im Kundenportal in deinem Konto.",
    "",
    "CyberSarah · AI Influenza Team",
  ].join("\n");

  return {
    kind: "magic_link",
    subject: "Dein Zugang zum AI Influenza Team",
    body,
    idempotencyKey: `magic-link:${input.orderId}`,
  };
}

/**
 * Baut den vollstaendigen Versandauftrag. Das Opt-in ist bei allen drei Mails
 * belegt: Anfrage (Einwilligung im Formular), Kauf (Vertragserfuellung mit
 * Absender) oder interne Betreiber-Mail (kein Empfaenger-Opt-in noetig, weil
 * Empfaenger der Betreiber selbst ist — dokumentiert ueber `source`).
 */
export function toDispatchInput(
  draft: EmailDraft,
  to: string,
  optIn: { documented: boolean; source: string },
): EmailDispatchInput {
  return {
    kind: draft.kind,
    to,
    subject: draft.subject,
    body: draft.body,
    optIn,
    idempotencyKey: draft.idempotencyKey,
  };
}
