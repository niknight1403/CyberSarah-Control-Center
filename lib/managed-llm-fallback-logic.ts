/**
 * Sprint 53 — Zero-Config-Fallback fuer den Managed-LLM-Aufruf.
 *
 * Pure Logik: Liest nur das uebergebene ENV-Objekt und entscheidet, welcher
 * Endpoint + Key fuer den "managed"-Provider verwendet wird. Ohne Forge-Key
 * (BUILT_IN_FORGE_API_KEY) weicht der Aufruf automatisch auf den OpenAI-
 * Endpoint aus, sobald serverseitig ein OpenAI-Key (AI_OPENAI_API_KEY oder
 * OPENAI_API_KEY) vorliegt — der Chat bleibt damit ohne manuelles Setup
 * ansprechbar, statt mit einem Konfigurationsfehler abzusterben.
 *
 * Sprint 85 — Gemini als zweite Fallback-Stufe: Der OpenAI-Key des Projekts
 * ist credits-leer (429 "You have no credits remaining"), Gemini hat dagegen
 * ein funktionierendes Free-Tier und einen OpenAI-kompatiblen Endpoint. Die
 * Kette ist deshalb Forge > Gemini > OpenAI: Ein funktionsfaehiger Free-Tier-
 * Key wird bewusst vor dem evtl. credits-leeren OpenAI-Key bevorzugt.
 */

export type ManagedLlmEndpoint = {
  url: string;
  apiKey: string;
  source: "forge" | "gemini" | "openai";
};

export type ManagedLlmEnv = {
  forgeApiUrl?: string;
  forgeApiKey?: string;
  geminiApiKey?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
};

const OPENAI_DEFAULT_URL = "https://api.openai.com/v1/chat/completions";

/** Gemini-Endpoint mit OpenAI-kompatibler Schnittstelle. */
export const GEMINI_OPENAI_COMPAT_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * Resolve den Endpoint fuer den Managed-Provider:
 * 1. Forge-Key vorhanden → Forge-Endpoint (BUILT_IN_FORGE_API_URL, Default forge.manus.im)
 * 2. sonst Gemini-Key vorhanden → Gemini-OpenAI-kompatibler Endpoint
 * 3. sonst OpenAI-Key vorhanden → OpenAI-Endpoint (AI_OPENAI_BASE_URL, Default api.openai.com)
 * 4. sonst null mit Grundmeldung (Aufrufer entscheidet ueber die Fehler-Semantik)
 */
export function resolveManagedLlmEndpoint(env: ManagedLlmEnv): ManagedLlmEndpoint | null {
  const forgeKey = clean(env.forgeApiKey);
  if (forgeKey) {
    const forgeUrl = clean(env.forgeApiUrl);
    const url = forgeUrl ? `${forgeUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
    return { url, apiKey: forgeKey, source: "forge" };
  }

  const geminiKey = clean(env.geminiApiKey);
  if (geminiKey) {
    return { url: GEMINI_OPENAI_COMPAT_URL, apiKey: geminiKey, source: "gemini" };
  }

  const openaiKey = clean(env.openaiApiKey);
  if (openaiKey) {
    const openaiUrl = clean(env.openaiBaseUrl);
    return { url: openaiUrl ?? OPENAI_DEFAULT_URL, apiKey: openaiKey, source: "openai" };
  }

  return null;
}

/**
 * Sprint 85 — Alle verfuegbaren Managed-Endpoints in Ketten-Prioritaet
 * (Forge > Gemini > OpenAI). Grundlage fuer den autonomen Key-Pool:
 * invokeLLM rotiert bei 429/Quota-/Auth-Fehlern auf den naechsten
 * verfuegbaren Endpoint (siehe server/_core/llm.ts).
 */
export function resolveManagedLlmEndpoints(env: ManagedLlmEnv): ManagedLlmEndpoint[] {
  const rest: ManagedLlmEnv = { ...env };
  const endpoints: ManagedLlmEndpoint[] = [];
  for (let i = 0; i < 3; i += 1) {
    const endpoint = resolveManagedLlmEndpoint(rest);
    if (!endpoint) break;
    endpoints.push(endpoint);
    if (endpoint.source === "forge") rest.forgeApiKey = undefined;
    else if (endpoint.source === "gemini") rest.geminiApiKey = undefined;
    else rest.openaiApiKey = undefined;
  }
  return endpoints;
}

/** Fehlermeldung, wenn gar kein Key konfiguriert ist. */
export const MANAGED_LLM_NO_KEY_MESSAGE =
  "OPENAI_API_KEY is not configured (weder Forge- noch Gemini- noch OpenAI-Key serverseitig gesetzt).";
