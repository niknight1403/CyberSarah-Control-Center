/**
 * CyberSarah Control Center — Custom-Game-Entwicklung (Sprint 166, Stufe 2)
 *
 * VOLLAUTONOME Entwicklung eines EIGENEN Spiels aus einer Idee:
 *
 * 1. GENERIERUNG: freier LLM-Codegenerator (Managed-Kaskade oder lokales
 *    Ollama, max_tokens deutlich hoeher als bei der Deko-Personalisierung)
 *    erzeugt ein vollstaendiges Single-File-HTML5-Spiel.
 * 2. SANDBOX-HAERTE: sanitizeGeneratedGame() entfernt externe Ressourcen
 *    und lehnt eval/Netzwerk-Muster ab (Issues -> Fix-Schleife/Abbruch).
 * 3. VERIFIKATION: node --check auf das Inline-Script + Strukturpruefung;
 *    bei Fehlern AUTONOME Fix-Schleife: das LLM erhaelt die Issues und
 *    generiert nach (bis MAX_CUSTOM_FIX_ITERATIONS, dann ehrlicher Fallback).
 * 4. OFFLINE-FALLBACK: ohne jeden API-Key wird die Idee per Schluesselwort
 *    auf das naechste deterministische Spiel-Template gemappt (ehrlich
 *    als template_fallback markiert — die Kette liefert IMMER).
 * 5. LIEFERUNG: Artefakt ins Workspace + gemeinsames Run-Ledger (cost 0).
 */

import axios from "axios";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { isFreeManagedSource, resolveManagedLlmEndpoint, type ManagedLlmEnv } from "../lib/managed-llm-fallback-logic";
import {
  buildCustomLabel,
  buildCustomGamePrompt,
  buildCustomSlug,
  extractGeneratedGame,
  matchTemplateForIdea,
  sanitizeGeneratedGame,
  validateGeneratedGame,
} from "../lib/custom-game-logic";
import {
  buildArtifact,
  extractScript,
  planProject,
  type ProjectSpec,
} from "../lib/autonomous-dev-logic";
import { appendRunToLedger, type AutonomousDevRun } from "./autonomous-dev";

const MAX_CUSTOM_FIX_ITERATIONS = 3;
const OLLAMA_BASE = () => (process.env.AI_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");

export interface CustomGameRun extends AutonomousDevRun {
  /** Ehrlicher Quellen-Nachweis des generierten Codes. */
  codeSource: "free_cloud_llm" | "local_ollama" | "template_fallback";
}

function verifyScriptSyntax(html: string): boolean {
  const script = extractScript(html);
  if (!script) return false;
  const tmpPath = join(tmpdir(), `cybersarah-custom-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
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

interface GenerationAttempt {
  html: string | null;
  source: "free_cloud_llm" | "local_ollama" | "template_fallback";
  issues: string[];
}

async function generateFromEndpoint(
  url: string,
  headers: Record<string, string>,
  model: string,
  prompt: string,
  apiKey?: string,
): Promise<string | null> {
  try {
    const response = await axios.post(
      url,
      {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 8_000,
      },
      {
        headers: apiKey ? { ...headers, Authorization: `Bearer ${apiKey}` } : headers,
        timeout: 60_000,
        validateStatus: (status) => status === 200,
      },
    );
    const content: string = response.data?.choices?.[0]?.message?.content ?? "";
    return extractGeneratedGame(content);
  } catch {
    return null; // Fehlschlag -> naechste kostenlose Stufe.
  }
}

async function generateCustomGame(idea: string, fixIssues: string[]): Promise<GenerationAttempt> {
  const prompt = fixIssues.length
    ? `${buildCustomGamePrompt(idea)}\n\nDER LETZTE VERSUCH SCHEITERTE AN DIESEN PRUEFPROBLEMEN — BEHEBE SIE EXPLIZIT:\n${fixIssues
        .map((issue, i) => `${i + 1}. ${issue}`)
        .join("\n")}`
    : buildCustomGamePrompt(idea);

  // Stufe 1: Kostenloser Managed-Endpoint (Groq > OpenRouter :free > Gemini).
  const endpoint = resolveManagedLlmEndpoint(process.env as unknown as ManagedLlmEnv);
  if (endpoint && isFreeManagedSource(endpoint.source)) {
    const html = await generateFromEndpoint(
      endpoint.url,
      endpoint.headers ?? {},
      process.env.MANAGED_CODEGEN_MODEL ?? "llama-3.3-70b-versatile",
      prompt,
      endpoint.apiKey,
    );
    if (html) return { html, source: "free_cloud_llm", issues: [] };
  }

  // Stufe 2: Lokales Ollama — unbegrenzt, offline, 0 EUR.
  const localHtml = await generateFromEndpoint(
    `${OLLAMA_BASE()}/v1/chat/completions`,
    {},
    process.env.OLLAMA_CODEGEN_MODEL ?? "qwen2.5-coder:7b",
    prompt,
  );
  if (localHtml) return { html: localHtml, source: "local_ollama", issues: [] };

  return { html: null, source: "template_fallback", issues: ["Kein freier LLM-Endpoint erreichbar"] };
}

/** Fuehrt die vollautonome Custom-Spiel-Entwicklung aus (nie stumm). */
export async function runCustomGameDevelopment(input: { idea: string; wish?: string }): Promise<CustomGameRun> {
  const idea = input.idea.trim();
  if (idea.length < 3) {
    throw new Error("IDEE_ZU_KURZ: Bitte die Spielidee mit mindestens 3 Zeichen beschreiben.");
  }

  const startedAt = new Date();
  const slug = buildCustomSlug(idea);
  const label = buildCustomLabel(idea);
  let deliveredHtml: string | null = null;
  let codeSource: CustomGameRun["codeSource"] = "template_fallback";
  let iterations = 0;
  let validation = { ok: false, issues: ["noch keine Generierung"] };

  while (iterations < MAX_CUSTOM_FIX_ITERATIONS) {
    iterations += 1;
    const attempt = await generateCustomGame(idea, validation.ok ? [] : validation.issues);
    if (attempt.html) {
      const sanitized = sanitizeGeneratedGame(attempt.html);
      validation = validateGeneratedGame(sanitized.html, verifyScriptSyntax(sanitized.html), sanitized.issues);
      if (validation.ok) {
        deliveredHtml = sanitized.html;
        codeSource = attempt.source;
        break;
      }
    } else {
      validation = { ok: false, issues: [...attempt.issues, ...validation.issues.filter((i) => i !== "noch keine Generierung")] };
    }
    if (iterations >= MAX_CUSTOM_FIX_ITERATIONS) break;
    // Fix-Iteration: Issues gehen als explizite Nachfrage zurueck ins LLM.
  }

  // Stufe 3: Offline-Fallback — Template-Match auf die Idee (immer lieferfaehig).
  if (!deliveredHtml) {
    const match = matchTemplateForIdea(idea);
    if (!match) {
      throw new Error(
        `GENERIERUNG_GESCHEITERT: Kein freier LLM erreichbar und die Idee passt auf kein Template. Issues: ${JSON.stringify(validation.issues)}`,
      );
    }
    const spec: ProjectSpec = { kind: match.template, wish: idea };
    const plan = planProject(spec);
    deliveredHtml = buildArtifact(spec, {});
    codeSource = "template_fallback";
    validation = { ok: true, issues: [`Kein freier LLM verfuegbar — ehrlicher Fallback auf Template '${match.label}' (${plan.slug}).`] };
  }

  const artifactDir = join(process.cwd(), "artifacts", "autonomous-dev", slug);
  mkdirSync(artifactDir, { recursive: true });
  const artifactPath = join(artifactDir, "index.html");
  writeFileSync(artifactPath, deliveredHtml, "utf-8");

  const run: CustomGameRun = {
    id: `devrun-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "custom",
    label,
    wish: idea.slice(0, 500),
    slug,
    artifactPath: relativeToCwd(artifactPath),
    htmlBytes: Buffer.byteLength(deliveredHtml, "utf-8"),
    verificationOk: validation.ok,
    enhancementSource: codeSource === "template_fallback" ? "template_defaults" : codeSource,
    llmProviderUsed: codeSource,
    iterations,
    costEur: 0,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    codeSource,
  };
  await appendRunToLedger(run);
  return run;
}

function relativeToCwd(path: string): string {
  const cwd = process.cwd();
  return path.startsWith(cwd) ? path.slice(cwd.length + 1) : path;
}

