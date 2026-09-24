/**
 * Sprint 334 — E-Mail-Integration v2: reine, deterministische Logik fuer
 * Anhaenge und Vorlagen-Verwaltung.
 *
 * Datenfluss:
 *   Anhaenge werden vor dem Versand geprueft (Groesse, Typ, Anzahl) und
 *   Vorlagen werden versioniert gerendert — Platzhalter ungebunden
 *   bleiben sichtbar statt still zu verschwinden.
 *
 * Ehrlichkeits-Grenze: Unbekannte Platzhalter werden NICHT entfernt,
 *   sondern als [unbekannt: name] belassen — ein fehlender Wert ist
 *   sichtbar, kein Rate-Text. Uebergroesse Anhaenge blockieren ehrlich.
 */

export const EMAIL_ATTACHMENT_LIMITS = {
  maxCount: 10,
  maxBytesPerFile: 25 * 1024 * 1024,
  maxBytesTotal: 50 * 1024 * 1024,
  allowedMimeTypes: [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "text/plain",
    "text/csv",
    "application/json",
  ],
} as const;

export type EmailAttachment = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

export type AttachmentCheckIssue =
  | "zu viele anhaenge"
  | "datei zu gross"
  | "gesamt zu gross"
  | "typ nicht erlaubt";

/** Anhang-Satz pruefen; jede Abweichung wird beim Namen genannt. */
export function validateAttachments(attachments: EmailAttachment[]): {
  ok: boolean;
  issues: Array<{ file: string; issue: AttachmentCheckIssue }>;
} {
  const issues: Array<{ file: string; issue: AttachmentCheckIssue }> = [];
  if (attachments.length > EMAIL_ATTACHMENT_LIMITS.maxCount) {
    issues.push({ file: `(gesamt)`, issue: "zu viele anhaenge" });
  }
  let total = 0;
  for (const a of attachments) {
    if (!EMAIL_ATTACHMENT_LIMITS.allowedMimeTypes.includes(a.mimeType as never)) {
      issues.push({ file: a.filename, issue: "typ nicht erlaubt" });
    }
    if (a.sizeBytes > EMAIL_ATTACHMENT_LIMITS.maxBytesPerFile) {
      issues.push({ file: a.filename, issue: "datei zu gross" });
    }
    total += a.sizeBytes;
  }
  if (total > EMAIL_ATTACHMENT_LIMITS.maxBytesTotal) {
    issues.push({ file: "(gesamt)", issue: "gesamt zu gross" });
  }
  return { ok: issues.length === 0, issues };
}

export type EmailTemplate = {
  id: string;
  version: number;
  subject: string;
  body: string;
};

/** Render mit Platzhaltern; UNBEKANNTE bleiben sichtbar stehen. */
export function renderTemplate(template: EmailTemplate, values: Record<string, string>): {
  subject: string;
  body: string;
  unknownPlaceholders: string[];
} {
  const unknown: string[] = [];
  const replace = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (key in values) return values[key];
      unknown.push(key);
      return `[unbekannt: ${key}]`;
    });
  return {
    subject: replace(template.subject),
    body: replace(template.body),
    unknownPlaceholders: [...new Set(unknown)],
  };
}

/** Vorlagen-Aenderung als neue Version (nie still ueberschreiben). */
export function reviseTemplate(current: EmailTemplate, subject: string, body: string): EmailTemplate {
  return { ...current, subject, body, version: current.version + 1 };
}

/** Body mit Anhangsliste erweitern (nur Namen, nie Inhalte inline). */
export function appendAttachmentNotice(body: string, attachments: EmailAttachment[]): string {
  if (attachments.length === 0) return body;
  const list = attachments.map((a) => `- ${a.filename} (${a.mimeType}, ${(a.sizeBytes / 1024).toFixed(1)} KiB)`).join("\n");
  return `${body}\n\nAnhaenge:\n${list}`;
}
