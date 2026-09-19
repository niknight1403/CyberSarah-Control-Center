/**
 * CyberSarah Control Center — Keyless Web-Search: Server-Adapter + Router
 * (Sprint 165)
 *
 * Echte, keyless Web-Suche fuer die autonome Kette:
 *   - keylessWebSearch(): DuckDuckGo-HTML-Scraping mit 8s-Timeout,
 *     Ehrlichkeit bei Fehlern (ok=false, nie erfundene Treffer).
 *   - keylessSearchRouter.search: admin-geschuetzte tRPC-Prozedur.
 *
 * 0 EUR, 0 API-Keys — die aktive Alternative zu jeder bezahlten
 * Search-Anbindung (free-dev-stack: "duckduckgo").
 */

import axios from "axios";
import { z } from "zod";
import { router } from "./_core/trpc";
import { adminProcedure } from "./_core/trpc";
import {
  buildDuckDuckGoUrl,
  parseDuckDuckGoResults,
  validateSearchQuery,
  type KeylessSearchOutcome,
} from "../lib/keyless-search";

const USER_AGENT =
  process.env.DDG_USER_AGENT ?? "Mozilla/5.0 (compatible; CyberSarahControlCenter/4.1; +https://github.com/niknight1403/CyberSarah-Control-Center)";

/** Fuehrt eine kostenlose, keylose Web-Suche aus (nie werfend). */
export async function keylessWebSearch(query: string): Promise<KeylessSearchOutcome> {
  const validation = validateSearchQuery(query);
  if (!validation.ok) {
    return { query, results: [], ok: false, detail: "Suchanfrage zu kurz (min. 2 Zeichen)." };
  }
  try {
    const response = await axios.get<string>(buildDuckDuckGoUrl(validation.normalized), {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      timeout: 8_000,
      responseType: "text",
      validateStatus: (status) => status === 200,
      maxRedirects: 3,
    });
    const results = parseDuckDuckGoResults(typeof response.data === "string" ? response.data : "");
    return {
      query: validation.normalized,
      results,
      ok: true,
      detail: results.length > 0 ? `${results.length} Treffer via DuckDuckGo (keyless, 0 EUR).` : "Keine Treffer.",
    };
  } catch (error) {
    return {
      query: validation.normalized,
      results: [],
      ok: false,
      detail: `DuckDuckGo momentan nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export const keylessSearchRouter = router({
  search: adminProcedure
    .input(z.object({ query: z.string().trim().min(2).max(200) }))
    .query(({ input }) => keylessWebSearch(input.query)),
});
