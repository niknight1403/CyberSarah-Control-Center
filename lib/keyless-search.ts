/**
 * CyberSarah Control Center — Keyless Web-Search (Sprint 165)
 *
 * Echte, komplett kostenlose Web-Suche OHNE API-Key: DuckDuckGo HTML-Endpunkt
 * (html.duckduckgo.com) scraping statt bezahlter Search-APIs.
 *
 * - parseDuckDuckGoResults(): reine Parse-Logik (testbar, kein Netz).
 * - keylessWebSearch(): Server-Adapter mit Timeout, ehrlichem Fehlverhalten
 *   und Ergebnisbegrenzung.
 *
 * Keine Anmeldedaten, keine Kosten, kein Kontingent — die aktive
 * Alternative zu jeder bezahlten Search-Anbindung (siehe free-dev-stack).
 */

export interface KeylessSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface KeylessSearchOutcome {
  query: string;
  results: KeylessSearchResult[];
  /** True, wenn die Suche technisch erfolgreich war (auch bei 0 Treffern). */
  ok: boolean;
  detail: string;
}

/**
 * Extrahiert Suchergebnisse aus dem DuckDuckGo-HTML-Endpunkt.
 * Reine Funktion — der Server-Adapter liefert das HTML.
 * Erwartete Struktur (html.duckduckgo.com/html/?q=...):
 *   <a class="result__a" href="...">Titel</a>
 *   <a class="result__snippet" ...>Auszug</a>
 * Redirect-Links (uddg=) werden zur echten Ziel-URL dekodiert.
 */
export function parseDuckDuckGoResults(rawHtml: string, maxResults = 8): KeylessSearchResult[] {
  const results: KeylessSearchResult[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(rawHtml)) !== null && results.length < maxResults) {
    const href = match[1];
    const url = decodeDuckDuckGoRedirect(href);
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue;

    const title = stripTags(match[2]).trim();
    if (!title) continue;

    // Zugehoeriges Snippet im Anschluss des Treffers suchen.
    const tail = rawHtml.slice(anchorPattern.lastIndex, anchorPattern.lastIndex + 3000);
    const snippetMatch = tail.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]).trim() : "";

    seen.add(url);
    results.push({ title: title.slice(0, 200), url, snippet: snippet.slice(0, 400) });
  }
  return results;
}

function decodeDuckDuckGoRedirect(href: string): string | null {
  const decoded = htmlUnescape(href);
  const uddg = decoded.match(/[?&]uddg=([^&]*)/);
  if (uddg) {
    try {
      return decodeURIComponent(uddg[1]);
    } catch {
      return null;
    }
  }
  return decoded;
}

function stripTags(value: string): string {
  return htmlUnescape(value.replace(/<[^>]*>/g, ""));
}

function htmlUnescape(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

/** Validiert die Suchanfrage (reine Funktion, testbar). */
export function validateSearchQuery(query: string): { ok: boolean; normalized: string } {
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 200);
  return { ok: normalized.length >= 2, normalized };
}

export function buildDuckDuckGoUrl(normalizedQuery: string): string {
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(normalizedQuery)}`;
}
