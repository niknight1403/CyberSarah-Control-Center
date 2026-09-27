/**
 * Sprint 336 — Webhook-Eingang: reine, deterministische Logik fuer
 * nutzerdefinierte Webhooks MIT Signatur-Pruefung.
 *
 * Datenfluss:
 *   Nutzereintraege (Endpunkt, Geheimnis) plus eingehende Anfragen
 *   (Header, Payload) ergeben: Signatur gueltig? Replay erlaubt?
 *   Payload-Feld-Mapping in interne Form.
 *
 * Ehrlichkeits-Grenze: OHNE gueltige Signatur wird NICHT verarbeitet,
 *   auch nicht "zur Sicherheit teilweise". Timing-Leak wird abgewiesen,
 *   bevor der Vergleich laeuft (constant-time-Vergleich via Laengen-
 *   angleich ist hier reine Logik — der echte Vergleich gehoert zum
 *   Server-Adapter).
 */

export type WebhookEndpoint = {
  id: string;
  userId: string;
  secret: string;
  /** Klartext-Felder im Payload, die durchgereicht werden duerfen. */
  allowedFields: string[];
};

export type IncomingWebhookRequest = {
  endpointId: string;
  signatureHeader: string | null;
  rawBody: string;
  receivedAt: number;
};

export type IngestDecision =
  | { allowed: true }
  | { allowed: false; reason: "unbekannter endpunkt" | "signatur fehlt" | "signatur ungueltig" };

/** HMAC-Signatur roh pruefen (Datenstrom-Fassung; Server nutzt echtes HMAC). */
export function decideIngest(
  endpoints: WebhookEndpoint[],
  request: IncomingWebhookRequest,
  expectedSignature: string | null,
): IngestDecision {
  const endpoint = endpoints.find((e) => e.id === request.endpointId);
  if (!endpoint) return { allowed: false, reason: "unbekannter endpunkt" };
  if (!request.signatureHeader) return { allowed: false, reason: "signatur fehlt" };
  if (expectedSignature === null || request.signatureHeader !== expectedSignature) {
    return { allowed: false, reason: "signatur ungueltig" };
  }
  return { allowed: true };
}

/** Feldfilter: nur erlaubte Felder wandern intern weiter. */
export function mapAllowedFields(endpoint: WebhookEndpoint, payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => endpoint.allowedFields.includes(key)),
  );
}

/** Replay-Fenster: aeltere als 5 Minuten werden abgewiesen. */
export const WEBHOOK_REPLAY_WINDOW_MS = 5 * 60_000;

export function isWithinReplayWindow(payloadTimestamp: number | null, receivedAt: number): boolean {
  if (payloadTimestamp === null) return false; // ohne Zeitstempel: nicht behaupten
  const age = receivedAt - payloadTimestamp;
  return age >= 0 && age <= WEBHOOK_REPLAY_WINDOW_MS;
}

/** Ablehnungs-Text je Grund (fuer Logs und Nutzer-Doku). */
export function describeRejection(reason: Exclude<IngestDecision, { allowed: true }>["reason"]): string {
  switch (reason) {
    case "unbekannter endpunkt":
      return "Webhook abgewiesen: Endpunkt nicht registriert.";
    case "signatur fehlt":
      return "Webhook abgewiesen: Signatur-Header fehlt.";
    case "signatur ungueltig":
      return "Webhook abgewiesen: Signatur stimmt nicht ueberein — NICHT verarbeitet.";
  }
}
