import { describe, expect, it } from "vitest";
import { describeNetworkFailure, looksLikeJsonBody, parseSuccessfulResponse } from "../lib/api-response-logic";

describe("api response validation", () => {
  it("erkennt HTML-Antworten anhand Content-Type und Body", () => {
    expect(looksLikeJsonBody("text/html", "<!DOCTYPE html><html>…")).toBe(false);
    expect(looksLikeJsonBody("application/json", '{"ok":true}')).toBe(true);
    expect(looksLikeJsonBody(null, ' {"a":1}')).toBe(true);
    expect(looksLikeJsonBody("text/plain", "<!DOCTYPE …")).toBe(false);
  });

  it("liefert statt JSON.parse-Exception einen klaren Fehler bei HTML-Fallback", () => {
    const result = parseSuccessfulResponse(200, "text/html", "<!DOCTYPE html><html>…");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Server-URL");
  });

  it("parst valide JSON-Antworten inklusive leerer Bodies", () => {
    expect(parseSuccessfulResponse(200, "application/json", '{"user":1}')).toEqual({
      ok: true,
      data: { user: 1 },
    });
    expect(parseSuccessfulResponse(204, null, "")).toEqual({ ok: true, data: {} });
  });

  it("weist JSON mit Syntaxfehler und falsche Statuscodes strukturiert aus", () => {
    expect(parseSuccessfulResponse(200, "application/json", '{"broken":').ok).toBe(false);
    expect(parseSuccessfulResponse(302, "application/json", "{}").ok).toBe(false);
  });

  it("übersetzt 'Failed to fetch' in eine handlungsleitende Meldung mit URL", () => {
    const msg = describeNetworkFailure(new TypeError("Failed to fetch"), "https://app.example.com/api/trpc");
    expect(msg).toContain("Server nicht erreichbar");
    expect(msg).toContain("app.example.com");
  });

  it("gibt fremde Fehlertexte unverändert zurück", () => {
    expect(describeNetworkFailure(new Error("Ungültige Anmeldung"), "https://x")).toBe("Ungültige Anmeldung");
  });
});
