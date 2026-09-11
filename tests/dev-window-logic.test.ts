import { describe, expect, it } from "vitest";

import { firstMeaningfulLine, tokenizeLine } from "../lib/syntax-highlight-logic";
import { optimizePrompt, describeSystemContext } from "../lib/prompt-optimization-logic";

describe("syntax highlight logic", () => {
  it("tokenizes keywords, strings, numbers and comments", () => {
    const tokens = tokenizeLine('const limit = 42; // Kappe');
    const kinds = tokens.map((token) => token.kind);
    expect(kinds).toContain("keyword");
    expect(kinds).toContain("number");
    expect(kinds).toContain("comment");

    const plain = tokens.filter((token) => token.kind === "keyword").map((token) => token.text);
    expect(plain).toContain("const");

    const stringTokens = tokenizeLine('greet("welt")').filter((token) => token.kind === "string");
    expect(stringTokens.map((token) => token.text).join("")).toBe('"welt"');
  });

  it("handles empty lines and pure symbols deterministically", () => {
    expect(tokenizeLine("")).toEqual([{ text: "", kind: "plain" }]);
    const symbols = tokenizeLine("}))");
    expect(symbols.map((token) => token.text).join("")).toBe("}))");
    expect(symbols.every((token) => token.kind === "plain")).toBe(true);
    expect(tokenizeLine("def x():")[0].kind).toBe("keyword");
  });

  it("finds the first meaningful line for summaries", () => {
    expect(firstMeaningfulLine("\n\n  # Kommentar\nconst a = 1;\n")).toBe("# Kommentar");
    expect(firstMeaningfulLine("")).toBe("");
  });
});

describe("prompt optimization logic", () => {
  it("removes filler words without changing the task", () => {
    const result = optimizePrompt("Hey, kannst du mir bitte mal die Tests ergänzen?");
    expect(result.optimized).toContain("die Tests ergänzen");
    expect(result.optimized).not.toContain("kannst du");
    expect(result.changes).toContain("Füllwörter entfernt");
    expect(result.removedChars).toBeGreaterThan(0);
  });

  it("normalizes whitespace and blank lines", () => {
    const result = optimizePrompt("Erster Punkt   \n\n\n\nZweiter Punkt");
    expect(result.optimized).toBe("Erster Punkt\n\nZweiter Punkt");
    expect(result.changes).toContain("Mehrfache Leerzeilen verdichtet");
    expect(result.changes).toContain("Leerzeichen am Zeilenende entfernt");
  });

  it("leaves clean prompts untouched", () => {
    const result = optimizePrompt("Implementiere Sprint 77 mit Tests.");
    expect(result.optimized).toBe("Implementiere Sprint 77 mit Tests.");
    expect(result.changes).toHaveLength(0);
    expect(result.removedChars).toBe(0);
  });

  it("describes the system context compactly", () => {
    const text = describeSystemContext({
      provider: "managed",
      modelClass: "code/heavy",
      designTheme: "neon",
      colorScheme: "dark",
      iterationCount: 3,
      maxIterations: 40,
      lastLoopState: "running",
    });
    expect(text).toContain("Provider managed");
    expect(text).toContain("Iteration 3/40");
    expect(text).toContain("neon");
  });
});
