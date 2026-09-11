/**
 * Leichte, deterministische Syntax-Hervorhebung für den Diff-Viewer — ohne
 * externe Highlighter-Abhängigkeit. Erkennt je Zeile Kommentare, Strings,
 * Zahlen und Schlüsselwörter gängiger Sprachen und liefert Farbfähnchen,
 * die die UI auf Design-Tokens (success/error/muted/foreground) abbildet.
 */

export type SyntaxTokenKind = "plain" | "keyword" | "string" | "number" | "comment";

export type SyntaxToken = { text: string; kind: SyntaxTokenKind };

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "switch", "case",
  "break", "continue", "new", "class", "extends", "import", "from", "export", "default", "type",
  "interface", "async", "await", "try", "catch", "finally", "throw", "typeof", "instanceof",
  "public", "private", "readonly", "static", "def", "elif", "lambda", "None", "True", "False",
  "null", "undefined", "true", "false", "this", "super", "in", "of", "not", "and", "or", "is",
]);

const NUMBER_PATTERN = /^(?:0[xX][0-9a-fA-F]+|\d+(?:[._]\d+)*(?:[eE][+-]?\d+)?)/;

function keywordKind(word: string): SyntaxTokenKind | null {
  return KEYWORDS.has(word) ? "keyword" : null;
}

/**
 * Zerlegt eine Zeile in Tokens. Kommentare (#, // und /*) dominieren den
 * Zeilenrest; Strings werden mit " ' ` erkannt.
 */
export function tokenizeLine(line: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let index = 0;
  const length = line.length;

  while (index < length) {
    const rest = line.slice(index);

    const lineComment = rest.match(/^(\/\/|#).*$/);
    const blockComment = rest.match(/^\/\*[\s\S]*?(\*\/|$)/);
    if (lineComment || blockComment) {
      const text = blockComment ? blockComment[0] : rest;
      tokens.push({ text, kind: "comment" });
      break;
    }

    const string = rest.match(/^(['"`])(?:\\.|(?!\1)[\s\S])*\1?/);
    if (string) {
      tokens.push({ text: string[0], kind: "string" });
      index += string[0].length;
      continue;
    }

    const number = rest.match(NUMBER_PATTERN);
    if (number) {
      tokens.push({ text: number[0], kind: "number" });
      index += number[0].length;
      continue;
    }

    const word = rest.match(/^[A-Za-z_$][\w$]*/);
    if (word) {
      const kind = keywordKind(word[0]);
      tokens.push({ text: word[0], kind: kind ?? "plain" });
      index += word[0].length;
      continue;
    }

    const symbol = rest.match(/^[^\s]/);
    if (symbol) {
      tokens.push({ text: symbol[0], kind: "plain" });
      index += symbol[0].length;
      continue;
    }

    const space = rest.match(/^\s+/);
    if (space) {
      tokens.push({ text: space[0], kind: "plain" });
      index += space[0].length;
    }
  }

  return tokens.length === 0 ? [{ text: "", kind: "plain" }] : tokens;
}

/** Vorschau-Text (erste Zeilen) für Tooltips/Summaries. */
export function firstMeaningfulLine(code: string): string {
  return (
    code
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ""
  );
}
