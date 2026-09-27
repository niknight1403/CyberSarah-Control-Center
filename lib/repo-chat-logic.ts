/**
 * Repo-Chat-Logik (Sprint 161) — rein und testbar.
 *
 * Code-Abfragen gegen das eigene Projektverzeichnis mit Dateipfaden und
 * Zeilennummern (V4.0: repoChatEngine). Statt eines externen AST-Parsers
 * kommt ein deterministischer Symbol-Scanner zum Einsatz:
 *  - Funktion-, Klassen-, Interface-, Typ- und const-Export-Deklarationen
 *    werden zeilengenau erfasst (auch `export function ...`).
 *  - Die Verzeichnis-Durchwahl bleibt draussen (Reader wird injiziert),
 *    damit die Logik ohne fs-Zugriff in Vitest laeuft und der Server sie
 *    gegen jeden Root (Workspace-Sandbox, Git-Checkout) ausfuehren kann.
 *
 * Integration: server/_core kann indexRepoFiles mit einem fs-Reader fuettern
 * und answerCodeQuery als Agent-Tool (Chat-Frage -> Treffer mit Pfad:Zeile)
 * bereitstellen. Die Logik selbst bleibt framework-frei.
 */

export interface RepoFileContent {
  path: string;
  content: string;
}

export type SymbolKind = "function" | "class" | "interface" | "type" | "const";

export interface RepoSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  /** 1-basierte Zeilennummer der Deklaration. */
  line: number;
}

export interface RepoIndex {
  files: Pick<RepoFileContent, "path">[];
  symbols: RepoSymbol[];
}

export interface CodeQueryResult {
  query: string;
  /** Symbols mit Pfad und Zeilennummer, nach Relevanz sortiert. */
  symbols: (RepoSymbol & { score: number })[];
  /** Dateien, deren Pfad den Suchbegriff enthaelt (PFad-Treffer). */
  files: (Pick<RepoFileContent, "path"> & { score: number })[];
}

/** Verzeichnisse/Dateien, die der Index ueberspringt (V4.0-Vorgabe). */
export const DEFAULT_REPO_EXCLUDES = [
  "node_modules",
  ".git",
  "dist",
  ".expo",
  "coverage",
  "android/build",
  "android/app/build",
];

/** Code-Dateiendungen, die der Symbol-Scanner versteht. */
export const INDEXABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];

/** Maximale Anzahl Dateien im Index (Budget-Deckel fuer Grosse-Indices). */
export const INDEXABLE_FILE_LIMIT = 1500;

/** Maximale Dateigroesse je indexierter Datei (Bytes). */
export const INDEXABLE_MAX_FILE_BYTES = 256 * 1024;

/** Prueft, ob eine Datei fuer den Code-Index infrage kommt (Endung + Ausschluesse). */
export function isIndexableCodeFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").trim();
  if (isExcludedPath(normalized)) return false;
  return INDEXABLE_EXTENSIONS.some((extension) => normalized.toLowerCase().endsWith(extension));
}

/** Baut die indexfaehige Dateiliste aus Roh-Eintraegen (Tarball-Glob-Form). */
export function collectIndexableFiles(
  entries: { path: string; size: number }[],
  limit: number = INDEXABLE_FILE_LIMIT
): { path: string; size: number }[] {
  const collected: { path: string; size: number }[] = [];
  for (const entry of entries) {
    if (collected.length >= limit) break;
    const normalizedPath = entry.path.replace(/\\/g, "/").trim();
    if (!isIndexableCodeFile(normalizedPath)) continue;
    if (!Number.isFinite(entry.size) || entry.size > INDEXABLE_MAX_FILE_BYTES || entry.size < 0) continue;
    collected.push({ path: normalizedPath, size: entry.size });
  }
  return collected;
}

/** Prueft, ob ein relativer Pfad von den Ausschlusssen betroffen ist. */
export function isExcludedPath(relativePath: string, excludes: string[] = DEFAULT_REPO_EXCLUDES): boolean {
  const normalized = relativePath.replace(/\\/g, "/").trim();
  if (!normalized) return true;
  return excludes.some(
    (exclude) => normalized === exclude || normalized.startsWith(`${exclude}/`) || normalized.includes(`/${exclude}/`)
  );
}

/**
 * Zeilengenauer Symbol-Scanner fuer TypeScript/JavaScript-Quelltext.
 * Erkennt die ueblichen Deklarationsformen einschliesslich `export ...`.
 */
export function extractSymbols(filePath: string, content: string): RepoSymbol[] {
  const symbols: RepoSymbol[] = [];
  const lines = (content ?? "").split("\n");

  const patterns: { regex: RegExp; kind: SymbolKind }[] = [
    { regex: /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)/, kind: "function" },
    { regex: /^\s*(?:export\s+)?abstract\s+class\s+([A-Za-z0-9_$]+)/, kind: "class" },
    { regex: /^\s*(?:export\s+)?class\s+([A-Za-z0-9_$]+)/, kind: "class" },
    { regex: /^\s*(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/, kind: "interface" },
    { regex: /^\s*(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*[=<]/, kind: "type" },
    { regex: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)/, kind: "const" },
  ];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const { regex, kind } of patterns) {
      const match = regex.exec(line);
      if (match?.[1]) {
        symbols.push({ name: match[1], kind, filePath, line: lineIndex + 1 });
        break;
      }
    }
  }

  return symbols;
}

/** Baut den Index ueber die uebergebenen Dateiinhalte (Ausschluesse respektiert). */
export function indexRepoFiles(
  files: RepoFileContent[],
  excludes: string[] = DEFAULT_REPO_EXCLUDES
): RepoIndex {
  const index: RepoIndex = { files: [], symbols: [] };
  for (const file of files) {
    if (isExcludedPath(file.path, excludes)) continue;
    index.files.push({ path: file.path });
    index.symbols.push(...extractSymbols(file.path, file.content));
  }
  return index;
}

/**
 * Beantwortet eine Code-Frage gegen den Index: Symbol-Treffer (exakt >
 * Praefix > Teilstring) mit Zeilenangabe plus Pfad-Treffer. Sortiert nach
 * Relevanz, begrenzt auf `limit`.
 */
export function answerCodeQuery(
  query: string,
  index: RepoIndex,
  limit: number = 10
): CodeQueryResult {
  const needle = (query ?? "").trim();
  if (!needle) return { query: needle, symbols: [], files: [] };

  const scoredSymbols = index.symbols
    .map((symbol) => {
      const name = symbol.name.toLowerCase();
      const target = needle.toLowerCase();
      let score = 0;
      if (name === target) score = 100;
      else if (name.startsWith(target)) score = 70;
      else if (name.includes(target)) score = 40;
      return { ...symbol, score };
    })
    .filter((symbol) => symbol.score > 0)
    .sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath) || a.line - b.line)
    .slice(0, limit);

  const scoredFiles = index.files
    .map((file) => {
      const path = file.path.toLowerCase();
      const target = needle.toLowerCase();
      const score = path.includes(target) ? 10 : 0;
      return { path: file.path, score };
    })
    .filter((file) => file.score > 0)
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, limit);

  return { query: needle, symbols: scoredSymbols, files: scoredFiles };
}
