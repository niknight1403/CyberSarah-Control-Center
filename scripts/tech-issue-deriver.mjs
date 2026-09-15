/**
 * Sprint 116 — Tech-Scanner-Issue-Ableitung (I/O-Seite).
 *
 * Laeuft nach dem taeglichen Tech-Scan (Workflow tech-scanner.yml) und
 * prueft die npm-Funde des Reports gegen die Abhaengigkeits-Matrix
 * (docs/DEPENDENCY_MATRIX.md). Fuer jeden Major-Versionsprung entsteht eine
 * Issue-Vorlage in docs/research/tech-issues/; existiert der stabile Stamm
 * bereits, wird der Fund als Duplikat protokolliert und uebersprungen.
 *
 * Aufruf: node --experimental-strip-types scripts/tech-issue-deriver.mjs
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

import {
  DEPENDENCY_MATRIX_FILE,
  deriveMajorUpgrades,
  extractNpmFindings,
  parseDependencyMatrix,
  partitionByExisting,
} from "../lib/tech-issue-logic.ts";

const REPORT_FILE = "docs/research/LATEST_TECH_SCAN.md";
const ISSUE_DIR = "docs/research/tech-issues";

async function main() {
  const [reportMarkdown, matrixMarkdown] = await Promise.all([
    readFile(REPORT_FILE, "utf8"),
    readFile(DEPENDENCY_MATRIX_FILE, "utf8"),
  ]);
  const matrix = parseDependencyMatrix(matrixMarkdown);
  if (matrix.length === 0) {
    throw new Error("Abhaengigkeits-Matrix ist leer oder unlesbar — docs/DEPENDENCY_MATRIX.md pruefen.");
  }

  const findings = extractNpmFindings(reportMarkdown);
  const drafts = deriveMajorUpgrades(findings, matrix);

  await mkdir(ISSUE_DIR, { recursive: true });
  const existingFiles = await readdir(ISSUE_DIR);
  const existingStems = new Set(existingFiles.map((file) => file.replace(/\.md$/, "")));

  const { newDrafts, duplicates } = partitionByExisting(drafts, existingStems);

  for (const draft of newDrafts) {
    await writeFile(`${ISSUE_DIR}/${draft.fileStem}.md`, draft.body, "utf8");
    console.log(`[tech-issue-deriver] Neue Issue-Vorlage: ${draft.fileStem}.md (${draft.title})`);
  }
  for (const draft of duplicates) {
    console.log(`[tech-issue-deriver] Duplikat uebersprungen: ${draft.fileStem}.md (${draft.title})`);
  }

  console.log(
    `[tech-issue-deriver] Fertig: ${findings.length} npm-Funde geprueft, ` +
      `${newDrafts.length} neue Issue-Vorlagen, ${duplicates.length} Duplikate erkannt.`,
  );
  if (newDrafts.length === 0 && duplicates.length === 0) {
    console.log("[tech-issue-deriver] Keine Major-Upgrades ueber der Matrix gefunden.");
  }
}

main().catch((error) => {
  console.error("[tech-issue-deriver] Fehler:", error);
  process.exit(1);
});
