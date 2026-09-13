/**
 * Sprint 85 — Default-Modell des On-Server-Providers.
 *
 * Ohne explizites Modell (z. B. beim KI-Verbindungstest oder wenn der Client
 * keins mitschickt) hat invokeLLM keinen model-Parameter gesetzt, was OpenAI
 * mit 400 "you must provide a model parameter" ablehnt. Das Default-Modell
 * muss zum aufgeloesten Endpoint passen: Ein Gemini-Endpoint braucht ein
 * Gemini-Modell, Forge/OpenAI ein OpenAI-Modell. Die Aufloesung ist
 * deterministisch und ohne ENV-Zugriff testbar.
 */
export type ManagedModelSource = "forge" | "gemini" | "openai";

export function resolveManagedModel(
  requestedModel: string | undefined,
  source: ManagedModelSource,
  env: Record<string, string | undefined> = process.env,
): string {
  const requested = requestedModel?.trim();
  if (requested) return requested;

  if (source === "gemini") {
    return env.AI_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
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
