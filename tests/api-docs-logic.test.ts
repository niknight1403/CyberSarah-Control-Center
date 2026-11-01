import { describe, it, expect } from "vitest";
import {
  formatEndpointBlock,
  findDocGaps,
  quickReference,
  introText,
} from "@/lib/api-docs-logic";
import type { ApiEndpointDoc } from "@/lib/api-docs-logic";

const doc = (over: Partial<ApiEndpointDoc> = {}): ApiEndpointDoc => ({
  method: "GET",
  route: "/api/v1/projects",
  summary: "Projekte lesen",
  requiredScope: "read",
  authRequired: true,
  rateLimitPerMinute: 60,
  requestExample: null,
  errorCodes: [401, 429],
  ...over,
});

describe("Sprint 340 — API-Doku", () => {
  it("Block nennt Auth, Scope, Limit und Fehler-Codes", () => {
    const block = formatEndpointBlock(doc({ requestExample: { q: "x" } }));
    expect(block).toContain("GET /api/v1/projects");
    expect(block).toContain("API-Key noetig");
    expect(block).toContain("60/Minute");
    expect(block).toContain("Fehler-Codes: 401, 429");
    expect(block).toContain('"q":"x"');
    expect(formatEndpointBlock(doc({ rateLimitPerMinute: null, authRequired: false }))).toContain("unbegrenzt (bewusst)");
  });

  it("findet unehrliche Doku: keine Fehler-Codes, falsche Scopes", () => {
    const gaps = findDocGaps([
      doc({ errorCodes: [] }),
      doc({ method: "DELETE", route: "/api/v1/x", requiredScope: "read" }),
      doc(),
    ]);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toContain("keine Fehler-Codes");
    expect(gaps[1]).toContain("falsch dokumentiert");
    expect(findDocGaps([doc()])).toEqual([]);
  });

  it("Schnellreferenz gruppiert nach Methode, Intro nennt Limits", () => {
    const ref = quickReference([doc(), doc({ method: "POST", route: "/api/v1/x" })]);
    expect(ref.GET).toEqual(["/api/v1/projects"]);
    expect(ref.POST).toEqual(["/api/v1/x"]);
    expect(introText([doc(), doc({ rateLimitPerMinute: null })])).toContain("1 davon mit Rate-Limit");
  });
});
