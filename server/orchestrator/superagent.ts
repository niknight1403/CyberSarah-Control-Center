/**
 * Superagenten-Runtime (Sprint 123, Sprint 150: Zero-Cost-Multi-Provider-Failover).
 *
 * Verknuepft das Agenten-Framework mit der Tool-Registry und dem State-Store.
 * Der hinterlegte System-Prompt erzwingt: autonome Task-Decomposition,
 * Verifizierung nach jedem Schritt, strukturierte Selbstkorrektur (maximal 3
 * Iterationen vor Eskalation) und Sicherheit fuer destruktive Operationen.
 *
 * Sprint 150 — Root-Cause-Fix: Der Superagent war bisher fest an
 * OPENAI_API_KEY verdrahtet (server/_core/llm.ts::callLlm rief direkt
 * api.openai.com auf). Sobald das OpenAI-Konto keine Credits mehr hatte
 * ("insufficient_quota"/"credit_balance_exhausted"), eskalierte JEDE
 * Superagent-Aufgabe nach 3 Iterationen — obwohl der App bereits ein
 * funktionierender Zero-Cost-Multi-Provider-Router (invokeLLM, server/_core/
 * llm.ts) mit autonomer Key-Rotation ueber Groq/OpenRouter/Gemini-Free-Tier
 * zur Verfuegung stand (siehe modelRouterSettings.healthSnapshot: "managed"
 * war durchgehend "ready"). Der Superagent nutzt diesen Router jetzt genauso
 * wie der Entwicklungs-Chat (development-chat.ts) — unabhaengig vom
 * Kreditstand eines einzelnen Anbieters.
 *
 * Konfiguration (ENV):
 *   - OLLAMA_BASE_URL     gesetzt = lokales Ollama wird genutzt (explizite
 *                         Admin-Wahl, hat Vorrang vor der Cloud-Kette)
 *   - ORCHESTRATOR_MODEL  Optionaler Modellname-Override fuer die Cloud-Kette
 *                         (leer = automatische Modellwahl je Anbieter)
 */

import { invokeLLM, type Message as LlmMessage, type Tool as LlmTool } from "../_core/llm";
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

Abschluss: Wenn das Ziel erreicht ist, antworte OHNE Tool-Aufruf mit einer klaren, freundlichen Zusammenfassung direkt fuer den Nutzer (Deutsch):
- Was hast du getan? (2-4 kurze Saetze oder Stichpunkte)
- Was ist das Ergebnis?
- Welche naechsten Schritte sind sinnvoll?
Schreibe in normalen Worten, verstaendlich auch fuer Nicht-Techniker. KEIN JSON, keine Code-Dumps, keine Tool-Protokolle oder Rohdaten — ausser der Nutzer fragt ausdruecklich danach.
Wenn du das Ziel nach 3 Iterationen NICHT erreichen konntest, schreibe ebenfalls eine verstaendliche Zusammenfassung (was du versucht hast, was blockiert) und ergaenze als letzte eigene Zeile genau: STATUS: escalated

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
  mode: "ollama" | "cloud";
  baseUrl: string;
  model?: string;
}

function resolveLlmConfig(): LlmConfig {
  const ollamaUrl = process.env.OLLAMA_BASE_URL;
  if (ollamaUrl) {
    return { mode: "ollama", baseUrl: ollamaUrl.replace(/\/$/, ""), model: process.env.ORCHESTRATOR_MODEL ?? "llama3.1" };
  }
  // Cloud-Pfad: kein fester Provider mehr — Modellwahl bleibt optional
  // (leer = der Router waehlt je Anbieter automatisch ein Standardmodell).
  return { mode: "cloud", baseUrl: "", model: process.env.ORCHESTRATOR_MODEL || undefined };
}

/** Lokaler Ollama-Aufruf (OpenAI-kompatibel, kein API-Key). Explizite Admin-Wahl. */
async function callOllama(config: LlmConfig, messages: ChatMessage[]): Promise<ChatMessage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

/**
 * Cloud-Aufruf ueber den zentralen Zero-Cost-Multi-Provider-Router
 * (server/_core/llm.ts::invokeLLM) — derselbe Router, den auch der
 * Entwicklungs-Chat nutzt. Rotiert autonom ueber Groq/OpenRouter/Gemini
 * Free-Tier-Keys und weicht auf Forge/OpenAI nur aus, wenn kein Gratis-Key
 * konfiguriert ist oder der Administrator AI_ALLOW_PAID_LLM_FALLBACK=true
 * gesetzt hat. Ein einzelner erschoepfter Provider (z. B. OpenAI ohne
 * Credits) blockiert damit nicht mehr den gesamten Superagenten.
 */
async function callManagedCloud(config: LlmConfig, messages: ChatMessage[]): Promise<ChatMessage> {
  const result = await invokeLLM({
    messages: messages as unknown as LlmMessage[],
    tools: getToolDefinitions() as unknown as LlmTool[],
    toolChoice: "auto",
    maxTokens: 1_800,
    ...(config.model ? { model: config.model } : {}),
  });
  const choice = result.choices?.[0]?.message;
  if (!choice) throw new Error("LLM-API: keine Antwort-Message erhalten.");
  return choice as ChatMessage;
}

async function callLlm(config: LlmConfig, messages: ChatMessage[]): Promise<ChatMessage> {
  return config.mode === "ollama" ? callOllama(config, messages) : callManagedCloud(config, messages);
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
 * Dark-Cyber-Chat-Qualitaet: Die finale Antwort wird NIE als rohes JSON oder
 * Tool-Protokoll an den Nutzer ausgeliefert.
 *  - Klartext wird direkt verwendet (der optionale "STATUS: escalated"-Marker
 *    wird nur zur Statuserkennung entfernt).
 *  - Antworten aelterer Modelle im Legacy-JSON-Format {"status","summary",
 *    "steps","result"} werden automatisch in natuerlichen Text uebersetzt.
 */
function formatFinalAnswerForUser(raw: string): { text: string; escalated: boolean } {
  const content = (raw ?? "").trim();
  if (!content) return { text: "", escalated: false };

  const escalatedByMarker = /(^|\n)\s*STATUS:\s*escalated\b/i.test(content);
  const stripped = content.replace(/(^|\n)\s*STATUS:\s*escalated\b[^\n]*/gi, "").trim();

  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const summary = typeof record.summary === "string" ? record.summary.trim() : "";
      if (summary || typeof record.blocker === "string") {
        const parts: string[] = [summary || String(record.blocker ?? "")];
        if (Array.isArray(record.steps)) {
          const steps = record.steps.map((step) => String(step)).filter((step) => step.trim().length > 0);
          if (steps.length > 0) parts.push("Schritte: " + steps.join(" · "));
        }
        if (record.result != null && typeof record.result !== "object") parts.push(`Ergebnis: ${String(record.result).slice(0, 500)}`);
        return {
          text: parts.filter((part) => part.trim().length > 0).join("\n\n"),
          escalated: record.status === "escalated" || escalatedByMarker,
        };
      }
    }
  } catch {
    // Kein JSON — normaler Klartext, genau wie gewuenscht.
  }
  return { text: stripped || content, escalated: escalatedByMarker };
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
      const assistantMessage = await callLlm(config, messages);
      const toolCalls = assistantMessage.tool_calls ?? [];

      if (toolCalls.length === 0) {
        // Finale Antwort des Superagenten — nutzerfreundlich als Klartext
        // abschliessen (kein rohes JSON im Chat).
        const content = assistantMessage.content ?? "";
        const formatted = formatFinalAnswerForUser(content);
        finalAnswer = formatted.text;
        await appendStepLog(task.id, step.id, `Finale Antwort: ${content.slice(0, 400)}`);
        await updateStep(task.id, step.id, { status: formatted.escalated ? "failed" : "success", result: finalAnswer });
        await finishTask(task.id, formatted.escalated ? "escalated" : "success", finalAnswer);
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
