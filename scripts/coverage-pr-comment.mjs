#!/usr/bin/env node
/**
 * Sprint 92: Coverage-PR-Kommentar — ersetzt Codecov fuer dieses Repo.
 *
 * Liest die Vitest-Coverage-Zusammenfassung (coverage/coverage-summary.json,
 * erzeugt vom CI-Schritt "Deterministic test suite mit Coverage") und
 * veroeffentlichst sie als aktualisierbaren Kommentar im Pull Request:
 *  - Gesamt-Abdeckung (Statements/Branches/Funktionen/Zeilen)
 *  - die 12 am schwächsten abgedeckten Dateien (Zeilen >= 20), damit
 *    klar ist, wo neue Tests den grössten Effekt haben
 *
 * Kein externer Dienst, kein Token ausser dem automatisch erzeugten
 * GITHUB_TOKEN. DRY_RUN=1 gibt den Markdown nur lokal aus (fuer Tests).
 *
 * Aufruf aus der CI:
 *   node scripts/coverage-pr-comment.mjs
 *   (benötigt GITHUB_TOKEN, PR_NUMBER; GITHUB_REPOSITORY setzt GitHub selbst)
 */

import fs from "node:fs";

const MARKER = "<!-- cybersarah-coverage -->";
const summaryPath = "coverage/coverage-summary.json";
const repo = process.env.GITHUB_REPOSITORY;
const prNumber = Number(process.env.PR_NUMBER);
const token = process.env.GITHUB_TOKEN;
const dryRun = process.env.DRY_RUN === "1";

function fail(message) {
  console.error(`coverage-pr-comment: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(summaryPath)) {
  fail(`Coverage-Zusammenfassung fehlt: ${summaryPath} — vorher 'npm run test:coverage' ausfuehren.`);
}
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const total = summary.total;
if (!total || !total.lines) {
  fail("Coverage-Zusammenfassung ohne 'total' — ungueltiges Format.");
}

function pct(value) {
  return `${Number(value.pct).toFixed(1)} %`;
}

// Schwächste Dateien ermitteln (nur Dateien mit messbaren Zeilen >= 20,
// damit Trivial-Dateien die Liste nicht fluten).
const fileEntries = Object.entries(summary)
  .filter(([key, value]) => key !== "total" && typeof value === "object" && value.lines)
  .map(([key, value]) => ({
    // Projektwurzel abschneiden — lokal (Sandbox) wie in der CI (Runner-Workspace).
    file: key
      .replace(new RegExp("^" + process.cwd() + "/"), "")
      .replace(/.*?CyberSarah-Control-Center\//i, "")
      .replace(/\\/g, "/"),
    pct: Number(value.lines.pct),
    lines: value.lines.total,
  }))
  .filter((entry) => entry.lines >= 20)
  .sort((a, b) => a.pct - b.pct || b.lines - a.lines)
  .slice(0, 12);

const weakestTable = fileEntries
  .map((entry) => `| \`${entry.file}\` | ${entry.pct.toFixed(1)} % | ${entry.lines} |`)
  .join("\n");

const markdown = [
  MARKER,
  "## 📊 Test-Abdeckung (Logik-Suite, v8-Provider)",
  "",
  "| Statements | Branches | Funktionen | Zeilen |",
  "|---|---|---|---|",
  `| ${pct(total.statements)} | ${pct(total.branches)} | ${pct(total.functions)} | ${pct(total.lines)} |`,
  "",
  "**Am schwächsten abgedeckte Dateien** (Zeilen, mindestens 20 messbare Zeilen) — hier haben neue Tests den größten Effekt:",
  "",
  "| Datei | Zeilen-Abdeckung | Zeilen |",
  "|---|---|---|",
  weakestTable,
  "",
  "Lokal reproduzierbar: `npm run test:coverage` — vollständiger Bericht liegt außerdem als CI-Artifact `cybersarah-coverage-<run-id>` bereit. Commits mit zurückgehender Abdeckung bitte mit neuen Tests ergänzen. Danke! 🙏",
].join("\n");

if (dryRun) {
  console.log("=== DRY RUN: Coverage-Kommentar ===");
  console.log(markdown);
  process.exit(0);
}

if (!repo || !Number.isFinite(prNumber) || prNumber <= 0 || !token) {
  fail("GITHUB_TOKEN, PR_NUMBER und GITHUB_REPOSITORY muessen gesetzt sein (oder DRY_RUN=1).");
}

const api = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "cybersarah-coverage-comment",
  "Content-Type": "application/json",
};

async function main() {
  const listResponse = await fetch(api, { headers });
  if (!listResponse.ok) {
    fail(`Kommentar-Liste nicht lesbar (HTTP ${listResponse.status}).`);
  }
  const comments = await listResponse.json();
  const existing = comments.find(
    (comment) => typeof comment.body === "string" && comment.body.includes(MARKER),
  );
  if (existing) {
    const patchResponse = await fetch(`${api}/${existing.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ body: markdown }),
    });
    if (!patchResponse.ok) {
      fail(`Kommentar nicht aktualisierbar (HTTP ${patchResponse.status}).`);
    }
    console.log(`Coverage-Kommentar aktualisiert (Comment-ID ${existing.id}).`);
    return;
  }
  const postResponse = await fetch(api, {
    method: "POST",
    headers,
    body: JSON.stringify({ body: markdown }),
  });
  if (!postResponse.ok) {
    fail(`Kommentar nicht anlegbar (HTTP ${postResponse.status}).`);
  }
  console.log("Coverage-Kommentar angelegt.");
}

main();
