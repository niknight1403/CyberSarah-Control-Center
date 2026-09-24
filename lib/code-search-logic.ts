/**
 * Sprint 286 — Dev-Agent Code-Suche-Tool (grep-ähnlich, Syntax-Range-Extraktion).
 *
 * Sucht in Repositories nach Regex/Text-Mustern, filtert nach Dateipfaden,
 * und extrahiert Syntax-Ranges (Kontextzeilen vor und nach Treffern).
 * Pure, deterministische Logik.
 */

export interface CodeSearchOptions {
  query: string;
  isRegex?: boolean;
  filePattern?: string;
  maxResults?: number;
  contextLines?: number;
}

export interface SyntaxRange {
  startLine: number;
  endLine: number;
  snippet: string;
}

export interface CodeSearchMatch {
  path: string;
  lineNumber: number;
  lineContent: string;
  contextRange: SyntaxRange;
}

export function matchFilePattern(filePath: string, pattern?: string): boolean {
  if (!pattern || !pattern.trim()) return true;
  const p = pattern.trim().toLowerCase();
  const normalizedPath = filePath.toLowerCase().replace(/\\/g, "/");

  // Extension matching like *.ts, *.tsx
  if (p.startsWith("*.")) {
    const ext = p.substring(1);
    return normalizedPath.endsWith(ext);
  }

  // Directory pattern like components/* or server/
  if (p.endsWith("/*") || p.endsWith("/")) {
    const dir = p.replace(/\/\*?$/, "").replace(/^\//, "");
    return normalizedPath.startsWith(dir) || normalizedPath.includes(`/${dir}/`) || normalizedPath.startsWith(`${dir}/`);
  }

  return normalizedPath.includes(p);
}

export function extractSyntaxRange(
  fileContent: string,
  matchLine: number, // 1-basiert
  contextLines = 2
): SyntaxRange {
  const lines = fileContent.split("\n");
  const total = lines.length;

  if (total === 0 || matchLine < 1 || matchLine > total) {
    return { startLine: 1, endLine: 1, snippet: "" };
  }

  const startLine = Math.max(1, matchLine - contextLines);
  const endLine = Math.min(total, matchLine + contextLines);

  const snippetLines = [];
  for (let l = startLine; l <= endLine; l++) {
    const lineText = lines[l - 1];
    const prefix = l === matchLine ? ">" : " ";
    snippetLines.push(`${prefix} ${l.toString().padStart(4, " ")} | ${lineText}`);
  }

  return {
    startLine,
    endLine,
    snippet: snippetLines.join("\n"),
  };
}

export function performCodeSearch(
  files: Array<{ path: string; content: string }>,
  options: CodeSearchOptions
): {
  matches: CodeSearchMatch[];
  totalMatches: number;
  truncated: boolean;
} {
  const { query, isRegex = false, filePattern, maxResults = 20, contextLines = 2 } = options;

  if (!query || !query.trim()) {
    return { matches: [], totalMatches: 0, truncated: false };
  }

  let searchRegex: RegExp;
  try {
    if (isRegex) {
      searchRegex = new RegExp(query, "i");
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      searchRegex = new RegExp(escaped, "i");
    }
  } catch {
    return { matches: [], totalMatches: 0, truncated: false };
  }

  const matches: CodeSearchMatch[] = [];
  let totalMatches = 0;
  const limit = Math.min(Math.max(1, maxResults), 100);

  for (const file of files) {
    if (!matchFilePattern(file.path, filePattern)) {
      continue;
    }

    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const lineContent = lines[i];
      if (searchRegex.test(lineContent)) {
        totalMatches++;
        if (matches.length < limit) {
          const lineNumber = i + 1;
          const contextRange = extractSyntaxRange(file.content, lineNumber, contextLines);
          matches.push({
            path: file.path,
            lineNumber,
            lineContent: lineContent.trim(),
            contextRange,
          });
        }
      }
    }
  }

  return {
    matches,
    totalMatches,
    truncated: totalMatches > limit,
  };
}

export function formatCodeSearchResults(
  matches: CodeSearchMatch[],
  totalMatches: number,
  truncated: boolean
): string {
  if (matches.length === 0) {
    return "Keine Treffer im Repository gefunden.";
  }

  const parts = [];
  parts.push(`Code-Suche: ${totalMatches} Treffer gefunden${truncated ? ` (auf ${matches.length} beschränkt)` : ""}:\n`);

  for (const match of matches) {
    parts.push(`=== ${match.path}:${match.lineNumber} ===`);
    parts.push(match.contextRange.snippet);
    parts.push("");
  }

  return parts.join("\n").trim();
}
