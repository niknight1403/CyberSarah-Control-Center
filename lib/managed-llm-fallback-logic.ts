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
 * Sprint 85 — Gemini als Fallback-Stufe (Forge > Gemini > OpenAI) mit
 * autonomer Key-Rotation (siehe server/_core/llm.ts).
 *
 * SPRINT 108 — PERMANENTE ZERO-COST-ROUTING-GARANTIE:
 * Der zentrale Dispatcher priorisiert ausnahmslos KOSTENFREIE Endpunkte:
 * Groq Free Tier > OpenRouter Free Modelle > Gemini Free Tier. Kostenpflichtige
 * Endpunkte (Forge, OpenAI) greifen NICHT mehr als Standard-Fallback — sie
 * werden nur dann angehaengt, wenn der Administrator explizit
 * AI_ALLOW_PAID_LLM_FALLBACK=true setzt (manueller Override) ODER wenn
 * ueberhaupt kein kostenloser Key konfiguriert ist (Zero-Config-Notfall,
 * damit der Service nicht stumm bleibt).
 */

export type ManagedLlmEndpoint = {
  url: string;
  apiKey: string;
  source: "forge" | "gemini" | "openai" | "groq" | "openrouter" | "custom" | "local-ollama" | "local-lmstudio";
  /** Zusatz-Header pro Endpoint (z. B. OpenRouter-Ranking-Header). */
  headers?: Record<string, string>;
};

export type ManagedLlmEnv = {
  forgeApiUrl?: string;
  forgeApiKey?: string;
  geminiApiKey?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  groqApiKey?: string;
  groqBaseUrl?: string;
  openrouterApiKey?: string;
  openrouterBaseUrl?: string;
  openrouterReferer?: string;
  /**
   * Sprint 194 — Eigener OpenAI-kompatibler Endpoint (AI_CUSTOM_BASE_URL +
   * AI_CUSTOM_API_KEY): der vom Administrator bewusst konfigurierte (kosten-
   * freie) Dev-Endpoint. Er leitet die Kette, weil er die explizite Admin-
   * Entscheidung ist.
   */
  customApiKey?: string;
  customBaseUrl?: string;
  /**
   * Expliziter Admin-Override (AI_ALLOW_PAID_LLM_FALLBACK=true): haengt die
   * kostenpflichtige Kette (Forge > OpenAI) hinter die Gratis-Kette.
   */
  allowPaidFallback?: boolean;
};

const OPENAI_DEFAULT_URL = "https://api.openai.com/v1/chat/completions";
const GROQ_DEFAULT_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_DEFAULT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Gemini-Endpoint mit OpenAI-kompatibler Schnittstelle. */
export const GEMINI_OPENAI_COMPAT_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Kostenvorbehalt eines Sources: 'free' = dauerhaft kostenfreies Kontingent. */
export function isFreeManagedSource(source: ManagedLlmEndpoint["source"]): boolean {
  return source === "custom" || source === "groq" || source === "openrouter" || source === "gemini" || source === "local-ollama" || source === "local-lmstudio";
}

/**
 * Resolve den Endpoint fuer den Managed-Provider (Zero-Cost-Prioritaet):
 * 1. Groq-Key vorhanden → Groq Free Tier (OpenAI-kompatibel)
 * 2. sonst OpenRouter-Key vorhanden → OpenRouter Free Modelle
 * 3. sonst Gemini-Key vorhanden → Gemini-OpenAI-kompatibler Endpoint
 * 4. sonst Forge-Key vorhanden → Forge-Endpoint (BUILT_IN_FORGE_API_URL)
 * 5. sonst OpenAI-Key vorhanden → OpenAI-Endpoint
 * 6. sonst null mit Grundmeldung (Aufrufer entscheidet ueber die Fehler-Semantik)
 */
export function resolveManagedLlmEndpoint(env: ManagedLlmEnv): ManagedLlmEndpoint | null {
  // Sprint 194 — Custom-Endpoint zuerst: explizite Admin-Konfiguration leitet
  // die Kette (OpenAI-kompatibel, base-URL ohne /chat/completions-Suffix).
  const customKey = clean(env.customApiKey);
  const customUrl = clean(env.customBaseUrl);
  if (customKey && customUrl) {
    return {
      url: `${customUrl.replace(/\/+$/, "")}/chat/completions`,
      apiKey: customKey,
      source: "custom",
    };
  }

  const groqKey = clean(env.groqApiKey);
  if (groqKey) {
    return {
      url: clean(env.groqBaseUrl) ?? GROQ_DEFAULT_URL,
      apiKey: groqKey,
      source: "groq",
    };
  }

  const openrouterKey = clean(env.openrouterApiKey);
  if (openrouterKey) {
    return {
      url: clean(env.openrouterBaseUrl) ?? OPENROUTER_DEFAULT_URL,
      apiKey: openrouterKey,
      source: "openrouter",
      headers: {
        "HTTP-Referer": clean(env.openrouterReferer) ?? "https://cybersarah-ki.com",
        "X-Title": "CyberSarah Control Center",
      },
    };
  }

  const geminiKey = clean(env.geminiApiKey);
  if (geminiKey) {
    return { url: GEMINI_OPENAI_COMPAT_URL, apiKey: geminiKey, source: "gemini" };
  }

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

/**
 * Sprint 108 — Zero-Cost-Routing-Garantie: Baut die Kette fuer den autonomen
 * Key-Pool. Standard ist die KOSTENFREIE Kette (Groq > OpenRouter > Gemini).
 * Kostenpflichtige Endpoints (Forge > OpenAI) werden nur angehaengt, wenn
 * (a) der Admin AI_ALLOW_PAID_LLM_FALLBACK=true setzt oder
 * (b) kein einziger kostenloser Key konfiguriert ist (Zero-Config-Notfall).
 */
export function resolveManagedLlmEndpoints(env: ManagedLlmEnv): ManagedLlmEndpoint[] {
  const freeEnv: ManagedLlmEnv = {
    customApiKey: env.customApiKey,
    customBaseUrl: env.customBaseUrl,
    groqApiKey: env.groqApiKey,
    groqBaseUrl: env.groqBaseUrl,
    openrouterApiKey: env.openrouterApiKey,
    openrouterBaseUrl: env.openrouterBaseUrl,
    openrouterReferer: env.openrouterReferer,
    geminiApiKey: env.geminiApiKey,
  };

  const freeEndpoints: ManagedLlmEndpoint[] = [];
  const seenFreeSources = new Set<ManagedLlmEndpoint["source"]>();
  const freeKeyBySource: Record<string, keyof ManagedLlmEnv> = {
    custom: "customApiKey",
    groq: "groqApiKey",
    openrouter: "openrouterApiKey",
    gemini: "geminiApiKey",
  };
  // Gratis-Kette in Zero-Cost-Prioritaet: Custom > Groq > OpenRouter > Gemini.
  for (let i = 0; i < 4; i += 1) {
    const endpoint = resolveManagedLlmEndpoint({ ...freeEnv });
    if (!endpoint || !isFreeManagedSource(endpoint.source)) break;
    if (seenFreeSources.has(endpoint.source)) break; // Key nicht entfernbar → Kette vollstaendig
    seenFreeSources.add(endpoint.source);
    freeEndpoints.push(endpoint);
    freeEnv[freeKeyBySource[endpoint.source]] = undefined;
  }

  if (freeEndpoints.length > 0 && !env.allowPaidFallback) {
    // Garantiert: Kein kostenpflichtiger Standard-Fallback.
    return freeEndpoints;
  }

  // Paid-Kette (Forge > OpenAI) — nur bei Admin-Override oder leerer Gratis-Kette.
  const paidEnv: ManagedLlmEnv = {
    forgeApiUrl: env.forgeApiUrl,
    forgeApiKey: env.forgeApiKey,
    openaiBaseUrl: env.openaiBaseUrl,
    openaiApiKey: env.openaiApiKey,
  };
  const paidEndpoints: ManagedLlmEndpoint[] = [];
  const seenPaidSources = new Set<ManagedLlmEndpoint["source"]>();
  const paidKeyBySource: Record<string, keyof ManagedLlmEnv> = {
    forge: "forgeApiKey",
    openai: "openaiApiKey",
  };
  for (let i = 0; i < 2; i += 1) {
    const endpoint = resolveManagedLlmEndpoint({ ...paidEnv });
    if (!endpoint || isFreeManagedSource(endpoint.source)) break;
    if (seenPaidSources.has(endpoint.source)) break;
    seenPaidSources.add(endpoint.source);
    paidEndpoints.push(endpoint);
    paidEnv[paidKeyBySource[endpoint.source]] = undefined;
  }

  return [...freeEndpoints, ...paidEndpoints];
}

/** Fehlermeldung, wenn gar kein Key konfiguriert ist. */
export const MANAGED_LLM_NO_KEY_MESSAGE =
  "OPENAI_API_KEY is not configured (weder Custom-, Groq-, OpenRouter-, Gemini-, Forge- noch OpenAI-Key serverseitig gesetzt).";
