/**
 * Sprint 57 — Chat-Sessions: mehrere Konversationen pro Nutzer.
 *
 * Deterministische Sitzungsverwaltung auf Basis der persistenten
 * chatMessages-Tabelle (Spalte sessionId, Migration 0002): Session-IDs
 * werden bereinigt, Sitzungen aus der Historie abgeleitet (Titel aus der
 * ersten Nutzerfrage, letzte Aktivitaet, Nachrichtenanzahl) und fuer die
 * Anzeige sortiert. Reine Logik — Datenbankzugriff bleibt in server/db.ts.
 */

export const DEFAULT_SESSION_ID = "default";
export const SESSION_ID_MAX_LENGTH = 64;
const TITLE_MAX_LENGTH = 48;

export interface ChatMessageLike {
  id: number;
  sessionId: string;
  role: string;
  content: string;
  createdAt: Date | string;
}

export interface ChatSessionView {
  sessionId: string;
  title: string;
  messageCount: number;
  lastActivity: string;
  isDefault: boolean;
}

/** Bereinigt eine Roh-Session-ID: Leerzeichen, Kontrolleichen, Laengenbegrenzung. */
export function sanitizeSessionId(raw: string | null | undefined): string {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, SESSION_ID_MAX_LENGTH);
  return cleaned === "" ? DEFAULT_SESSION_ID : cleaned;
}

/** Leitete einen stabilen Sitzungstitel aus der ersten Nutzerfrage ab. */
export function deriveSessionTitle(firstUserMessage: string): string {
  const normalized = String(firstUserMessage ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized === "") return "Neue Unterhaltung";
  if (normalized.length <= TITLE_MAX_LENGTH) return normalized;
  const cut = normalized.slice(0, TITLE_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > TITLE_MAX_LENGTH * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base}…`;
}

/** Baut die sortierte Sitzungsuebersicht aus einer (aufsteigenden) Nachrichtenliste. */
export function buildSessionOverview(
  messages: ChatMessageLike[],
): ChatSessionView[] {
  const bySession = new Map<string, ChatMessageLike[]>();
  for (const message of messages) {
    const sessionId = sanitizeSessionId(message.sessionId);
    const bucket = bySession.get(sessionId);
    if (bucket) {
      bucket.push(message);
    } else {
      bySession.set(sessionId, [message]);
    }
  }

  const sessions: ChatSessionView[] = [];
  for (const [sessionId, bucket] of bySession) {
    const firstUser = bucket.find((m) => m.role === "user");
    sessions.push({
      sessionId,
      title: firstUser ? deriveSessionTitle(firstUser.content) : "Neue Unterhaltung",
      messageCount: bucket.length,
      lastActivity: new Date(bucket[bucket.length - 1].createdAt).toISOString(),
      isDefault: sessionId === DEFAULT_SESSION_ID,
    });
  }

  return sessions.sort((a, b) => {
    if (a.lastActivity !== b.lastActivity) {
      return a.lastActivity < b.lastActivity ? 1 : -1;
    }
    return a.sessionId.localeCompare(b.sessionId);
  });
}

/** Filtert eine Nachrichtenliste auf eine Sitzung (mit Fallback auf die Standardsession). */
export function filterBySession(
  messages: ChatMessageLike[],
  rawSessionId: string | null | undefined,
): ChatMessageLike[] {
  const sessionId = sanitizeSessionId(rawSessionId);
  const filtered = messages.filter((m) => sanitizeSessionId(m.sessionId) === sessionId);
  return filtered;
}

/** Entscheidet, ob ein neuer Turn die aktive Sitzung fortfuehrt oder eine neue beginnt. */
export function resolveTargetSessionId(
  rawSessionId: string | null | undefined,
  knownSessionIds: string[],
): { sessionId: string; isNewSession: boolean } {
  const sessionId = sanitizeSessionId(rawSessionId);
  const isNewSession = !knownSessionIds.some((known) => sanitizeSessionId(known) === sessionId);
  return { sessionId, isNewSession };
}
