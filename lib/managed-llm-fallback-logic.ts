/**
 * Sprint 53 — Zero-Config-Fallback fuer den Managed-LLM-Aufruf.
 *
 * Pure Logik: Liest nur das uebergebene ENV-Objekt und entscheidet, welcher
 * Endpoint + Key fuer den "managed"-Provider verwendet wird. Ohne Forge-Key
 * (BUILT_IN_FORGE_API_KEY) weicht der Aufruf automatisch auf den OpenAI-
 * Endpoint aus, sobald serverseitig ein OpenAI-Key (AI_OPENAI_API_KEY oder
 * OPENAI_API_KEY) vorliegt — der Chat bleibt damit ohne manuelles Setup
 * ansprechbar, statt mit einem Konfigurationsfehler abzusterben.
 */

export type ManagedLlmEndpoint = {
  url: string;
  apiKey: string;
  source: "forge" | "openai";
};

export type ManagedLlmEnv = {
  forgeApiUrl?: string;
  forgeApiKey?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
};

const OPENAI_DEFAULT_URL = "https://api.openai.com/v1/chat/completions";

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Resolve den Endpoint fuer den Managed-Provider:
 * 1. Forge-Key vorhanden → Forge-Endpoint (BUILT_IN_FORGE_API_URL, Default forge.manus.im)
 * 2. sonst OpenAI-Key vorhanden → OpenAI-Endpoint (AI_OPENAI_BASE_URL, Default api.openai.com)
 * 3. sonst null mit Grundmeldung (Aufrufer entscheidet ueber die Fehler-Semantik)
 */
export function resolveManagedLlmEndpoint(env: ManagedLlmEnv): ManagedLlmEndpoint | null {
  const forgeKey = clean(env.forgeApiKey);
  if (forgeKey) {
    const forgeUrl = clean(env.forgeApiUrl);
    const url = forgeUrl ? `${forgeUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
    return { url, apiKey: forgeKey, source: "forge" };
  }

  const openaiKey = clean(env.openaiApiKey);
  if (openaiKey) {
    const openaiUrl = clean(env.openaiBaseUrl);
    return { url: openaiUrl ?? OPENAI_DEFAULT_URL, apiKey: openaiKey, source: "openai" };
  }

  return null;
}

/** Fehlermeldung, wenn gar kein Key konfiguriert ist. */
export const MANAGED_LLM_NO_KEY_MESSAGE =
  "OPENAI_API_KEY is not configured (weder Forge- noch OpenAI-Key serverseitig gesetzt).";
