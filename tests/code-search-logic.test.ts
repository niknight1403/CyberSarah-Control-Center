import { describe, expect, it } from "vitest";
import {
  extractSyntaxRange,
  formatCodeSearchResults,
  matchFilePattern,
  performCodeSearch,
} from "../lib/code-search-logic";

describe("code-search-logic (Sprint 286)", () => {
  it("matchFilePattern filtert Pfade nach verschiedenen Mustern korrekt", () => {
    expect(matchFilePattern("src/lib/a.ts", "*.ts")).toBe(true);
    expect(matchFilePattern("src/lib/a.js", "*.ts")).toBe(false);
    expect(matchFilePattern("src/components/chat.tsx", "components/*")).toBe(true);
    expect(matchFilePattern("server/db.ts", "server/")).toBe(true);
  });

  it("extractSyntaxRange generiert saubere Snippets mit Kontextzeilen", () => {
    const fileContent = "line 1\nline 2\nline 3 target\nline 4\nline 5";
    const range = extractSyntaxRange(fileContent, 3, 1);

    expect(range.startLine).toBe(2);
    expect(range.endLine).toBe(4);
    expect(range.snippet).toContain(">    3 | line 3 target");
    expect(range.snippet).toContain("     2 | line 2");
    expect(range.snippet).toContain("     4 | line 4");
  });

  it("performCodeSearch findet Texttreffer und begrenzt Ergebnisse", () => {
    const files = [
      { path: "src/a.ts", content: "function helloWorld() {\n  return 42;\n}" },
      { path: "src/b.ts", content: "// hello comment\nconst name = 'hello';" },
    ];

    const result = performCodeSearch(files, {
      query: "hello",
      maxResults: 2,
    });

    expect(result.totalMatches).toBe(3);
    expect(result.matches).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(result.matches[0].path).toBe("src/a.ts");
    expect(result.matches[0].lineNumber).toBe(1);
  });

  it("formatiert Suchergebnisse verständlich für das Modell", () => {
    const files = [
      { path: "lib/api.ts", content: "export function fetchData() { return true; }" },
    ];
    const search = performCodeSearch(files, { query: "fetchData" });
    const formatted = formatCodeSearchResults(search.matches, search.totalMatches, search.truncated);

    expect(formatted).toContain("lib/api.ts:1");
    expect(formatted).toContain("export function fetchData");
  });
});
