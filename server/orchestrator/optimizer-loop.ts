/**
 * Autonomer Engineering-Optimizer-Loop.
 *
 * Kontinuierlicher Hintergrund-Dienst: Erhebt regelmaessig einen System-
 * Snapshot (DB-Health, Runtime-Logs, Uptime, Zyklus-Historie), laesst ihn
 * vom LLM priorisiert bewerten und startet bei Bedarf automatisch einen
 * Orchestrator-Task (runOrchestratorTask) mit dem konkreten Optimierungs-
 * ziel. Ergebnisse landen im Task-Ledger — im Superagent-Tab vollstaendig
 * nachverfolgbar.
 *
 * Konfiguration (ENV):
 *   - OPTIMIZER_LOOP_ENABLED       "false" deaktiviert den Loop (Default: an)
 *   - OPTIMIZER_LOOP_INTERVAL_MIN  Minuten zwischen Zyklen (Default: 360)
 *
 * Ehrlichkeit: Ohne konfigurierte LLM-Provider (Managed-Pool leer und kein
 * Orchestrator-LLM) bleibt der Loop ehrlich idle und meldet das im Status.
 */

import { checkDatabaseHealth, getModelRouterSetting, setModelRouterSetting } from "../db";
import { invokeLLM, type Message } from "../_core/llm";
import { getRuntimeLogs } from "../runtime-logger";
import { runOrchestratorTask } from "./superagent";
import {
  OPTIMIZER_SYSTEM_PROMPT,
  buildFindingsFromSnapshot,
  buildOptimizerAnalysisPrompt,
  estimateNextCycleAt,
  pickObjective,
  shouldRunCycle,
  type OptimizerSnapshot,
} from "../../lib/optimizer-logic";
import { extractJsonObject } from "../../lib/designer-logic";

const CYCLES_KEY = "orchestrator.optimizerCycles";
const MAX_CYCLE_ENTRIES = 30;
const LOG_WINDOW_MS = 6 * 60 * 60 * 1000; // Letzte 6 Stunden betrachten.
const MAX_ERROR_SAMPLES = 5;

export interface OptimizerCycleRecord {
  id: string;
  title: string;
  status: "success" | "failed" | "escalated" | "idle_no_llm" | "healthy_no_action";
  startedAt: string;
  finishedAt: string;
  /** LLM-Kurzbewertung des Zyklus. */
  summary: string | null;
  /** Erkannte Findings (Severity-sortiert). */
  findings: { key: string; severity: string; detail: string }[];
  /** Gestarteter Orchestrator-Task (falls Optimierung ausgeloest wurde). */
  taskId: string | null;
  trigger: "loop" | "manual";
}

interface LoopState {
  bootedAtMs: number;
  running: boolean;
  lastCycleAtMs: number | null;
  lastError: string | null;
  timer: ReturnType<typeof setInterval> | null;
}

const globalState: LoopState = {
  bootedAtMs: Date.now(),
  running: false,
  lastCycleAtMs: null,
  lastError: null,
  timer: null,
};

function intervalMinutes(): number {
  const raw = Number(process.env.OPTIMIZER_LOOP_INTERVAL_MIN ?? 0);
  if (Number.isFinite(raw) && raw >= 30 && raw <= 10080) return Math.round(raw);
  return 360;
}

function loopEnabled(): boolean {
  return (process.env.OPTIMIZER_LOOP_ENABLED ?? "true").toLowerCase() !== "false";
}

/** Ehrlicher Status fuer die UI (Superagent-Tab). */
export function getOptimizerStatus() {
  const enabled = loopEnabled();
  const nowMs = Date.now();
  return {
    enabled,
    intervalMinutes: intervalMinutes(),
    running: globalState.running,
    lastCycleAtMs: globalState.lastCycleAtMs,
    lastCycleAt: globalState.lastCycleAtMs ? new Date(globalState.lastCycleAtMs).toISOString() : null,
    lastError: globalState.lastError,
    nextCycleAt: enabled
      ? estimateNextCycleAt({
          running: globalState.running,
          lastCycleAtMs: globalState.lastCycleAtMs,
          bootedAtMs: globalState.bootedAtMs,
          nowMs,
          intervalMinutes: intervalMinutes(),
        })
      : null,
  };
}

/** Zuletzt gelaufene Zyklen (neueste zuerst, begrenzt). */
export async function listOptimizerCycles(limit = 10): Promise<OptimizerCycleRecord[]> {
  const cycles = ((await getModelRouterSetting<OptimizerCycleRecord[]>(CYCLES_KEY)) ?? []) as OptimizerCycleRecord[];
  return cycles.slice(0, Math.max(1, Math.min(limit, MAX_CYCLE_ENTRIES)));
}

async function recordCycle(record: OptimizerCycleRecord): Promise<void> {
  const cycles = ((await getModelRouterSetting<OptimizerCycleRecord[]>(CYCLES_KEY)) ?? []) as OptimizerCycleRecord[];
  const next = [record, ...cycles.filter((c) => c && c.id !== record.id)].slice(0, MAX_CYCLE_ENTRIES);
  await setModelRouterSetting(CYCLES_KEY, next);
}

/** System-Snapshot erheben (DB-Health, Runtime-Logs, Uptime, Historie). */
async function collectSnapshot(): Promise<OptimizerSnapshot> {
  let dbHealthy = true;
  try {
    dbHealthy = await checkDatabaseHealth();
  } catch {
    dbHealthy = false;
  }

  const cutoff = Date.now() - LOG_WINDOW_MS;
  const logs = getRuntimeLogs()
    .filter((entry) => entry.atMs >= cutoff)
    .filter((entry) => entry.level === "error" || entry.level === "warn");

  const errorSamples = logs
    .filter((entry) => entry.level === "error")
    .slice(-MAX_ERROR_SAMPLES)
    .map((entry) => String(entry.message ?? "").slice(0, 200));

  const lastCycles = (await listOptimizerCycles(5)).map((c) => ({
    status: c.status,
    finishedAt: c.finishedAt,
    title: c.title,
  }));

  return {
    collectedAt: new Date().toISOString(),
    dbHealthy,
    runtimeErrors: logs.filter((entry) => entry.level === "error").length,
    runtimeWarnings: logs.filter((entry) => entry.level === "warn").length,
    errorSamples,
    uptimeMinutes: (Date.now() - globalState.bootedAtMs) / 60_000,
    lastCycles,
  };
}

/**
 * Ein vollstaendiger Optimierungs-Zyklus: Snapshot → LLM-Analyse → ggf.
 * Orchestrator-Task. Laeuft maximal einmal gleichzeitig (Guard), auch bei
 * parallelem manuellen Trigger.
 */
export async function runOptimizerCycle(trigger: "loop" | "manual" = "loop"): Promise<OptimizerCycleRecord> {
  if (globalState.running) {
    throw new Error("Es laeuft bereits ein Optimierungs-Zyklus — bitte den laufenden Zyklus abwarten.");
  }
  globalState.running = true;
  globalState.lastError = null;
  const startedAt = new Date().toISOString();
  let record: OptimizerCycleRecord | null = null;
  try {
    record = await executeCycle(trigger, startedAt);
  } catch (error) {
    globalState.lastError = error instanceof Error ? error.message : String(error);
    record = {
      id: `opt-${Date.now()}`,
      title: "Auto-Optimierungszyklus",
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      summary: globalState.lastError,
      findings: [],
      taskId: null,
      trigger,
    };
  } finally {
    globalState.running = false;
    globalState.lastCycleAtMs = Date.now();
  }
  await recordCycle(record);
  return record;
}

async function executeCycle(trigger: "loop" | "manual", startedAt: string): Promise<OptimizerCycleRecord> {
  const snapshot = await collectSnapshot();
  const findings = buildFindingsFromSnapshot(snapshot);
  const base = {
    id: `opt-${Date.now()}`,
    title: trigger === "manual" ? "Manueller Optimierungszyklus" : "Auto-Optimierungszyklus",
    startedAt,
    finishedAt: new Date().toISOString(),
    findings,
    trigger,
  };

  // 1) LLM-Analyse ueber den Managed-Pool (alle konfigurierten Provider).
  const messages: Message[] = [
    { role: "system", content: OPTIMIZER_SYSTEM_PROMPT },
    { role: "user", content: buildOptimizerAnalysisPrompt(snapshot, findings) },
  ];

  let analysis: Record<string, unknown> | null = null;
  let model: string | null = null;
  try {
    const result = await invokeLLM({ messages, maxTokens: 1_600 });
    model = result.model ?? null;
    const content = result.choices?.[0]?.message?.content;
    const raw = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((part) => (typeof part === "object" && part && "text" in part && typeof part.text === "string" ? part.text : ""))
            .filter(Boolean)
            .join("\n")
        : "";
    analysis = extractJsonObject(raw);
  } catch (error) {
    // Ohne LLM ehrlich abbrechen (keine Schein-Analyse).
    return {
      ...base,
      status: "idle_no_llm",
      summary: `Kein LLM verfuegbar (${error instanceof Error ? error.message : "unbekannter Fehler"}) — Snapshot-Findings wurden gespeichert, keine Analyse/Optimierung ausgeloest.`,
      taskId: null,
    };
  }

  const summary = typeof analysis?.summary === "string" ? analysis.summary : "Analyse abgeschlossen.";
  const recommendations = Array.isArray(analysis?.recommendations)
    ? (analysis?.recommendations as Record<string, unknown>[])
    : [];

  // 2) Optimierungsziel auswaehlen und echten Orchestrator-Task starten.
  const objective = pickObjective(recommendations);
  if (!objective) {
    return {
      ...base,
      status: "healthy_no_action",
      summary: `${summary} — keine umsetzbare Empfehlung mit Impact; kein Orchestrator-Task gestartet.`,
      taskId: null,
    };
  }

  const task = await runOrchestratorTask({
    objective: objective.objective,
    title: `Optimizer: ${objective.title}`,
  });

  return {
    ...base,
    status: task.status === "success" ? "success" : task.status === "escalated" ? "escalated" : "failed",
    summary: `${summary} (Analyse-Modell: ${model ?? "unbekannt"})`,
    taskId: task.id,
  };
}

/** Loop-Singleton starten (idempotent) — Aufruf beim Server-Boot. */
export function startOptimizerLoop(): void {
  if (globalState.timer || !loopEnabled()) return;
  const tick = async () => {
    const nowMs = Date.now();
    const state = {
      running: globalState.running,
      lastCycleAtMs: globalState.lastCycleAtMs,
      nowMs,
      bootedAtMs: globalState.bootedAtMs,
      intervalMinutes: intervalMinutes(),
    };
    if (!shouldRunCycle(state)) return;
    try {
      await runOptimizerCycle("loop");
    } catch {
      // Fehler ist bereits in lastError/ Zyklus-Historie dokumentiert.
    }
  };
  globalState.timer = setInterval(() => void tick(), 60_000); // Jede Minute cadence pruefen; Intervall steuert die Ausfuehrung.
}
