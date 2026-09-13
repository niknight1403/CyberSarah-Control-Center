/**
 * Sprint 85 — Default-Modell des On-Server-Providers.
 *
 * Ohne explizites Modell (z. B. beim KI-Verbindungstest oder wenn der Client
 * keins mitschickt) hat invokeLLM keinen model-Parameter gesetzt, was OpenAI
 * mit 400 "you must provide a model parameter" ablehnt. Die Aufloesung ist
 * deterministisch: angefordertes Modell > AI_MANAGED_MODEL > OPENAI_MODEL >
 * AI_OPENAI_MODEL > gpt-4o-mini.
 */
export function resolveManagedModel(
  requestedModel: string | undefined,
  env: Record<string, string | undefined> = process.env,
): string {
  const requested = requestedModel?.trim();
  if (requested) return requested;
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
