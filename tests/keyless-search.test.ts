/**
 * Sprint 165 — Keyless Web-Search (DuckDuckGo-Scraping): Logik-Tests
 *
 * Die Parse-Logik ist die harte Basis der kostenlosen Search-Alternative:
 * - Redirect-Dekodierung (uddg=) zu echter Ziel-URL
 * - Titel/Snippet-Extraktion inkl. HTML-Entity-Unescape
 * - Dedup, Ergebnisbegrenzung, Validierung der Suchanfrage
 * - Ehrliches Verhalten bei unvollstaendigem/leerem HTML
 */

import { describe, expect, it } from "vitest";
import {
  buildDuckDuckGoUrl,
  parseDuckDuckGoResults,
  validateSearchQuery,
} from "../lib/keyless-search";

const SAMPLE_HTML = `
<div class="result results_links">
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnodejs.org%2Fdocs%2Flatest%2F&amp;rut=abc">
      Node.js <b>Documentation</b>
    </a>
  </h2>
  <a class="result__snippet" href="x">Node.js® ist eine &amp; LTS-Runtime f&uuml;r JavaScript.</a>
</div>
<div class="result">
  <a class="result__a" href="https://example.com/direct">Direkter Treffer</a>
  <a class="result__snippet">Ohne Redirect.</a>
</div>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnodejs.org%2Fdocs%2Flatest%2F&amp;rut=def">Node.js Documentation (Duplikat)</a>
</div>
<div class="result">
  <a class="result__a" href="javascript:alert(1)">Nicht-http-Link</a>
</div>
`;

describe("keyless-search (DuckDuckGo-Scraping, 0 EUR, keyless)", () => {
  it("dekodiert Redirects zur echten Ziel-URL und extrahiert Titel + Snippet", () => {
    const results = parseDuckDuckGoResults(SAMPLE_HTML);
    expect(results.length).toBe(2);
    expect(results[0].url).toBe("https://nodejs.org/docs/latest/");
    expect(results[0].title).toBe("Node.js Documentation");
    expect(results[0].snippet).toContain("& LTS-Runtime"); // &amp; wird dekodiert
    expect(results[1].url).toBe("https://example.com/direct");
    expect(results[1].snippet).toBe("Ohne Redirect.");
  });

  it("filtert Duplikate, Nicht-http-Links und begrenzt die Trefferzahl", () => {
    const many = Array.from(
      { length: 20 },
      (_, i) => `<a class="result__a" href="https://example.com/p${i}">Treffer ${i}</a>`,
    ).join("");
    const results = parseDuckDuckGoResults(many, 8);
    expect(results.length).toBe(8);
    expect(results[0].url).toBe("https://example.com/p0");

    const invalid = parseDuckDuckGoResults('<a class="result__a" href="javascript:alert(1)">x</a>');
    expect(invalid.length).toBe(0);
  });

  it("verhaelt sich bei leerem/ungueltigem HTML ehrlich (0 Treffer, kein Absturz)", () => {
    expect(parseDuckDuckGoResults("")).toEqual([]);
    expect(parseDuckDuckGoResults("<p>Wartungsseite</p>")).toEqual([]);
  });

  it("validiert Suchanfragen und normalisiert Whitespace", () => {
    expect(validateSearchQuery("  react   hooks  ").normalized).toBe("react hooks");
    expect(validateSearchQuery("react hooks").ok).toBe(true);
    expect(validateSearchQuery("  a  ").ok).toBe(false);
    expect(validateSearchQuery("").ok).toBe(false);
    expect(validateSearchQuery("x".repeat(500)).normalized.length).toBe(200);
  });

  it("baut die DuckDuckGo-URL mit korrektem Encoding", () => {
    expect(buildDuckDuckGoUrl("kostenlose llm api")).toBe(
      "https://html.duckduckgo.com/html/?q=kostenlose%20llm%20api",
    );
  });
});
