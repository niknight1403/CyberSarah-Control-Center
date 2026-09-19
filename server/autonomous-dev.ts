/**
 * CyberSarah Control Center — Autonomer Entwicklungs-Agent (Sprint 164)
 *
 * Entwickelt Apps und Spiele VOLLSTAENDIG autonom und mit einer harten
 * 0-EUR-Garantie:
 *
 * 1. PLANUNG  : planProject() — jeder Schritt definitionsgemaess kostenlos.
 * 2. PERSONALISIERUNG (optional): freier LLM-Vorschlag fuer Titel/Farben/
 *    Text — bevorzugt aus der Gratis-Kette (Groq > OpenRouter :free >
 *    Gemini), sonst lokales Ollama (unbegrenzt), sonst Template-Defaults.
 *    Bezahlte Endpoints (Forge/OpenAI) werden NIE angefasst.
 * 3. GENERIERUNG: deterministische Standalone-HTML5-Templates (Canvas-
 *    Spiele + Apps mit localStorage) — ohne Build-Tools, ohne CDN-Zwang.
 * 4. VERIFIKATION: node --check auf das Inline-Script + Strukturpruefung,
 *    autonom bis zu MAX_FIX_ITERATIONS, danach ehrlicher Abbruch.
 * 5. LIEFERUNG: Artefakt ins Workspace-Verzeichnis + Run-Ledger (KV).
 *
 * Der Agent ist damit auch OHNE jeden API-Key vollstaendig autonom
 * faehig (Offline-Modus) — der freie LLM-Schritt veredelt nur die Deko.
 */

import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import axios from "axios";
import * as db from "./db";
import { resolveFreeStack, type FreeStackSnapshot } from "../lib/free-dev-stack";
import {
  buildArtifact,
  buildEnhancementPrompt,
  evaluateArtifact,
  extractScript,
  isProjectKind,
  nextIteration,
  parseEnhancementResponse,
  planProject,
  PROJECT_CATALOG,
  type ArtifactEnhancement,
  type ProjectKind,
  type ProjectPlan,
  type ProjectSpec,
} from "../lib/autonomous-dev-logic";
import { isFreeManagedSource, resolveManagedLlmEndpoint, type ManagedLlmEnv } from "../lib/managed-llm-fallback-logic";

const LEDGER_KEY = "autonomousDev.runLedger";
const MAX_LEDGER_ENTRIES = 50;

export interface AutonomousDevRun {
  id: string;
  kind: ProjectKind;
  label: string;
  wish?: string;
  slug: string;
  artifactPath: string;
  htmlBytes: number;
  verificationOk: boolean;
  enhancementSource: "free_cloud_llm" | "local_ollama" | "template_defaults";
  llmProviderUsed?: string;
  iterations: number;
  costEur: 0;
  startedAt: string;
  completedAt: string;
}

/** Verzeichnis aller autonomen Templates (fuer die Admin-UI). */
export function getProjectCatalog() {
  return Object.entries(PROJECT_CATALOG).map(([kind, entry]) => ({
    kind,
    label: entry.label,
    description: entry.description,
  }));
}

/** Aktiver Zero-Cost-Stack inkl. Nachweis (Admin-Diagnose). */
export function getFreeStackSnapshot(): FreeStackSnapshot {
  return resolveFreeStack(process.env as unknown as Partial<ManagedLlmEnv>);
}

// ---------------------------------------------------------------------------
// Freie LLM-Personalisierung (nur Deko — niemals Logik, niemals kosten)
// ---------------------------------------------------------------------------

const OLLAMA_BASE = () => (process.env.AI_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");

async function requestEnhancementFromEndpoint(
  url: string,
  headers: Record<string, string>,
  model: string,
  prompt: string,
  apiKey?: string,
): Promise<{ enhancement: ArtifactEnhancement; provider: string } | null> {
  try {
    const response = await axios.post(
      url,
      {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 220,
      },
      {
        headers: apiKey ? { ...headers, Authorization: `Bearer ${apiKey}` } : headers,
        timeout: 9_000,
        validateStatus: (status) => status === 200,
      },
    );
    const content: string = response.data?.choices?.[0]?.message?.content ?? "";
    const enhancement = parseEnhancementResponse(content);
    if (Object.keys(enhancement).length === 0) return null;
    return { enhancement, provider: new URL(url).hostname };
  } catch {
    return null; // Jeder Fehlschlag faellt autonom auf die naechste kostenlose Stufe.
  }
}

async function enhanceWithFreeLlm(
  spec: ProjectSpec,
): Promise<{ enhancement: ArtifactEnhancement; source: AutonomousDevRun["enhancementSource"]; provider?: string }> {
  const prompt = buildEnhancementPrompt(spec);

  // Stufe 1: Kostenloser Managed-Endpoint (Groq > OpenRouter > Gemini).
  const endpoint = resolveManagedLlmEndpoint(process.env as unknown as ManagedLlmEnv);
  if (endpoint && isFreeManagedSource(endpoint.source)) {
    const result = await requestEnhancementFromEndpoint(
      endpoint.url,
      endpoint.headers ?? {},
      process.env.MANAGED_ENHANCE_MODEL ?? "llama-3.1-8b-instant",
      prompt,
      endpoint.apiKey,
    );
    if (result) return { enhancement: result.enhancement, source: "free_cloud_llm", provider: endpoint.source };
  }

  // Stufe 2: Lokales Ollama — unbegrenzt, offline, 0 EUR.
  const localResult = await requestEnhancementFromEndpoint(
    `${OLLAMA_BASE()}/v1/chat/completions`,
    {},
    process.env.OLLAMA_MODEL ?? "llama3.1",
    prompt,
  );
  if (localResult) return { enhancement: localResult.enhancement, source: "local_ollama", provider: "ollama" };

  // Stufe 3: Template-Defaults — garantiert autonom ohne jede Anbindung.
  return { enhancement: {}, source: "template_defaults" };
}

// ---------------------------------------------------------------------------
// Verifikation: node --check auf das Inline-Script
// ---------------------------------------------------------------------------

function verifyScriptSyntax(html: string): boolean {
  const script = extractScript(html);
  if (!script) return false;
  const tmpPath = join(tmpdir(), `cybersarah-autonomous-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  try {
    writeFileSync(tmpPath, script, "utf-8");
    execFileSync("node", ["--check", tmpPath], { timeout: 10_000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  } finally {
    try {
      if (existsSync(tmpPath)) execFileSync("rm", ["-f", tmpPath]);
    } catch {
      /* Temp-Datei ist irrelevant */
    }
  }
}

// ---------------------------------------------------------------------------
// Haupt-Pipeline
// ---------------------------------------------------------------------------

export async function runAutonomousDevelopment(input: { kind: string; wish?: string }): Promise<AutonomousDevRun> {
  if (!isProjectKind(input.kind)) {
    throw new Error(`UNBEKANNTER_PROJEKTTYP: '${input.kind}'. Verfuegbar: ${Object.keys(PROJECT_CATALOG).join(", ")}`);
  }
  const spec: ProjectSpec = { kind: input.kind, wish: input.wish?.slice(0, 500) };
  const plan: ProjectPlan = planProject(spec);
  const stack = getFreeStackSnapshot();
  if (!stack.zeroCost) {
    // Die autonome Entwicklung beruehrt bewusst KEINEN bezahlten Endpoint —
    // der Stack-Nachweis dokumentiert das und laeuft weiter (Offline-Stufen).
    console.warn("[autonomous-dev] " + stack.zeroCostDetail);
  }

  const startedAt = new Date();
  const enhancementResult = await enhanceWithFreeLlm(spec);
  let html = buildArtifact(spec, enhancementResult.enhancement);
  let iterations = 1;
  let verification = evaluateArtifact(html, verifyScriptSyntax(html));

  while (true) {
    const decision = nextIteration(verification, iterations, plan.maxFixIterations);
    if (decision.action === "deliver") break;
    if (decision.action === "abort") {
      throw new Error(`VERIFIKATION_GESCHEITERT: ${decision.reason} — Issues: ${JSON.stringify(verification.issues)}`);
    }
    // Fix-Iteration: ohne fremde Deko neu aufbauen (deterministisch idempotent).
    iterations += 1;
    html = buildArtifact(spec, {});
    verification = evaluateArtifact(html, verifyScriptSyntax(html));
  }

  const artifactDir = join(process.cwd(), "artifacts", "autonomous-dev", plan.slug);
  mkdirSync(artifactDir, { recursive: true });
  const artifactPath = join(artifactDir, "index.html");
  writeFileSync(artifactPath, html, "utf-8");

  const run: AutonomousDevRun = {
    id: `devrun-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind: spec.kind,
    label: plan.label,
    wish: spec.wish,
    slug: plan.slug,
    artifactPath: relativeToCwd(artifactPath),
    htmlBytes: Buffer.byteLength(html, "utf-8"),
    verificationOk: verification.ok,
    enhancementSource: enhancementResult.source,
    llmProviderUsed: enhancementResult.provider,
    iterations,
    costEur: 0,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
  };
  await appendRunToLedger(run);
  return run;
}

function relativeToCwd(path: string): string {
  const cwd = process.cwd();
  return path.startsWith(cwd) ? path.slice(cwd.length + 1) : path;
}

async function appendRunToLedger(run: AutonomousDevRun): Promise<void> {
  try {
    const ledger = (await db.getModelRouterSetting<AutonomousDevRun[]>(LEDGER_KEY)) ?? [];
    ledger.unshift(run);
    await db.setModelRouterSetting(LEDGER_KEY, ledger.slice(0, MAX_LEDGER_ENTRIES));
  } catch (error) {
    console.warn("[autonomous-dev] Run-Ledger nicht persistierbar:", error);
  }
}

export async function listRecentRuns(limit = 25): Promise<AutonomousDevRun[]> {
  try {
    const ledger = (await db.getModelRouterSetting<AutonomousDevRun[]>(LEDGER_KEY)) ?? [];
    return ledger.slice(0, limit);
  } catch {
    return [];
  }
}

/** Liest ein geliefertes Artefakt fuer die Admin-Vorschau zurueck. */
export function readArtifactHtml(artifactPath: string): string | null {
  const absolute = join(process.cwd(), artifactPath.replace(/^\/+/, ""));
  if (!existsSync(absolute)) return null;
  return readFileSync(absolute, "utf-8");
}
