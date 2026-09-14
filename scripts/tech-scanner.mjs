/**
 * Sprint 95 — Autonomer Tech-Scanner (I/O-Seite).
 *
 * Laeuft taeglich via .github/workflows/tech-scanner.yml (und manuell per
 * workflow_dispatch) und scannt oeffentliche Quellen nach fuer das
 * CyberSarah-Control-Center relevanten Neuerungen:
 *
 *   1. GitHub Search — neue, vielbeachtete Repos zu MCP/Agenten/Mobile
 *      (benoetigt GITHUB_TOKEN; ohne Token wird die Quelle uebersprungen)
 *   2. Hugging Face — aktuellste Text-Generations-Modelle
 *   3. npm Registry — aktuellste Versionen der Kern-Abhaengigkeiten
 *
 * Bewertung, Filterung und Formatierung liegen rein in
 * lib/tech-scan-logic.ts (getestet). Dieses Skript sammelt nur Rohdaten
 * und schreibt docs/research/LATEST_TECH_SCAN.md. Der Workflow committet
 * den Report ([skip ci]) und aktualisiert den Tech-Scanner-Issue.
 *
 * Aufruf: node --experimental-strip-types scripts/tech-scanner.mjs
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import { formatTechScanReport, selectReportFindings } from "../lib/tech-scan-logic.ts";

const SCAN_DATE = process.env.SCAN_DATE || new Date().toISOString().slice(0, 10);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || null;
const HTTP_TIMEOUT_MS = 15_000;

/** Kern-Abhaengigkeiten, deren npm-Stand verglichen wird. */
const NPM_WATCHED = ["expo", "react-native", "typescript", "drizzle-orm", "vitest", "@modelcontextprotocol/sdk"];

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} fuer ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 1) GitHub: neue, vielbeachtete Repos zu Agent-/MCP-/Mobile-Themen. */
async function scanGitHub() {
  if (!GITHUB_TOKEN) {
    console.log("[tech-scanner] GitHub-Quelle uebersprungen (kein Token).");
    return [];
  }
  const sinceDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const queries = [
    `topic:mcp+created:>${sinceDate}`,
    `topic:model-context-protocol+created:>${sinceDate}`,
    `topic:llm-agent+created:>${sinceDate}`,
    `react-native+expo+created:>${sinceDate}`,
  ];
  const findings = [];
  for (const query of queries) {
    try {
      const payload = await fetchJson(
        `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=10`,
        { Accept: "application/vnd.github+json", Authorization: `Bearer ${GITHUB_TOKEN}` },
      );
      for (const repo of payload.items ?? []) {
        findings.push({
          source: "github",
          title: repo.full_name,
          url: repo.html_url,
          description: `${repo.description ?? ""} Topics: ${(repo.topics ?? []).join(", ")}`,
          stars: repo.stargazers_count ?? 0,
        });
      }
    } catch (error) {
      console.warn(`[tech-scanner] GitHub-Query fehlgeschlagen (${query}):`, error.message);
    }
  }
  console.log(`[tech-scanner] GitHub: ${findings.length} Rohdaten.`);
  return findings;
}

/** 2) Hugging Face: aktuellste Text-Generations-Modelle. */
async function scanHuggingFace() {
  try {
    const payload = await fetchJson("https://huggingface.co/api/models?pipeline_tag=text-generation&sort=createdAt&direction=-1&limit=50");
    const findings = (Array.isArray(payload) ? payload : []).slice(0, 40).map((model) => ({
      source: "huggingface",
      title: model.modelId ?? model.id,
      url: `https://huggingface.co/${model.modelId ?? model.id}`,
      description: `Neues HF-Modell. Downloads: ${model.downloads ?? 0}, Likes: ${model.likes ?? 0}`,
      stars: model.likes ?? 0,
    }));
    console.log(`[tech-scanner] Hugging Face: ${findings.length} Rohdaten.`);
    return findings;
  } catch (error) {
    console.warn("[tech-scanner] Hugging Face fehlgeschlagen:", error.message);
    return [];
  }
}

/** 3) npm: aktuellste Versionen der Kern-Abhaengigkeiten gegen package.json. */
async function scanNpm() {
  let localVersions = {};
  if (existsSync("package.json")) {
    try {
      localVersions = JSON.parse(await readFile("package.json", "utf-8")).dependencies ?? {};
    } catch {
      // package.json unlesbar → nur Remote-Stand melden
    }
  }
  const findings = [];
  for (const name of NPM_WATCHED) {
    try {
      const payload = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
      findings.push({
        source: "npm",
        title: `${name} ${payload.version}`,
        url: `https://www.npmjs.com/package/${name}`,
        description: `Aktuellste npm-Version. Lokal installiert: ${localVersions[name] ?? "unbekannt"}${payload.description ? `. ${payload.description}` : ""}`,
        version: payload.version,
      });
    } catch (error) {
      console.warn(`[tech-scanner] npm fehlgeschlagen (${name}):`, error.message);
    }
  }
  console.log(`[tech-scanner] npm: ${findings.length} Rohdaten.`);
  return findings;
}

async function main() {
  console.log(`[tech-scanner] Start ${SCAN_DATE}`);
  const findings = [...(await scanGitHub()), ...(await scanHuggingFace()), ...(await scanNpm())];
  const selected = selectReportFindings(findings);
  const report = formatTechScanReport(selected, SCAN_DATE);
  await mkdir("docs/research", { recursive: true });
  await writeFile("docs/research/LATEST_TECH_SCAN.md", report, "utf-8");
  console.log(`[tech-scanner] ${selected.length} relevante Funde → docs/research/LATEST_TECH_SCAN.md`);
}

main().catch((error) => {
  console.error("[tech-scanner] Fatal:", error);
  process.exit(1);
});
