/**
 * Sprint 138 — Markdown-Lite: verwandelt typische LLM-Antworten (Markdown,
 * Tabellen, LaTeX-Notation) in strukturierte Bloecke, die die Chat-UI ohne
 * Roh-Code anzeigen kann. Bewusst schlank gehalten: kein externer
 * Markdown-Parser, damit Web + Nativ identisch rendern.
 */

export type InlineSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
};

export type MarkdownBlock =
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "header"; spans: InlineSpan[] }
  | { type: "bullet"; spans: InlineSpan[] }
  | { type: "code"; code: string }
  | { type: "tableRow"; cells: string[]; header?: boolean }
  | { type: "quote"; spans: InlineSpan[] };

const FENCE = /^\s*```/;

/** Entfernt LaTeX-Delimiter und -Befehle, die ohne Mathe-Renderer als Roh-Code erscheinen wuerden. */
export function stripLatex(input: string): string {
  return input
    .replace(/\\\[|\\\]|\\\(|\\\)/g, "")
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)")
    .replace(/\\times/g, "·")
    .replace(/\\cdot/g, "·")
    .replace(/\\(?:left|right)/g, "");
}

/** Zerlegt eine Zeile in fette/kursive/monospace Spans. */
export function parseInlineSpans(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  // Reihenfolge wichtig: Inline-Code zuerst (darin kein weiteres Parsing), dann fett, dann kursiv.
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) {
      spans.push({ text: line.slice(cursor, match.index) });
    }
    const token = match[0];
    if (token.startsWith("`")) {
      spans.push({ text: token.slice(1, -1), mono: true });
    } else if (token.startsWith("**")) {
      spans.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith("__")) {
      spans.push({ text: token.slice(2, -2), bold: true });
    } else {
      spans.push({ text: token.slice(1, -1), italic: true });
    }
    cursor = match.index + token.length;
  }
  if (cursor < line.length) {
    spans.push({ text: line.slice(cursor) });
  }
  return spans.filter((span) => span.text.length > 0);
}

/** Erkennt Markdown-Tabellenzeilen (| a | b |) und Trennzeilen (|---|---|). */
export function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");
}

export function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** Konvertiert eine komplette Antwort in anzeigebare Bloecke. */
export function parseMarkdownLite(raw: string): MarkdownBlock[] {
  const cleaned = stripLatex(raw);
  const lines = cleaned.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let inCode = false;
  let codeLines: string[] = [];

  for (const line of lines) {
    if (FENCE.test(line)) {
      if (inCode) {
        blocks.push({ type: "code", code: codeLines.join("\n") });
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (/^#{1,6}\s+/.test(trimmed)) {
      blocks.push({ type: "header", spans: parseInlineSpans(trimmed.replace(/^#{1,6}\s+/, "")) });
      continue;
    }
    if (isTableSeparator(trimmed)) {
      // Die Kopfzeile ist die Tabellenzeile VOR dem Trenner.
      const last = blocks.at(-1);
      if (last && last.type === "tableRow") last.header = true;
      continue;
    }
    if (trimmed.startsWith("|")) {
      blocks.push({ type: "tableRow", cells: parseTableRow(trimmed), header: false });
      continue;
    }
    if (/^[-*•]\s+/.test(trimmed)) {
      blocks.push({ type: "bullet", spans: parseInlineSpans(trimmed.replace(/^[-*•]\s+/, "")) });
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      blocks.push({ type: "quote", spans: parseInlineSpans(trimmed.replace(/^>\s?/, "")) });
      continue;
    }
    if (/^(-{3,}|_{3,})$/.test(trimmed)) {
      continue; // Trennlinien ueberspringen — Abstand macht die Blase selbst
    }
    blocks.push({ type: "paragraph", spans: parseInlineSpans(trimmed) });
  }
  if (codeLines.length > 0) {
    blocks.push({ type: "code", code: codeLines.join("\n") });
  }
  return blocks;
}
