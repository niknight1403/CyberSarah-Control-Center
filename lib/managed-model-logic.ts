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
export type ManagedModelSource = "forge" | "gemini" | "openai" | "groq" | "openrouter";

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
