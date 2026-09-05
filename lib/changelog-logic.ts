export type ChangeType = "feat" | "fix" | "docs" | "chore" | "refactor" | "test";

export type CommitEntry = {
  hash: string;
  subject: string;
  type: ChangeType | "other";
  scope: string | null;
};

export type ChangelogSection = {
  type: ChangeType;
  entries: string[];
};

export type Changelog = {
  version: string;
  sections: ChangelogSection[];
  entryCount: number;
  unclassifiedCount: number;
};

const VALID_TYPES: ChangeType[] = ["feat", "fix", "docs", "chore", "refactor", "test"];

/**
 * Zerlegt eine Commit-Betreffzeile im Conventional-Commit-Stil
 * (`type(scope): subject` oder `type: subject`) deterministisch in Typ, Scope
 * und Betreff. Ungültige Zeilen werden als `other` klassifiziert.
 */
export function parseCommitSubject(subject: string): CommitEntry {
  const trimmed = subject.trim();
  const match = /^(feat|fix|docs|chore|refactor|test)(?:\(([^)]+)\))?!?:\s+(.+)$/.exec(trimmed);
  if (!match) {
    return { hash: "", subject: trimmed, type: "other", scope: null };
  }
  return { hash: "", subject: match[3].trim(), type: match[1] as ChangeType, scope: match[2] ?? null };
}

/**
 * Erzeugt ein versionsfähiges Changelog aus Commit-Betreffzeilen. Die
 * Einträge werden nach Typ gruppiert und innerhalb einer Gruppe
 * alphabetisch stabil sortiert, sodass das Ergebnis reproduzierbar ist.
 * Der BETREFF wird auf sensible Muster geprüft und redigiert.
 */
export function buildChangelog(version: string, subjects: string[]): Changelog {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Die Version muss dem Schema major.minor.patch entsprechen.");
  }
  if (!Array.isArray(subjects)) {
    throw new Error("Betreffzeilen müssen ein Array sein.");
  }

  const parsed = subjects
    .map((subject) => ({ ...parseCommitSubject(subject), hash: "" }))
    .map((entry) => ({ ...entry, subject: redactSensitive(entry.subject) }));

  const sections: ChangelogSection[] = [];
  let unclassifiedCount = 0;

  for (const type of VALID_TYPES) {
    const entries = parsed
      .filter((entry) => entry.type === type)
      .map((entry) => (entry.scope ? `[${entry.scope}] ${entry.subject}` : entry.subject))
      .sort((a, b) => a.localeCompare(b));
    if (entries.length > 0) {
      sections.push({ type, entries });
    }
  }

  const otherEntries = parsed.filter((entry) => entry.type === "other");
  unclassifiedCount = otherEntries.length;

  return {
    version,
    sections,
    entryCount: parsed.length,
    unclassifiedCount,
  };
}

const SENSITIVE_PATTERN = /(token|secret|password|api[-_]?key)\s*[:=]?\s*\S+/gi;
const URL_PATTERN = /https?:\/\/\S+/g;

/** Redigiert sensible Werte in Freitext-Betreffs. */
export function redactSensitive(text: string): string {
  return text.replace(SENSITIVE_PATTERN, "$1 [redigiert]").replace(URL_PATTERN, "[redigiert]");
}

/**
 * Rendert das Changelog als stabiles Markdown ohne sensible Daten.
 */
export function renderChangelog(changelog: Changelog): string {
  const typeLabels: Record<ChangeType, string> = {
    feat: "Neu",
    fix: "Fehlerbehebungen",
    docs: "Dokumentation",
    chore: "Wartung",
    refactor: "Refactoring",
    test: "Tests",
  };
  const lines = [`# Changelog ${changelog.version}`, ""];
  for (const section of changelog.sections) {
    lines.push(`## ${typeLabels[section.type]}`, "");
    for (const entry of section.entries) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
  }
  if (changelog.unclassifiedCount > 0) {
    lines.push(`_Hinweis: ${changelog.unclassifiedCount} Eintrag${changelog.unclassifiedCount === 1 ? "" : "träge"} ohne klassifizierten Typ wurden nicht aufgeführt._`, "");
  }
  return lines.join("\n");
}
