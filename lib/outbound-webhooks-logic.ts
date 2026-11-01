/**
 * Sprint 341 — Slack/Discord-Ausgangs-Webhooks: reine, deterministische
 * Logik fuer Agent-Benachrichtigungen.
 *
 * Datenfluss:
 *   Agent-Ereignisse (Text, Schweregrad) werden je Ziel (slack/discord)
 *   in die Payload-Form des Anbieters uebersetzt; Empfaenger-Auswahl
 *   filtert, wer welche Schweregrade ueberhaupt bekommt.
 *
 * Ehrlichkeits-Grenze: Senden ohne Ziel ist kein Versand — es wird
 *   ehrlich als "nicht konfiguriert" gemeldet, nicht als Erfolg.
 *   Erfolgs-Zaehlung zaehlt nur vom Anbieter bestaetigte Sendungen.
 */

export type OutboundTarget = "slack" | "discord";

export type NotificationSeverity = "info" | "warnung" | "kritisch";

export type OutboundConfig = {
  target: OutboundTarget;
  webhookUrl: string;
  /** Mindest-Schweregrad, ab dem gesendet wird. */
  minSeverity: NotificationSeverity;
};

export const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  info: 0,
  warnung: 1,
  kritisch: 2,
};

/** Soll dieses Ereignis an dieses Ziel gehen? */
export function shouldNotify(config: OutboundConfig, severity: NotificationSeverity): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[config.minSeverity];
}

/** Slack-Payload (Block-Kurzfassung). */
export function toSlackPayload(message: string, severity: NotificationSeverity): Record<string, unknown> {
  const emoji: Record<NotificationSeverity, string> = { info: ":information_source:", warnung: ":warning:", kritisch: ":rotating_light:" };
  return { text: `${emoji[severity]} ${message}` };
}

/** Discord-Payload. */
export function toDiscordPayload(message: string, severity: NotificationSeverity): Record<string, unknown> {
  const color: Record<NotificationSeverity, number> = { info: 3447003, warnung: 16776960, kritisch: 15158332 };
  return {
    content: message,
    embeds: [{ color: color[severity], description: message }],
  };
}

/** Payload je Ziel bauen. */
export function buildPayload(target: OutboundTarget, message: string, severity: NotificationSeverity): Record<string, unknown> {
  return target === "slack" ? toSlackPayload(message, severity) : toDiscordPayload(message, severity);
}

export type DeliveryReceipt = { target: OutboundTarget; confirmed: boolean; at: number };

/** Versand-Zusammenfassung: nur bestaetigte gelten als gesendet. */
export function summarizeDeliveries(receipts: DeliveryReceipt[]): string {
  if (receipts.length === 0) {
    return "Kein Ziel konfiguriert — Benachrichtigung wurde NICHT versendet.";
  }
  const confirmed = receipts.filter((r) => r.confirmed).map((r) => r.target);
  const unconfirmed = receipts.filter((r) => !r.confirmed).map((r) => r.target);
  const lines = [];
  if (confirmed.length > 0) lines.push(`Versendet und bestaetigt: ${confirmed.join(", ")}.`);
  if (unconfirmed.length > 0) lines.push(`Nicht bestaetigt (Fehler beim Anbieter): ${unconfirmed.join(", ")}.`);
  return lines.join(" ");
}

/** Ziel-URL-Validierung: nur https, kein localhost (ehrlich abweisen). */
export function isValidOutboundUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !/^(localhost|127\.0\.0\.1)/.test(parsed.hostname);
  } catch {
    return false;
  }
}
