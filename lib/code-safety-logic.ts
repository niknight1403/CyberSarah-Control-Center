/**
 * Sprint 270 — Selbstheilende Schreib-Grenzen im Dev-Agent (rein, testbar).
 *
 * Ehrlichkeits-Regeln:
 *   - Validierung VOR dem Schreiben: kaputter JSON/unausgeglichener Code wird
 *     dem Modell als Fehler gemeldet, das es selbst beheben kann — das IST
 *     das Self-Healing, kein stiller Auto-Fix hinter dem Ruecken.
 *   - Offensichtliche Geheimnisse werden NIE geschrieben, auch nicht auf
 *     Anweisung: private Keys gehoeren in den Vault, nicht ins Repo.
 *   - Der Code-Index ist begrenzt und nur ein Navigationswerkzeug.
 */

export const WRITE_GUARD_LIMITS = {
  contentMaxChars: 1_000_000,
  contentMinChars: 0,
  codeIndexMaxSymbols: 400,
  symbolNameMax: 120,
} as const;

export type WriteGuardVerdict =
  | { ok: true; note: string }
  | { ok: false; reason: string; fixHint: string };

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss", ".html", ".py", ".sh", ".md"] as const;

/** Offensichtliche Geheimnis-Muster — Ablehnung, nicht Maskierung. */
const SECRET_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: "privater Schlüssel-Block" },
  { pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/, label: "Stripe-Live-Key" },
  { pattern: /\bghp_[A-Za-z0-9]{20,}/, label: "GitHub-Token" },
  { pattern: /\bhf_[A-Za-z0-9]{20,}/, label: "HuggingFace-Token" },
  { pattern: /\bre_[A-Za-z0-9]{20,}/, label: "Resend-Key" },
];

function isBalanced(content: string): boolean {
  // Heuristik: Klammern zaehlen ausserhalb von Strings/Kommentaren — bewusst einfach.
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  const stack: string[] = [];
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index] as string;
    const next = content[index + 1];
    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (!inSingle && !inDouble && !inTemplate && char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (!inSingle && !inDouble && !inTemplate && char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" && !inDouble && !inTemplate) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle && !inTemplate) {
      inDouble = !inDouble;
      continue;
    }
    if (char === "`" && !inSingle && !inDouble) {
      inTemplate = !inTemplate;
      continue;
    }
    if (inSingle || inDouble || inTemplate) continue;
    if (char === "{" || char === "(" || char === "[") stack.push(char);
    else if (char === "}" || char === ")" || char === "]") {
      const open = stack.pop();
      if (open === undefined) return false;
      if ((open === "{" && char !== "}") || (open === "(" && char !== ")") || (open === "[" && char !== "]")) return false;
    }
  }
  return stack.length === 0;
}

/** Validiert einen Datei-Schreibvorgang vor der Ausfuehrung. */
export function guardFileWrite(path: string, content: string): WriteGuardVerdict {
  if (typeof path !== "string" || path.trim().length === 0) return { ok: false, reason: "Kein Dateipfad angegeben.", fixHint: "Pfad relativ zum Repo-Root angeben." };
  if (typeof content !== "string") return { ok: false, reason: "Inhalt fehlt oder ist kein Text.", fixHint: "Vollständigen Inhalt als String übergeben." };
  if (content.length > WRITE_GUARD_LIMITS.contentMaxChars) return { ok: false, reason: "Inhalt zu groß.", fixHint: "Datei aufteilen." };
  if (content.includes("\0")) return { ok: false, reason: "Binärinhalt erkannt.", fixHint: "Nur Textdateien schreibbar." };
  for (const secret of SECRET_PATTERNS) {
    if (secret.pattern.test(content)) {
      return { ok: false, reason: `Offensichtlicher ${secret.label} im Inhalt — Schreiben verweigert.`, fixHint: "Geheimnis in den Vault (Settings) legen und im Code als ENV-Referenz nutzen." };
    }
  }
  if (path.endsWith(".json")) {
    try {
      JSON.parse(content);
    } catch (error) {
      return { ok: false, reason: `Ungültiges JSON: ${error instanceof Error ? error.message : "Parse-Fehler"}.`, fixHint: "JSON korrigieren und erneut schreiben — der Fehler steht dabei." };
    }
  }
  const isCode = CODE_EXTENSIONS.some((extension) => path.endsWith(extension));
  if (isCode && !path.endsWith(".md") && !path.endsWith(".css") && !path.endsWith(".scss") && !path.endsWith(".html") && !isBalanced(content)) {
    return { ok: false, reason: "Klammern/Strings sind unausgeglichen (Heuristik).", fixHint: "Öffnende/schließende Klammern und Template-Strings prüfen." };
  }
  return { ok: true, note: "Inhalt geprüft: keine Geheimnisse, Struktur plausibel." };
}

/* ----------------------------- Code-Index ----------------------------- */

export type CodeSymbol = { name: string; kind: "function" | "component" | "const" | "type" | "class"; file: string };
export type CodeIndex = { symbols: CodeSymbol[]; truncated: boolean; fileCount: number };

const EXPORT_PATTERNS: readonly { pattern: RegExp; kind: CodeSymbol["kind"] }[] = [
  { pattern: /export\s+function\s+([A-Za-z_$][\w$]*)/, kind: "function" },
  { pattern: /export\s+default\s+function\s+([A-Za-z_$][\w$]*)/, kind: "component" },
  { pattern: /export\s+(?:const|let)\s+([A-Za-z_$][\w$]*)/, kind: "const" },
  { pattern: /export\s+type\s+([A-Za-z_$][\w$]*)/, kind: "type" },
  { pattern: /export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: "class" },
];

/** Baut einen begrenzten Symbol-Index fuer die Kontext-Indexierung. */
export function buildCodeIndex(files: Readonly<{ path: string; content: string }[]>): CodeIndex {
  const symbols: CodeSymbol[] = [];
  let truncated = false;
  for (const file of files) {
    for (const entry of EXPORT_PATTERNS) {
      const matcher = new RegExp(entry.pattern.source, "g");
      let match = matcher.exec(file.content);
      while (match !== null) {
        const name = match[1] as string;
        if (symbols.length >= WRITE_GUARD_LIMITS.codeIndexMaxSymbols) {
          truncated = true;
          break;
        }
        if (name.length <= WRITE_GUARD_LIMITS.symbolNameMax) {
          symbols.push({ name, kind: entry.kind, file: file.path });
        }
        match = matcher.exec(file.content);
      }
      if (truncated) break;
    }
    if (truncated) break;
  }
  return { symbols, truncated, fileCount: files.length };
}

/** Sucht Symbole fuer eine Frage — die Grundlage des kontextstarken Chat. */
export function findSymbolsForQuery(index: CodeIndex, query: string, max = 8): CodeSymbol[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 3) return [];
  const hits = index.symbols.filter((symbol) => symbol.name.toLowerCase().includes(needle));
  return hits.slice(0, max);
}
