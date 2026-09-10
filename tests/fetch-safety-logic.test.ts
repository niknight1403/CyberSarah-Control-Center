import { describe, expect, it } from "vitest";

import {
  BODY_SNIPPET_MAX_LENGTH,
  describeNonJsonResponse,
  isJsonContentType,
  parseJsonResponse,
} from "../lib/fetch-safety-logic";

function fakeResponse(init: {
  status?: number;
  contentType?: string | null;
  body?: string;
  ok?: boolean;
  url?: string;
}): Response {
  const headers = new Headers();
  if (init.contentType != null) headers.set("content-type", init.contentType);
  return {
    ok: init.ok ?? (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers,
    url: init.url ?? "https://api.example.test/api/trpc/x",
    text: async () => init.body ?? "",
    json: async () => {
      if (init.body && init.body.trimStart().startsWith("<")) {
        throw new SyntaxError("Unexpected token '<', <!DOCTYPE ...> is not valid JSON");
      }
      return JSON.parse(init.body ?? "{}");
    },
  } as unknown as Response;
}

describe("fetch-safety-logic", () => {
  it("erkennt JSON-Content-Types inklusive Charset", () => {
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("application/json; charset=utf-8")).toBe(true);
    expect(isJsonContentType("APPLICATION/JSON")).toBe(true);
    expect(isJsonContentType("text/html; charset=utf-8")).toBe(false);
    expect(isJsonContentType(null)).toBe(false);
    expect(isJsonContentType("")).toBe(false);
  });

  it("beschreibt HTML-Fehlerseiten sprechend statt als Parse-Exception", () => {
    const message = describeNonJsonResponse({
      status: 404,
      contentType: "text/html; charset=utf-8",
      bodySnippet: "<!DOCTYPE html><html><head><title>Error</title>",
    });
    expect(message).toContain("HTTP 404");
    expect(message).toContain("text/html");
    expect(message).toContain("existiert auf diesem Server nicht");
    expect(message).toContain("<!DOCTYPE html>");
  });

  it("nennt interne Serverfehler korrekt", () => {
    const message = describeNonJsonResponse({ status: 502, contentType: "text/html" });
    expect(message).toContain("HTTP 502");
    expect(message).toContain("internen Fehler");
    expect(message).not.toContain("existiert nicht");
  });

  it("kuerzt Body-Snippets auf die definierte Grenze", () => {
    const longBody = "x".repeat(BODY_SNIPPET_MAX_LENGTH * 4);
    const message = describeNonJsonResponse({ status: 500, contentType: "text/plain", bodySnippet: longBody });
    expect(message.length).toBeLessThan(longBody.length);
    expect(message).toContain("x".repeat(100));
  });

  it("laesst gueltige JSON-Antworten durch parseJsonResponse", async () => {
    const result = await parseJsonResponse<{ ok: true }>(
      fakeResponse({ status: 200, contentType: "application/json", body: '{"ok":true}' }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("wirft sprechenden Fehler statt HTML-Parse-Exception bei 404-HTML", async () => {
    const response = fakeResponse({
      status: 404,
      contentType: "text/html; charset=utf-8",
      body: "<!DOCTYPE html><pre>Cannot GET /api/xyz</pre>",
    });
    await expect(parseJsonResponse(response)).rejects.toThrow(/keine JSON-Antwort/);
    await expect(parseJsonResponse(response)).rejects.not.toThrow(/Unexpected token/);
  });

  it("toleriert Responses ohne Content-Type-Header (Minimal-Mocks)", async () => {
    const result = await parseJsonResponse<{ ok: true }>(
      fakeResponse({ status: 200, contentType: null, body: '{"ok":true}' }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("wirft sprechenden Fehler bei ok=false mit JSON-Content-Type", async () => {
    const response = fakeResponse({
      status: 503,
      contentType: "application/json",
      body: '{"error":"overloaded"}',
    });
    await expect(parseJsonResponse(response)).rejects.toThrow(/HTTP 503/);
  });
});
