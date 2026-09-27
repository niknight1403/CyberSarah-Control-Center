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
    // OpenRouter Free-Tier-Modell (kostenlos, ENV ueberschreibbar).
    return env.AI_OPENROUTER_MODEL?.trim() || "meta-llama/llama-3.3-70b-instruct:free";
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
