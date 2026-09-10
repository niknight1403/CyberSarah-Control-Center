/**
 * Sprint 63 — Chat-Suche: persistente Chat-Historie durchsuchen.
 *
 * Deterministische Schlüsselwortsuche ueber die gespeicherten Nachrichten
 * (Sprint 54): Terme sind nicht groß-/klein-sensitiv, mehrere Terme
 * wirken als UND-Verknuepfung, Treffer werden bewertet (Titeltreffer >
 * Inhaltslaenge > Aktualitaet) und mit kompakter Schnipsel-Ansicht
 * geliefert. Reine Logik — der Router laedt nur die Kandidaten aus der DB.
 */

export interface SearchableMessage {
  role: string;
  content: string;
  sessionId: string;
  title: string;
  createdAt: Date | string;
}

export interface SearchHit {
  role: string;
  sessionId: string;
  title: string;
  createdAt: string;
  snippet: string;
  score: number;
  matchedTermCount: number;
}

export interface SearchResult {
  hits: SearchHit[];
  totalMatches: number;
  truncated: boolean;
}

const MAX_SNIPPET_LENGTH = 160;

/** Bereinigt und zerlegt die Suchanfrage in Terme (UND-verknuepft). */
export function parseSearchQuery(query: string): string[] {
  return String(query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .slice(0, 8);
}

/** Validiert die Anfrage — leere oder zu kurze Suchen werden abgelehnt. */
export function validateSearchQuery(query: string): { valid: true } | { valid: false; reason: string } {
  const terms = parseSearchQuery(query);
  if (terms.length === 0) {
    return { valid: false, reason: "Suchanfrage ist leer." };
  }
  return { valid: true };
}

function containsAllTerms(haystack: string, terms: string[]): boolean {
  return terms.every((term) => haystack.includes(term));
}

/** Bewertet einen Treffer: Termanzahl > Vorkommnisse > Aktualitaet. */
export function scoreMessage(message: SearchableMessage, terms: string[]): number {
  const content = message.content.toLowerCase();
  const title = message.title.toLowerCase();
  const occurrenceCount = terms.reduce(
    (sum, term) => sum + content.split(term).length - 1,
    0,
  );
  const titleBonus = terms.some((term) => title.includes(term)) ? 8 : 0;
  const ageDays = Math.max(
    0,
    (Date.now() - new Date(message.createdAt).getTime()) / 86_400_000,
  );
  const recencyBonus = Math.max(0, 5 - ageDays / 7);
  return terms.length * 4 + occurrenceCount + titleBonus + recencyBonus;
}

/** Kompakter Schnipsel um den ersten Treffer (woerterbewusst, deterministisch). */
export function buildSnippet(content: string, terms: string[], maxLength = MAX_SNIPPET_LENGTH): string {
  const text = String(content ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  const lower = text.toLowerCase();
  const firstTerm = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (firstTerm === undefined) {
    return `${text.slice(0, maxLength - 1)}…`;
  }
  const start = Math.max(0, firstTerm - Math.floor(maxLength / 3));
  const end = Math.min(text.length, start + maxLength);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}

/** Durchsucht Kandidaten und liefert bewertete, begrenzte Treffer. */
export function searchChatMessages(
  messages: SearchableMessage[],
  query: string,
  limit = 20,
): SearchResult {
  const terms = parseSearchQuery(query);
  if (terms.length === 0) {
    return { hits: [], totalMatches: 0, truncated: false };
  }
  const matches = messages.filter((message) =>
    containsAllTerms(message.content.toLowerCase(), terms),
  );
  const hits = matches
    .map((message) => ({
      message,
      score: scoreMessage(message, terms),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.message.createdAt).getTime() - new Date(a.message.createdAt).getTime(),
    )
    .slice(0, Math.max(1, Math.floor(limit)))
    .map(({ message, score }) => ({
      role: message.role,
      sessionId: message.sessionId,
      title: message.title,
      createdAt: new Date(message.createdAt).toISOString(),
      snippet: buildSnippet(message.content, terms),
      score,
      matchedTermCount: terms.length,
    }));
  return {
    hits,
    totalMatches: matches.length,
    truncated: matches.length > hits.length,
  };
}
