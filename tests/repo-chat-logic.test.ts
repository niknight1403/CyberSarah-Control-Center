import { describe, expect, it } from "vitest";

import {
  answerCodeQuery,
  collectIndexableFiles,
  DEFAULT_REPO_EXCLUDES,
  INDEXABLE_FILE_LIMIT,
  INDEXABLE_MAX_FILE_BYTES,
  isIndexableCodeFile,
  extractSymbols,
  indexRepoFiles,
  isExcludedPath,
} from "../lib/repo-chat-logic";

/**
 * Sprint 161 — Repo-Chat-Logik: Code-Abfragen mit Dateipfad und Zeilennummer
 * gegen den injizierten Dateiinhalt (repoChatEngine, AST-lite-Scanner).
 */
describe("isExcludedPath", () => {
  it("schliesst node_modules/.git/dist und Unterpfade aus", () => {
    expect(isExcludedPath("node_modules/react/index.js")).toBe(true);
    expect(isExcludedPath(".git/hooks/pre-commit")).toBe(true);
    expect(isExcludedPath("src/dist-helper.ts")).toBe(false);
    expect(isExcludedPath("lib/llm.ts")).toBe(false);
  });

  it("erkennt Ausschluesse mitten im Pfad (android/build)", () => {
    expect(isExcludedPath("android/build/outputs/apk/app.apk")).toBe(true);
  });

  it("leere Pfade sind ausgeschlossen", () => {
    expect(isExcludedPath("")).toBe(true);
  });
});

describe("extractSymbols", () => {
  const sample = `import path from "path";

export const TOOL_TIMEOUT_MS = 15_000;

export interface ToolResult {
  ok: boolean;
}

export type HITLStatus = "AUTO_APPROVED" | "OPERATOR_CONFIRM_REQUIRED";

export async function executeTool(name: string) {
  return run(name);
}

function run(name: string) {
  return name;
}

export class KeyRotatorEngine {
  getKey(provider: string): string {
    return provider;
  }
}

const internal = 1;
`;

  it("erfasst Funktionen, Klassen, Interfaces, Typen und Konstanten mit Zeilennummern", () => {
    const symbols = extractSymbols("server/tool-registry.ts", sample);
    const byName = new Map(symbols.map((symbol) => [symbol.name, symbol]));

    expect(byName.get("TOOL_TIMEOUT_MS")).toMatchObject({ kind: "const", line: 3 });
    expect(byName.get("ToolResult")).toMatchObject({ kind: "interface", line: 5 });
    expect(byName.get("HITLStatus")).toMatchObject({ kind: "type", line: 9 });
    expect(byName.get("executeTool")).toMatchObject({ kind: "function", line: 11 });
    expect(byName.get("run")).toMatchObject({ kind: "function", line: 15 });
    expect(byName.get("KeyRotatorEngine")).toMatchObject({ kind: "class", line: 19 });
    expect(byName.get("internal")).toMatchObject({ kind: "const", line: 25 });
  });

  it("alle Symbole tragen den Dateipfad", () => {
    for (const symbol of extractSymbols("lib/x.ts", sample)) {
      expect(symbol.filePath).toBe("lib/x.ts");
    }
  });

  it("leerer oder unstrukturierter Inhalt liefert keine Symbole", () => {
    expect(extractSymbols("a.ts", "")).toEqual([]);
    expect(extractSymbols("a.txt", "nur flacher Text\nohne Deklarationen")).toEqual([]);
  });
});

describe("indexRepoFiles", () => {
  it("ueberspringt ausgeschlossene Verzeichnisse komplett (auch beim Indexieren)", () => {
    const index = indexRepoFiles([
      { path: "lib/hitl-guard-logic.ts", content: "export function evaluateHITLRisk() { return 1; }" },
      { path: "node_modules/pkg/index.js", content: "module.exports = {};" },
      { path: "dist/server.js", content: "var x = 1;" },
    ]);
    expect(index.files).toEqual([{ path: "lib/hitl-guard-logic.ts" }]);
    expect(index.symbols).toHaveLength(1);
    expect(index.symbols[0]).toMatchObject({ name: "evaluateHITLRisk", line: 1 });
  });

  it("DEFAULT_REPO_EXCLUDES enthaelten die V4.0-Vorgaben", () => {
    expect(DEFAULT_REPO_EXCLUDES).toContain("node_modules");
    expect(DEFAULT_REPO_EXCLUDES).toContain(".git");
    expect(DEFAULT_REPO_EXCLUDES).toContain("dist");
  });
});

describe("answerCodeQuery", () => {
  const index = indexRepoFiles([
    {
      path: "server/orchestrator/tool-registry.ts",
      content: "export async function executeTool(name: string) { return name; }\nexport function getToolDefinitions() { return []; }",
    },
    {
      path: "lib/key-rotation-logic.ts",
      content: "export function keyHealthScore() { return 1; }\nexport const KEY_ROTATION_COOLDOWN_MS = 60000;",
    },
    {
      path: "lib/hitl-guard-logic.ts",
      content: "export function evaluateHITLRisk() { return 1; }",
    },
  ]);

  it("exakter Symbolname rangiert vor Teilstring-Treffern", () => {
    const result = answerCodeQuery("executeTool", index);
    expect(result.symbols[0]).toMatchObject({
      name: "executeTool",
      filePath: "server/orchestrator/tool-registry.ts",
      line: 1,
      score: 100,
    });
  });

  it("Praefix-Treffer rangieren vor Teilstring-Treffern", () => {
    const result = answerCodeQuery("key", index);
    expect(result.symbols[0].name.startsWith("key")).toBe(true);
    const prefixScore = result.symbols[0].score;
    const substringScore = result.symbols.filter((s) => !s.name.toLowerCase().startsWith("key"))[0]?.score ?? 0;
    expect(prefixScore).toBeGreaterThan(substringScore);
  });

  it("Pfad-Treffer werden als Datei-Vorschlaege geliefert", () => {
    const result = answerCodeQuery("hitl-guard", index);
    expect(result.files.map((file) => file.path)).toContain("lib/hitl-guard-logic.ts");
  });

  it("leere Abfrage liefert leeres Ergebnis, Limit wird respektiert", () => {
    expect(answerCodeQuery("", index).symbols).toEqual([]);
    expect(answerCodeQuery("e", index, 1).symbols.length).toBeLessThanOrEqual(1);
  });
});

describe("isIndexableCodeFile / collectIndexableFiles (Sprint 163 — Tarball-Budget)", () => {
  it("erkennt Code-Endungen und wirft Nicht-Code sowie Ausgeschlossenes raus", () => {
    expect(isIndexableCodeFile("lib/server.ts")).toBe(true);
    expect(isIndexableCodeFile("components/App.tsx")).toBe(true);
    expect(isIndexableCodeFile("scripts/tool.mjs")).toBe(true);
    expect(isIndexableCodeFile("README.md")).toBe(false);
    expect(isIndexableCodeFile("assets/logo.png")).toBe(false);
    expect(isIndexableCodeFile("node_modules/pkg/index.js")).toBe(false);
    expect(isIndexableCodeFile("dist/bundle.js")).toBe(false);
  });

  it("respektiert Dateigroessen-Budget deterministisch", () => {
    const entries = [
      { path: "a.ts", size: 100 },
      { path: "b.ts", size: INDEXABLE_MAX_FILE_BYTES + 1 },
      { path: "c.ts", size: -5 },
      { path: "d.ts", size: 42 },
      { path: "e.txt", size: 10 },
    ];
    expect(collectIndexableFiles(entries)).toEqual([
      { path: "a.ts", size: 100 },
      { path: "d.ts", size: 42 },
    ]);
  });

  it("kappt bei INDEXABLE_FILE_LIMIT (Budget-Deckel fuer grosse Repos)", () => {
    const entries = Array.from({ length: INDEXABLE_FILE_LIMIT + 50 }, (_, index) => ({
      path: `src/file${index}.ts`,
      size: 10,
    }));
    const collected = collectIndexableFiles(entries);
    expect(collected).toHaveLength(INDEXABLE_FILE_LIMIT);
    expect(collected[0].path).toBe("src/file0.ts");
  });

  it("ungueltige Groessenangaben werden uebersprungen, nicht abgebrochen", () => {
    const entries = [
      { path: "bad.ts", size: Number.NaN },
      { path: "good.ts", size: 7 },
    ];
    expect(collectIndexableFiles(entries)).toEqual([{ path: "good.ts", size: 7 }]);
  });
});
