import { callAIWithFallback } from "../ai-fallback.js";
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

import { describeLlmError } from "../../lib/llm-error-logic";
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
6. AUTONOME REPO-ENTWICKLUNG (Sprint 198): Du entwickelst das eigene Projekt (CyberSarah-Control-Center) selbststaendig weiter — wie ein Senior-Engineer im Chat. Ablauf bei Entwicklungs- oder Fix-Auftraegen: (a) git.getFileContents zum Lesen relevanter Dateien, (b) Aenderung ueberlegen, (c) git.commitFile mit Konventions-Commit (feat/fix/chore(scope): ...), (d) bei groesseren Arbeiten git.createBranch + git.createPullRequest, (e) Infrastruktur-Operationen (Deploy, DB-Migration, PM2) ueber git.dispatchServerOps anstossen und danach den Status verifizieren. Stelle KEINE Rückfragen, wenn du mit den Tools selbststaendig zum Ziel kommst — integriere fehlende Zugriffe autonom (Repo-Zugriff steht dir serverseitig zur Verfuegung).

Abschluss: Wenn das Ziel erreicht ist, antworte OHNE Tool-Aufruf mit einer klaren, freundlichen Zusammenfassung direkt fuer den Nutzer (Deutsch).

Festes Antwortformat (Markdown, fuer gut lesbare Karten im UI):
### Ergebnis
Ein-zwei Saetze: Was steht jetzt? (Kernantwort zuerst — der wichtigste Punkt in der ersten Zeile)
### Was ich getan habe
- Maximal 3-5 kurze Stichpunkte, jeder eine Zeile.
### Naechste Schritte
- Maximal 2-3 konkrete, sinnvolle Vorschlaege.

Regeln fuer Uebersichtlichkeit:
- Praegnant statt ausfuehrlich: keine Einleitungsfloskeln, keine Wiederholung der Frage, keine Fuellsaetze.
- Schreibe in normalen Worten, verstaendlich auch fuer Nicht-Techniker. Fachbegriffe kurz erklaeren.
- KEIN JSON, keine Code-Dumps, keine Tool-Protokolle, IDs, Log-Zeilen oder Rohdaten — ausser der Nutzer fragt ausdruecklich danach.
- Zahlen und Status ehrlich nennen (z. B. Tests 3 von 3 gruen), nie beschoenigen.
Wenn du das Ziel nach 3 Iterationen NICHT erreichen konntest, schreibe ebenfalls eine verstaendliche Zusammenfassung im selben Format (### Ergebnis mit dem Blocker, ### Was ich versucht habe) und ergaenze als letzte eigene Zeile genau: STATUS: escalated

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
  try {
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
  } catch (error: any) {
    console.warn(`⚠️ Cloud-Provider Limit/Fehler erreicht (${error.message}). Wechsle zu lokalem Ollama-Fallback...`);
    const localUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
    const ollamaConfig: LlmConfig = {
      mode: "ollama",
      baseUrl: localUrl,
      model: process.env.ORCHESTRATOR_MODEL ?? "llama3.1",
    };
    return await callOllama(ollamaConfig, messages);
  }
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
  /** Sprint 197 — bisheriger Dialog-Verlauf (wie im Entwicklungs-Chat), damit
   * der Superagent auf Nachfragen und Folgeaufgaben kontextuell antwortet. */
  history?: { role: "user" | "assistant"; content: string }[];
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
    ...(input.history ?? []).map((entry): ChatMessage => ({ role: entry.role, content: entry.content })),
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
          await finishTask(
            task.id,
            "escalated",
            "Ich konnte die Aufgabe nicht abschließen: Drei aufeinanderfolgende Tool-Fehlerrunden. Ich habe eskaliert, damit ein Administrator eingreifen kann.",
          );
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
        await finishTask(
          task.id,
          "escalated",
          `Ich konnte die Aufgabe nicht abschließen: Wiederholter Laufzeitfehler nach ${iterations} Iterationen (${describeLlmError(message)}). Ich habe eskaliert, damit ein Administrator eingreifen kann.`,
        );
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
    await finishTask(
      task.id,
      "failed",
      `Ich konnte innerhalb von ${maxRounds} Runden keine finale Antwort erreichen. Bitte formuliere das Ziel enger oder versuche es erneut.`,
    );
    return (await getTask(task.id)) ?? finalTask;
  }
  return finalTask;
}
