/**
 * Sprint 116 — Tech-Scanner-Issue-Ableitung: reine, deterministische Logik,
 * die aus dem Tech-Scan-Report (Sprint 95) Major-Upgrade-Funde gegen die
 * gepflegte Abhaengigkeits-Matrix prueft und reproduzierbare Issue-Vorlagen
 * (Titel, Begruendung, Akzeptanz-Kriterien, stabiler Datei-Stamm) baut.
 *
 * Datenfluss:
 *   docs/DEPENDENCY_MATRIX.md   — pflegbare Matrix (Scanner prueft dagegen)
 *   docs/research/LATEST_TECH_SCAN.md — taeglicher Report (Sprint 95)
 *   docs/research/tech-issues/<stem>.md — erzeugte Issue-Vorlagen
 *
 * Duplikat-Erkennung: der Datei-Stamm ist der stabile Schluessel
 * (`major-upgrade-<paket>-v<major>`); existiert er bereits, wird der Fund
 * als Duplikat gemeldet und KEINE zweite Datei erzeugt.
 */

/* ==================== Abhaengigkeits-Matrix ==================== */

export type DependencyMatrixEntry = {
  /** npm-Paketname (exakt, wie in package.json). */
  name: string;
  /** Aktuell gepinnte Major-Version (aus package.json). */
  currentMajor: number;
  /** Bereich aus der Matrix (Mobile-Stack/Backend/DevOps/Billing/Agenten-Kern). */
  area: string;
  /** Upgrade-Hinweis fuer die Begruendung. */
  note: string;
};

export const DEPENDENCY_MATRIX_FILE = "docs/DEPENDENCY_MATRIX.md";

/** Parst die Tabellen-Zeilen der Matrix-Datei: `| name | major | area | note |`. */
export function parseDependencyMatrix(markdown: string): DependencyMatrixEntry[] {
  const entries: DependencyMatrixEntry[] = [];
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|") || line.startsWith("|--") || line.startsWith("| --")) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter((cell) => cell !== "");
    if (cells.length < 4) continue;
    const currentMajor = Number.parseInt(cells[1], 10);
    if (!Number.isFinite(currentMajor) || currentMajor < 0) continue;
    if (cells[0].toLowerCase() === "paket") continue; // Kopfzeile
    entries.push({ name: cells[0], currentMajor, area: cells[2], note: cells[3] });
  }
  return entries;
}

/** Serialisiert die Matrix zurueck in das Dateiformat (idempotent). */
export function formatDependencyMatrix(entries: DependencyMatrixEntry[]): string {
  const rows = entries.map((entry) => `| ${entry.name} | ${entry.currentMajor} | ${entry.area} | ${entry.note} |`);
  return [
    "# Abhaengigkeits-Matrix (Sprint 116)",
    "",
    "Gepflegte Kern-Abhaengigkeiten mit gepinnter Major-Version. Der Tech-Scanner",
    "(`scripts/tech-scanner.mjs`) gleicht npm-Funde gegen diese Matrix ab; die",
    "Issue-Ableitung (`scripts/tech-issue-deriver.mjs`) erzeugt fuer jeden",
    "Major-Versionsprung eine Issue-Vorlage in docs/research/tech-issues/.",
    "",
    "| Paket | Major | Bereich | Hinweis |",
    "|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

/* ==================== Versions-Logik (rein) ==================== */

/** Major-Anteil einer Version ("58.0.1" → 58, "v58" → 58, ungueltig → null). */
export function extractMajorFromVersion(version: string): number | null {
  const match = version.trim().replace(/^v/i, "").match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/* ==================== Fund-Parsing aus dem Report ==================== */

export type NpmFinding = {
  /** npm-Paketname (aus der URL, exakt). */
  name: string;
  version: string;
  url: string;
  /** Bereichsangabe aus der Report-Zeile. */
  area: string;
};

/** Extrahiert die npm-Fundzeilen aus einem Tech-Scan-Report (Sprint-95-Format). */
export function extractNpmFindings(reportMarkdown: string): NpmFinding[] {
  const findings: NpmFinding[] = [];
  const pattern = /\*\*\[npm\] \[([^\]]+)\]\(([^)]+)\)\*\* \(v([0-9.]+)\) — Relevanz \d+, Bereich: ([^\n]+)/g;
  for (const match of reportMarkdown.matchAll(pattern)) {
    const url = match[2];
    const name = url.split("/package/").pop();
    if (!name) continue;
    findings.push({
      name,
      version: match[3],
      url,
      area: match[4].trim(),
    });
  }
  return findings;
}

/* ==================== Major-Upgrade-Ableitung ==================== */

export type MajorUpgradeDraft = {
  name: string;
  currentMajor: number;
  latestMajor: number;
  area: string;
  note: string;
  url: string;
  /** Stabiler Schluessel: `major-upgrade-<paket>-v<major>`. */
  fileStem: string;
  title: string;
  body: string;
};

/** Paketnamen dateisystem-sicher machen (z. B. "@scope/pkg" → "scope-pkg"). */
export function sanitizePackageForFile(name: string): string {
  return name.replace(/^@/, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
}

/**
 * Leitet aus npm-Funden und Matrix die Major-Upgrade-Entwuersfe ab: nur Funde,
 * deren Major-Version UEBER der gepinnten Matrix-Version liegt. Mehrere Funde
 * zum selben Paket werden auf die hoechste Major-Version verdichtet.
 */
export function deriveMajorUpgrades(findings: NpmFinding[], matrix: DependencyMatrixEntry[]): MajorUpgradeDraft[] {
  const byName = new Map(matrix.map((entry) => [entry.name, entry]));
  const latestByName = new Map<string, NpmFinding>();
  for (const finding of findings) {
    const existing = latestByName.get(finding.name);
    const latestMajor = extractMajorFromVersion(finding.version);
    const existingMajor = existing ? (extractMajorFromVersion(existing.version) ?? -1) : -1;
    if (latestMajor !== null && latestMajor > existingMajor) {
      latestByName.set(finding.name, finding);
    }
  }

  const drafts: MajorUpgradeDraft[] = [];
  for (const [name, finding] of latestByName) {
    const entry = byName.get(name);
    if (!entry) continue;
    const latestMajor = extractMajorFromVersion(finding.version);
    if (latestMajor === null || latestMajor <= entry.currentMajor) continue;
    const fileStem = `major-upgrade-${sanitizePackageForFile(name)}-v${latestMajor}`;
    const title = `Major-Upgrade: ${name} ${entry.currentMajor} → ${latestMajor}`;
    const body = [
      `## ${title}`,
      "",
      `**Quelle:** [npm-Registry](${finding.url}) — Version v${finding.version}`,
      `**Bereich:** ${entry.area} (Report-Bereich: ${finding.area})`,
      `**Gepinnte Version (package.json):** Major ${entry.currentMajor}`,
      "",
      "### Begruendung",
      "",
      `Automatisch abgeleitet aus dem taeglichen Tech-Scan (Sprint 95/116): die`,
      `npm-Registry meldet v${finding.version}, die Abhaengigkeits-Matrix pinnt`,
      `noch Major ${entry.currentMajor}. ${entry.note}`,
      "",
      "### Akzeptanz-Kriterien",
      "",
      "- [ ] Release Notes der neuen Major-Version auf Breaking Changes geprueft",
      "- [ ] Upgrade in eigenem Branch, volle Suite: `npx tsc --noEmit`, Vitest, Server-Build",
      "- [ ] Abhaengigkeits-Matrix (docs/DEPENDENCY_MATRIX.md) nach dem Upgrade aktualisiert",
      "- [ ] Keine Secrets im Diff, CI gruen, Merge auf main",
      "",
    ].join("\n");
    drafts.push({
      name,
      currentMajor: entry.currentMajor,
      latestMajor,
      area: entry.area,
      note: entry.note,
      url: finding.url,
      fileStem,
      title,
      body,
    });
  }
  // Deterministisch: nach Paketname sortiert.
  drafts.sort((a, b) => a.name.localeCompare(b.name));
  return drafts;
}

/* ==================== Duplikat-Erkennung ==================== */

/**
 * Teilt Entwuersfe in neue und Duplikate: existiert ein Issue-Entwurf mit
 * gleichem Stamm bereits (oder doppelt im Eingang), ist er ein Duplikat und
 * wird NICHT erneut erzeugt.
 */
export function partitionByExisting(
  drafts: MajorUpgradeDraft[],
  existingStems: ReadonlySet<string>,
): { newDrafts: MajorUpgradeDraft[]; duplicates: MajorUpgradeDraft[] } {
  const seen = new Set<string>(existingStems);
  const newDrafts: MajorUpgradeDraft[] = [];
  const duplicates: MajorUpgradeDraft[] = [];
  for (const draft of drafts) {
    if (seen.has(draft.fileStem)) {
      duplicates.push(draft);
      continue;
    }
    seen.add(draft.fileStem);
    newDrafts.push(draft);
  }
  return { newDrafts, duplicates };
}
