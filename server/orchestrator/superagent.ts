/**
 * Superagenten-Runtime (Sprint 123).
 *
 * Verknuepft das Agenten-Framework (OpenAI-kompatible Cloud-API oder lokales
 * Ollama) mit der Tool-Registry und dem State-Store. Der hinterlegte System-
 * Prompt erzwingt: autonome Task-Decomposition, Verifizierung nach jedem
 * Schritt, strukturierte Selbstkorrektur (maximal 3 Iterationen vor
 * Eskalation) und Sicherheit fuer destruktive Operationen.
 *
 * Konfiguration (ENV):
 *   - ORCHESTRATOR_LLM_BASE_URL  Basis-URL (Default: https://api.openai.com/v1)
 *   - ORCHESTRATOR_MODEL         Modellname (Default: gpt-4o-mini)
 *   - OLLAMA_BASE_URL            gesetzt = lokales Ollama wird genutzt
 *   - OPENAI_API_KEY             Cloud-API-Key (falls kein Ollama)
 */

import { executeTool, getToolDefinitions } from "./tool-registry";
import {
  addStep,
  appendStepLog,
  createTask,
  finishTask,
  getTask,
  recordCorrectionIteration,
  updateStep,
  type TaskRecord,
} from "./state-store";

/** Uebergeordneter System-Prompt fuer autonomen Betrieb. */
export const SUPERAGENT_SYSTEM_PROMPT = `Du bist der Leitende Superagent und Orchestrator des "CyberSarah Control Centers".

Arbeitsweise:
1. AUTONOME PLANERSTELLUNG: Zerlege jede Aufgabe in atomare, logische Teilschritte und arbeite sie strikt nacheinander ab.
2. VERIFIZIERUNG: Verifiziere nach jedem Teilschritt das Ergebnis (Tool-Antworten pruefen, Plausibilitaet, Datenkonsistenz).
3. SELBSTKORREKTUR: Bei Fehlern analysiere die Fehlermeldung, korrigiere eigenstaendig und verifiziere erneut. Maximal 3 Korrektur-Iterationen pro Schritt, danach eskaliere (Status "escalated" mit klarer Fehlerbeschreibung).
4. SICHERHEIT: Destruktive Operationen (Reboots, Container-Neustarts) nur mit explizitem confirm=true-Parameter. Keine unsicheren oder unvalidierten destruktiven Aktionen.
5. TOOL-NUTZUNG: Nutze ausschliesslich die bereitgestellten Tools. Pruefe Fehler von Tools und reagiere strukturiert — nie blind wiederholen.

Abschluss: Wenn das Ziel erreicht ist, antworte OHNE Tool-Aufruf mit einer kompakten JSON-Zusammenfassung:
{"status":"success","summary":"...","steps":["Schritt 1: ...","Schritt 2: ..."],"result":...}
Bei Nichterreichbarkeit nach 3 Iterationen: {"status":"escalated","summary":"...","blocker":"..."}

Kommuniziere praegnant und strukturiert (Deutsch).`;

const MAX_ROUNDS_DEFAULT = 12;
const ESCALATION_THRESHOLD = 3;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}

interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string | null;
}

function resolveLlmConfig(): LlmConfig {
  const ollamaUrl = process.env.OLLAMA_BASE_URL;
  if (ollamaUrl) {
    return { baseUrl: ollamaUrl.replace(/\/$/, ""), model: process.env.ORCHESTRATOR_MODEL ?? "llama3.1", apiKey: null };
  }
  return {
    baseUrl: (process.env.ORCHESTRATOR_LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.ORCHESTRATOR_MODEL ?? "gpt-4o-mini",
    apiKey: process.env.OPENAI_API_KEY ?? null,
  };
}

async function callLlm(config: LlmConfig, messages: ChatMessage[]): Promise<ChatMessage> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        tools: getToolDefinitions(),
        tool_choice: "auto",
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`LLM-API HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const data = await response.json();
    const choice = data?.choices?.[0]?.message;
    if (!choice) throw new Error("LLM-API: keine Antwort-Message erhalten.");
    return choice as ChatMessage;
  } finally {
    clearTimeout(timeout);
  }
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Fuehrt eine Orchestrator-Aufgabe vollstaendig autonom aus:
 * Ledger-Eintrag -> LLM-Loop mit Tools -> verifizierte Schritte -> Abschluss.
 * Fehler werden pro Schritt protokolliert; nach 3 gescheiterten Iterationen
 * wird der Task eskaliert statt endlos weiterzulaufen.
 */
export async function runOrchestratorTask(input: {
  objective: string;
  title?: string;
  maxRounds?: number;
}): Promise<TaskRecord> {
  const task = await createTask({
    title: input.title ?? input.objective.slice(0, 120),
    objective: input.objective,
  });
  await finishTask(task.id, "running");

  const config = resolveLlmConfig();
  const maxRounds = Math.min(Math.max(input.maxRounds ?? MAX_ROUNDS_DEFAULT, 1), 24);
  const messages: ChatMessage[] = [
    { role: "system", content: SUPERAGENT_SYSTEM_PROMPT },
    { role: "user", content: input.objective },
  ];

  let consecutiveToolErrors = 0;
  let finalAnswer: unknown = null;

  for (let round = 0; round < maxRounds; round += 1) {
    const step = await addStep(task.id, `Runde ${round + 1}: Reasoning + Tool-Auswahl`);
    if (!step) break;
    await updateStep(task.id, step.id, { status: "running" });

    try {
      if (!config.apiKey && !process.env.OLLAMA_BASE_URL) {
        throw new Error("Kein LLM konfiguriert: weder OPENAI_API_KEY noch OLLAMA_BASE_URL gesetzt.");
      }
      const assistantMessage = await callLlm(config, messages);
      const toolCalls = assistantMessage.tool_calls ?? [];

      if (toolCalls.length === 0) {
        // Finale Antwort des Superagenten — Task abschliessen.
        const content = assistantMessage.content ?? "{}";
        try {
          finalAnswer = JSON.parse(content);
        } catch {
          finalAnswer = { summary: content };
        }
        await appendStepLog(task.id, step.id, `Finale Antwort: ${content.slice(0, 400)}`);
        await updateStep(task.id, step.id, { status: "success", result: finalAnswer });
        const escalated = (finalAnswer as Record<string, unknown> | null)?.status === "escalated";
        await finishTask(task.id, escalated ? "escalated" : "success", finalAnswer);
        break;
      }

      messages.push(assistantMessage);
      let roundHadError = false;

      for (const call of toolCalls) {
        const args = parseToolArguments(call.function.arguments);
        const toolResult = await executeTool(call.function.name, args);
        if (!toolResult.ok) roundHadError = true;
        await appendStepLog(
          task.id,
          step.id,
          `Tool ${call.function.name}(${JSON.stringify(args).slice(0, 200)}) -> ${toolResult.ok ? "ok" : `FEHLER: ${toolResult.error}`}`,
        );
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(toolResult).slice(0, 4000),
        });
      }

      if (roundHadError) {
        consecutiveToolErrors += 1;
        const iterations = await recordCorrectionIteration(task.id);
        await updateStep(task.id, step.id, {
          status: consecutiveToolErrors >= ESCALATION_THRESHOLD ? "failed" : "success",
          error: `Korrektur-Iteration ${iterations} nach Tool-Fehlern`,
        });
        if (iterations >= ESCALATION_THRESHOLD) {
          await finishTask(task.id, "escalated", {
            status: "escalated",
            summary: "Drei aufeinanderfolgende Tool-Fehlerrunden — Eskalation an den Administrator.",
          });
          break;
        }
      } else {
        consecutiveToolErrors = 0;
        await updateStep(task.id, step.id, { status: "success" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const iterations = await recordCorrectionIteration(task.id);
      await appendStepLog(task.id, step.id, `Laufzeitfehler: ${message}`);
      await updateStep(task.id, step.id, { status: "failed", error: message });
      if (iterations >= ESCALATION_THRESHOLD) {
        await finishTask(task.id, "escalated", {
          status: "escalated",
          summary: `Wiederholter Laufzeitfehler nach ${iterations} Iterationen: ${message}`,
        });
        break;
      }
      // Fehler dem LLM zur Selbstkorrektur zurueckmelden.
      messages.push({
        role: "user",
        content: `Systemfehler in der letzten Runde: ${message}. Analysiere den Fehler und korrigiere eigenstaendig.`,
      });
    }
  }

  const finalTask = (await getTask(task.id)) ?? task;
  if (finalTask.status === "running") {
    await finishTask(task.id, "failed", {
      status: "failed",
      summary: `Maximale Rundenzahl (${maxRounds}) erreicht, ohne finale Antwort.`,
    });
    return (await getTask(task.id)) ?? finalTask;
  }
  return finalTask;
}
