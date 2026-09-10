/**
 * Sprint 54 — deterministische Logik fuer die persistierte
 * Entwicklungsauftrags-Chat-Historie (PostgreSQL/Neon, Tabelle
 * chatMessages). Die Server-Integration (server/db.ts,
 * server/development-chat.ts) nutzt ausschliesslich diese Funktionen;
 * alle Regeln sind hier pure und deterministisch getestet.
 */

/** Zulaessige Rollen in der persistierten Historie. */
export const CHAT_HISTORY_ROLES = ["user", "assistant", "system"] as const;
export type ChatHistoryRole = (typeof CHAT_HISTORY_ROLES)[number];

/** Maximale Zeichen pro gespeicherten Nachrichtentext. */
export const CHAT_HISTORY_MAX_CONTENT_CHARS = 64_000;

/** Standard-Anzahl der neuesten Nachrichten, die geliefert werden. */
export const CHAT_HISTORY_DEFAULT_LIMIT = 100;

/** Hoechstalter einer ausgelieferten Nachricht (kein Filter — nur Doku-Konstante). */
export type PersistedChatMessage = {
  id: number;
  userOpenId: string;
  role: string;
  content: string;
  provider: string | null;
  createdAt: string | Date;
};

/** Prompt-taugliche Nachricht ({role, content}) fuer invokeLLM. */
export type PromptChatMessage = { role: ChatHistoryRole; content: string };

/** Normalisiert eine Rollen-Angabe oder liefert null bei Ungueltigkeit. */
export function normalizeHistoryRole(raw: unknown): ChatHistoryRole | null {
  if (typeof raw !== "string") return null;
  const role = raw.trim().toLowerCase();
  return (CHAT_HISTORY_ROLES as readonly string[]).includes(role)
    ? (role as ChatHistoryRole)
    : null;
}

/** Kappt ueberlange Inhalte deterministisch (Schutz gegen Missbrauch). */
export function clampHistoryContent(raw: string): string {
  const content = String(raw ?? "");
  return content.length > CHAT_HISTORY_MAX_CONTENT_CHARS
    ? content.slice(0, CHAT_HISTORY_MAX_CONTENT_CHARS)
    : content;
}

/**
 * Prueft, ob ein Chat-Turn ueberhaupt persistenz-wuerdig ist:
 * User-Frage und Antwort muessen nicht-leer sein.
 */
export function buildPersistableTurn({
  userContent,
  assistantContent,
  provider,
}: {
  userContent: unknown;
  assistantContent: unknown;
  provider?: unknown;
}): {
  userMessage: PromptChatMessage;
  assistantMessage: PromptChatMessage;
  provider: string | null;
} | null {
  const user = typeof userContent === "string" ? userContent.trim() : "";
  const assistant =
    typeof assistantContent === "string" ? assistantContent.trim() : "";
  if (!user || !assistant) return null;
  const providerId =
    typeof provider === "string" && provider.trim() !== ""
      ? provider.trim().slice(0, 32)
      : null;
  return {
    userMessage: { role: "user", content: clampHistoryContent(user) },
    assistantMessage: { role: "assistant", content: clampHistoryContent(assistant) },
    provider: providerId,
  };
}

/**
 * Ordnet Datenbank-Zeilen (neueste zuerst) zu Prompt-Nachrichten
 * (aellteste zuerst), filtert ungueltige Rollen und leere Inhalte,
 * begrenzt auf die neuesten `limit` Eintraege.
 */
export function historyToPromptMessages(
  rows: PersistedChatMessage[],
  limit = CHAT_HISTORY_DEFAULT_LIMIT,
): PromptChatMessage[] {
  const valid = (Array.isArray(rows) ? rows : [])
    .filter((row) => normalizeHistoryRole(row?.role) !== null)
    .filter((row) => typeof row?.content === "string" && row.content.trim() !== "")
    .map((row) => ({
      role: normalizeHistoryRole(row.role) as ChatHistoryRole,
      content: row.content,
    }));
  const capped = Number.isFinite(limit) && limit > 0 ? limit : 0;
  const newestFirst = valid.slice(0, capped); // DB liefert DESC → neueste zuerst
  return newestFirst.reverse(); // Prompt will aelteste zuerst
}

/**
 * UI-Darstellung der Historie: robust gegen kaputte Zeilen,
 * chronologisch (aelteste zuerst) mit Zeitstempel als ISO-String.
 */
export function toDisplayHistory(rows: PersistedChatMessage[]): Array<{
  id: number;
  role: ChatHistoryRole;
  content: string;
  provider: string | null;
  createdAt: string;
}> {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => normalizeHistoryRole(row?.role) !== null)
    .filter((row) => typeof row?.content === "string" && row.content.trim() !== "")
    .map((row) => ({
      id: row.id,
      role: normalizeHistoryRole(row.role) as ChatHistoryRole,
      content: row.content,
      provider: typeof row.provider === "string" ? row.provider : null,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    }))
    .reverse(); // DB liefert DESC (neueste zuerst) → UI will aelteste zuerst
}

/**
 * Sprint 54 — Abbildung der Server-Historie auf UI-Chat-Zeilen
 * (role "assistant" → "agent", stabile String-Ids, ms-Zeitstempel).
 * Deterministisch und damit ohne React testbar.
 */
export function serverHistoryToChatRows(
  rows: Array<{
    id: number;
    role: string;
    content: string;
    provider?: string | null;
    createdAt: string | Date;
  }>,
): Array<{
  id: string;
  role: "user" | "agent";
  content: string;
  timestampMs?: number;
}> {
  return toDisplayHistory(rows as PersistedChatMessage[])
    .map((entry) => ({
      id: `server-${entry.id}`,
      role: entry.role === "assistant" ? ("agent" as const) : ("user" as const),
      content: entry.content,
      timestampMs: Date.parse(entry.createdAt) || undefined,
    }));
}
