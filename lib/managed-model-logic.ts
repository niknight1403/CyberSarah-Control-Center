/**
 * Sprint 85 — Managed-Modell-Aufloesung pro Endpoint-Source.
 * Gemini-Modell, Forge/OpenAI ein OpenAI-Modell. Die Aufloesung ist
 * deterministisch und ohne ENV-Zugriff testbar.
 *
 * Sprint 108 — Zero-Cost-Routing: Groq- und OpenRouter-Endpoints bekommen
 * eigene Gratis-Defaults (openai/gpt-oss-20b / Free-Instruct-Modell),
 * damit der Managed-Aufruf ohne manuelle Konfiguration ein funktionsfaehiges
 * KOSTENFREIES Modell pro Source waehlt.
 */
/**
 * Sprint 349 — Ollama-Fleet-Default: Ohne explizites AI_OLLAMA_MODEL waehlt
 * die Aufloesung das Chat-Tier der Qwen-2.5-Leiter (kleinstes ausreichendes
 * Modell = qwen2.5:1.5b) statt blind des Coder-7B. Die Leiter liegt voll
 * vor, wenn scripts/ollama-server-setup.sh gelaufen ist.
 */
import { pickQwenForTask, QWEN_LADDER } from "./ollama-fleet-logic";

export type ManagedModelSource =
  | "forge"
  | "gemini"
  | "openai"
  | "groq"
  | "openrouter"
  | "custom"
  | "local-ollama"
  | "local-lmstudio";

/**
 * Sprint 385 — Modellfrische der Gratis-Kette.
 *
 * Anbieter ziehen Modelle regelmaessig zurueck (OpenRouter deaktivierte
 * llama-3.3-70b-instruct:free; Groq rotiert gpt-oss-Tiere). Auto-aufgeloeste
 * Modelle werden deshalb als geordnete Kandidatenliste geliefert: invokeLLM
 * probiert bei 404/400 (Modell-Ruhestand) den naechsten Kandidaten desselben
 * Endpoints, bevor die Provider-Kette weiterschaltet.
 *
 * Beide Listen am 30.09.2026 gegen die Live-Modelllisten verifiziert
 * (tools/free-llm-changer/changer-status.json).
 */
export const OPENROUTER_FREE_MODEL_CANDIDATES = [
  "qwen/qwen3.8-27b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "inclusionai/ling-3.0-flash-sante:free",
  "liquid/lfm-2.5-2.6b:free",
  "nvidia/nemotron-3.5-lightning:free",
] as const;

export const GROQ_MODEL_CANDIDATES = [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
] as const;

/** Geordnete Kandidaten je Source; ENV-Override fuehrt als einziger Kandidat. */
export function resolveManagedModelCandidates(
  source: ManagedModelSource,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const override =
    source === "openrouter"
      ? env.AI_OPENROUTER_MODEL?.trim()
      : source === "groq"
        ? env.AI_GROQ_MODEL?.trim()
        : source === "gemini"
          ? env.AI_GEMINI_MODEL?.trim()
          : undefined;
  if (override) return [override];
  switch (source) {
    case "openrouter":
      return [...OPENROUTER_FREE_MODEL_CANDIDATES];
    case "groq":
      return [...GROQ_MODEL_CANDIDATES];
    case "gemini":
      // Google-Alias: routet serverseitig immer auf ein aktuelles Flash-Modell.
      return ["gemini-flash-latest"];
    default:
      return [resolveManagedModel(undefined, source, env)];
  }
}

export function resolveManagedModel(
  requestedModel: string | undefined,
  source: ManagedModelSource,
  env: Record<string, string | undefined> = process.env,
): string {
  const requested = requestedModel?.trim();
  if (requested) return requested;

  if (source === "gemini") {
    return env.AI_GEMINI_MODEL?.trim() || "gemini-flash-latest";
  }

  if (source === "groq") {
    return env.AI_GROQ_MODEL?.trim() || "openai/gpt-oss-20b";
  }

  if (source === "local-ollama") {
    return env.AI_OLLAMA_MODEL?.trim() || (pickQwenForTask("chat", QWEN_LADDER) ?? "qwen2.5:1.5b");
  }

  if (source === "local-lmstudio") {
    return env.AI_LMSTUDIO_MODEL?.trim() || "local-model";
  }

  if (source === "custom") {
    // Sprint 194 — Custom-Endpoint: Modell aus AI_CUSTOM_MODEL, sonst wie
    // Managed/OpenAI aufloesen (offene Schnittstelle, Admin bestimmt).
    const customModel = env.AI_CUSTOM_MODEL?.trim();
    if (customModel) return customModel;
  }

  if (source === "openrouter") {
    // Sprint 385 — Modellfrische: altes Default (llama-3.3-70b-instruct:free)
    // wurde von OpenRouter zurueckgezogen; erster Kandidat der am
    // 30.09.2026 live verifizierten Gratis-Liste.
    return env.AI_OPENROUTER_MODEL?.trim() || OPENROUTER_FREE_MODEL_CANDIDATES[0];
  }

  const candidates = [
    env.AI_MANAGED_MODEL,
    env.OPENAI_MODEL,
    env.AI_OPENAI_MODEL,
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return "gpt-4o-mini";
}
