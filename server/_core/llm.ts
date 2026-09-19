import { ENV } from "./env";

import {
  MANAGED_LLM_NO_KEY_MESSAGE,
  resolveManagedLlmEndpoint,
  resolveManagedLlmEndpoints,
  type ManagedLlmEndpoint,
} from "../../lib/managed-llm-fallback-logic";
import { isProviderQuarantined } from "../../lib/live-fix-logic";
import { resolveManagedModel } from "../../lib/managed-model-logic";
import {
  createKeyPoolEntry,
  recordKeyObservation,
  refreshKeyPool,
  type KeyObservation,
  type KeyPoolEntry,
} from "../../lib/key-rotation-logic";
import { evaluateAndNotifyQuotaWarnings, recordProviderCall, recordProviderFailover } from "../provider-metering";
import { diagnoseLlmPoolFailure, type LlmEndpointAttempt } from "../../lib/llm-failure-diagnostics";
import { sendOpsDiscordAlert } from "../ops-alerts";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
  /** Sprint 88 — Tool-Aufrufe einer vorherigen Assistant-Antwort, die im
   * Multi-Turn-Verlauf mitgesendet werden muessen, damit nachfolgende
   * "tool"-Rollen-Nachrichten korrekt korreliert werden. */
  tool_calls?: ToolCall[];
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice = ToolChoicePrimitive | ToolChoiceByName | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: Role;
      content: string | (TextContent | ImageContent | FileContent)[];
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// Sprint 151 — Root-Cause-Fix: ensureArray() gab bei null/undefined bisher
// [null]/[undefined] zurueck. Eine Assistant-Nachricht mit reinen
// Tool-Aufrufen hat oft content=null (oder das Feld fehlt komplett, je nach
// Provider), sobald sie im naechsten Runden-Durchlauf erneut normalisiert
// wird (Multi-Turn-Verlauf). normalizeContentPart bekam dann null/undefined
// als "part" und stuerzte mit "Cannot read properties of undefined
// (reading 'type')" ab — der Superagent eskalierte dadurch JEDE Aufgabe
// mit Tool-Aufrufen nach 3 Wiederholungen. Fehlender Inhalt wird jetzt vor
// jeder Content-Verarbeitung erkannt und sicher behandelt.
const ensureArray = (value: MessageContent | MessageContent[] | null | undefined): MessageContent[] => {
  if (value === null || value === undefined || value === "") return [];
  return Array.isArray(value) ? value.filter((part) => part !== null && part !== undefined) : [value];
};

const normalizeContentPart = (part: MessageContent): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id, tool_calls } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility.
  // Kein Content (leeres Array, z. B. reine Tool-Call-Antwort) -> null statt
  // eines leeren Arrays, wie von OpenAI-kompatiblen APIs erwartet.
  const collapsedContent = contentParts.length === 0
    ? null
    : contentParts.length === 1 && contentParts[0].type === "text"
      ? contentParts[0].text
      : contentParts;

  // Sprint 88 — eine Assistant-Nachricht mit Tool-Aufrufen muss diese im
  // Multi-Turn-Verlauf mitfuehren, sonst kann der Provider nachfolgende
  // "tool"-Rollen-Nachrichten nicht korrelieren (z. B. OpenAI 400 "missing
  // tool_calls"). content wird bei leerem Text auf null gesetzt, wie von
  // OpenAI-kompatiblen APIs fuer reine Tool-Call-Antworten erwartet.
  if (role === "assistant" && tool_calls && tool_calls.length > 0) {
    return {
      role,
      name,
      content: collapsedContent || null,
      tool_calls,
    };
  }

  return {
    role,
    name,
    content: collapsedContent,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined,
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error("tool_choice 'required' was provided but no tools were configured");
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly",
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

/**
 * Sprint 53 — Zero-Config: Ohne Forge-Key faellt der Managed-Aufruf
 * automatisch auf den OpenAI-Endpoint zurueck (deterministisch getestet in
 * tests/managed-llm-fallback-logic.test.ts).
 */
/**
 * Sprint 108 — PERMANENTE ZERO-COST-ROUTING-GARANTIE: Der Managed-Pool
 * priorisiert ausnahmslos kostenfreie Endpunkte (Groq > OpenRouter > Gemini).
 * Kostenpflichtige Endpoints (Forge > OpenAI) greifen nur bei explizitem
 * Admin-Override (AI_ALLOW_PAID_LLM_FALLBACK=true) oder als Zero-Config-
 * Notfall, wenn ueberhaupt kein Gratis-Key konfiguriert ist.
 */
const managedLlmEnv = () => ({
  forgeApiUrl: ENV.forgeApiUrl,
  forgeApiKey: ENV.forgeApiKey,
  openaiBaseUrl: process.env.AI_OPENAI_BASE_URL?.trim() || undefined,
  geminiApiKey: process.env.AI_GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || undefined,
  openaiApiKey: process.env.AI_OPENAI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || undefined,
  groqApiKey: process.env.AI_GROQ_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim() || undefined,
  groqBaseUrl: process.env.AI_GROQ_BASE_URL?.trim() || undefined,
  openrouterApiKey: process.env.AI_OPENROUTER_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim() || undefined,
  openrouterBaseUrl: process.env.AI_OPENROUTER_BASE_URL?.trim() || undefined,
  openrouterReferer: process.env.AI_OPENROUTER_REFERER?.trim() || process.env.APP_BASE_URL?.trim() || undefined,
  allowPaidFallback: process.env.AI_ALLOW_PAID_LLM_FALLBACK?.trim().toLowerCase() === "true",
});

const resolveManagedEndpoint = () => {
  const endpoint = resolveManagedLlmEndpoint(managedLlmEnv());
  if (!endpoint) {
    throw new Error(MANAGED_LLM_NO_KEY_MESSAGE);
  }
  return endpoint;
};


/**
 * Dark-Cyber Zero-Config (Sprint 158): Ist KEIN Cloud-Key konfiguriert
 * (lokal ohne API-Keys), faellt der Managed-Pfad automatisch auf erreichbare
 * lokale LLM-Endpoints zurueck (Ollama, dann LM Studio) — der Chat bleibt
 * ohne externe Setup-Blocker nutzbar. Ist auch lokal nichts erreichbar,
 * gilt weiterhin die klare MANAGED_LLM_NO_KEY-Meldung.
 */
type LocalLlmCandidate = {
  source: "local-ollama" | "local-lmstudio";
  baseUrl: string;
  apiKey: string;
};

const localLlmCandidates = (): LocalLlmCandidate[] => {
  const trim = (value: string | undefined) => value?.trim() || undefined;
  const base = (value: string | undefined, fallback: string) =>
    (trim(value) ?? fallback).replace(/\/+$/, "");
  return [
    {
      source: "local-ollama",
      baseUrl: base(process.env.AI_OLLAMA_BASE_URL ?? process.env.OLLAMA_BASE_URL, "http://127.0.0.1:11434/v1"),
      apiKey: "ollama",
    },
    {
      source: "local-lmstudio",
      baseUrl: base(process.env.AI_LMSTUDIO_BASE_URL ?? process.env.LMSTUDIO_BASE_URL, "http://127.0.0.1:1234/v1"),
      apiKey: "local",
    },
  ];
};

/** Erreichbarkeits-Probe gegen den OpenAI-kompatiblen /models-Endpoint. */
async function probeLocalLlmEndpoint(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1_500);
    const response = await fetch(`${baseUrl}/models`, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

/** Ersten erreichbaren lokalen Endpoint liefern (oder null). */
async function resolveLocalManagedEndpoint(): Promise<ManagedLlmEndpoint | null> {
  for (const candidate of localLlmCandidates()) {
    if (await probeLocalLlmEndpoint(candidate.baseUrl)) {
      return { url: `${candidate.baseUrl}/chat/completions`, apiKey: candidate.apiKey, source: candidate.source };
    }
  }
  return null;
}

/**
 * Sprint 85 — Autonome API-Key-Rotation (Live-Integration der Bibliothek
 * lib/key-rotation-logic.ts): Der Managed-Aufruf verwaltet einen Pool aller
 * konfigurierten Endpoints (Forge > Gemini > OpenAI, kostenpriorisiert).
 * 429 → Cooldown (60 s), 401/402/403 → Key gilt als erschöpft, Latenz und
 * Restguthaben fliessen in den Health-Score ein. invokeLLM rotiert bei
 * Fehlern automatisch auf den naechsten gesunden Key — ohne manuelles
 * Eingreifen und ohne Ausfuehrungskontext zu verlieren.
 */
const managedEndpoints = new Map<string, ManagedLlmEndpoint>();
const managedPool = new Map<string, KeyPoolEntry>();

const maskKeyLabel = (apiKey: string): string => `…${apiKey.slice(-4)}`;

/** Sprint 115: naechste Quelle in der Kette (fuer Failover-Protokollierung). */
const nextSource = (ordered: { source: string }[], current: string): string | undefined => {
  const index = ordered.findIndex((entry) => entry.source === current);
  return index >= 0 && index + 1 < ordered.length ? ordered[index + 1].source : undefined;
};

/** Kandidaten-Kette aufloesen und Pool-Zustaende synchronisieren/auffrischen. */
const resolveManagedCandidates = (): ManagedLlmEndpoint[] => {
  const endpoints = resolveManagedLlmEndpoints(managedLlmEnv());
  if (endpoints.length === 0) {
    throw new Error(MANAGED_LLM_NO_KEY_MESSAGE);
  }
  const nowMs = Date.now();
  for (const endpoint of endpoints) {
    if (!managedEndpoints.has(endpoint.source)) {
      managedEndpoints.set(endpoint.source, endpoint);
    }
    const existing = managedPool.get(endpoint.source);
    const entry = existing
      ? recordKeyObservation(existing, { nowMs })
      : createKeyPoolEntry({
          id: endpoint.source,
          provider: "managed",
          label: maskKeyLabel(endpoint.apiKey),
        });
    managedPool.set(endpoint.source, refreshKeyPool([entry], nowMs)[0]);
  }
  return endpoints;
};

/** Beobachtung in den Pool-Eintrag des Sources einarbeiten. */
const recordPoolObservation = (source: string, observation: KeyObservation): void => {
  const entry = managedPool.get(source);
  if (!entry) return;
  managedPool.set(source, recordKeyObservation(entry, { ...observation, nowMs: Date.now() }));
};

/** Test-Hook: Pool-Zustand zuruecksetzen. */
export function resetManagedKeyPoolForTests(): void {
  managedEndpoints.clear();
  managedPool.clear();
};

/** Sprint 115: Quota-Warnschwelle hoechstens einmal pro Minute pruefen (Hot-Pfad-Schutz). */
let quotaCheckAt = 0;
const runQuotaWarningCheck = (): void => {
  const now = Date.now();
  if (now - quotaCheckAt < 60_000) return;
  quotaCheckAt = now;
  // Fire-and-forget: der Aufruf wartet nicht auf den Benachrichtigungsversand.
  void evaluateAndNotifyQuotaWarnings(getManagedPoolSnapshotForMetering(), sendOpsDiscordAlert).catch(
    () => undefined,
  );
};

/**
 * Sprint 115 — read-only Pool-Snapshot fuer das Provider-Metering:
 * maskierte Labels, Status, Restguthaben und Cooldown-Enden — niemals
 * Voll-Keys. Der Metering-Adapter (server/provider-metering.ts) und der
 * Admin-Router kombinieren ihn mit dem Aufruf-Ledger.
 */
export function getManagedPoolSnapshotForMetering(): {
  id: string;
  label: string;
  status: "active" | "cooling" | "exhausted";
  remainingCredits: number | null;
  cooldownUntilMs: number | null;
}[] {
  return [...managedPool.values()].map((entry) => ({
    id: entry.id,
    label: entry.label,
    status: entry.status,
    remainingCredits: entry.remainingCredits,
    cooldownUntilMs: entry.cooldownUntilMs,
  }));
}

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error("responseFormat json_schema requires a defined schema object");
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

const RETRY_MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 30_000;

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
};

// Equal-jitter exponential backoff. The cap/2 floor guarantees a minimum delay so a
// misbehaving caller loop slows down instead of hammering the upstream while it keeps
// returning errors.
const computeBackoffDelay = (attempt: number, retryAfterMs?: number): number => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};

// Retries non-2xx responses and network errors with exponential backoff, then returns
// the final Response so callers keep their existing error handling.
const fetchWithBackoff = async (url: string, init: FetchInit): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }
      // Sprint 85: 4xx (Auth/Quota/Modellfehler) nicht blind wiederholen —
      // der autonome Key-Pool in invokeLLM rotiert sofort auf den naechsten
      // Endpoint. Nur 5xx und Netzwerkfehler sind echte Retry-Kandidaten.
      if (response.status < 500) {
        return response;
      }

      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      try {
        await response.body?.cancel();
      } catch {
        // Body already settled; nothing to clean up.
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`,
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`,
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("LLM request failed after exhausting retries");
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  let candidates: ManagedLlmEndpoint[];
  try {
    candidates = resolveManagedCandidates();
  } catch (error) {
    // Dark-Cyber Zero-Config: ohne Cloud-Keys auf lokale LLMs ausweichen.
    const localEndpoint = await resolveLocalManagedEndpoint();
    if (localEndpoint) {
      candidates = [localEndpoint];
    } else {
      throw error;
    }
  }

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens,
  } = params;

  // Nur aktive Keys in Ketten-Prioritaet versuchen; sind alle abgekuehlt
  // oder erschöpft, wird die Kette trotzdem durchprobiert (Best-Effort),
  // damit der Service nicht stumm bleibt, bis Cooldowns ablaufen.
  const activeSources = new Set(
    [...managedPool.values()].filter((entry) => entry.status === "active").map((entry) => entry.id),
  );
  let ordered = candidates.filter((endpoint) => activeSources.has(endpoint.source));
  if (ordered.length === 0) {
    ordered = [...candidates];
  }

  // Sprint 165 — Live-Fix-Quarantaene: Der Self-Healing-Live-Fix setzt
  // limitierte Provider (429/Quota) fuer 60s in Quarantaene; die Kette
  // rotiert sofort auf den naechsten Endpoint. Sind ALLE in Quarantaene,
  // wird trotzdem Best-Effort weitergearbeitet (Service bleibt nie stumm).
  const notQuarantined = ordered.filter((endpoint) => !isProviderQuarantined(endpoint.source));
  if (notQuarantined.length > 0) {
    ordered = notQuarantined;
  }

  const payload: Record<string, unknown> = {
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }

  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  let lastError: unknown;
  const attempts: LlmEndpointAttempt[] = [];
  for (const endpoint of ordered) {
    // Sprint 85: model ist Pflicht und muss zum jeweiligen Endpoint passen
    // (Gemini-Endpoint → Gemini-Modell, Forge/OpenAI → OpenAI-Modell).
    const attemptPayload = {
      ...payload,
      model: model ?? resolveManagedModel(undefined, endpoint.source),
    };
    const startedAt = Date.now();
    try {
      const response = await fetchWithBackoff(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${endpoint.apiKey}`,
          ...(endpoint.headers ?? {}),
        },
        body: JSON.stringify(attemptPayload),
      });
      const latencyMs = Date.now() - startedAt;
      if (!response.ok) {
        const errorText = await response.text();
        lastError = new Error(`LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
        attempts.push({ source: endpoint.source, httpStatus: response.status, message: errorText });
        // Sprint 115: Aufruf ins Metering-Ledger (429/Auth/sonstige).
        recordProviderCall({ source: endpoint.source, httpStatus: response.status, networkError: false, latencyMs });
        runQuotaWarningCheck();
        // 429 → Cooldown, 401/402/403 → erschöpft (Auth/Guthaben),
        // andere Status bleiben ohne Zustandsänderung (nur Latenz fließt ein).
        if ([401, 402, 403, 429].includes(response.status)) {
          recordPoolObservation(endpoint.source, { httpStatus: response.status, latencyMs });
        } else {
          recordPoolObservation(endpoint.source, { latencyMs });
        }
        // Sprint 115: Failover auf den naechsten Kandidaten protokollieren.
        recordProviderFailover({ source: endpoint.source, failoverTo: nextSource(ordered, endpoint.source) });
        continue;
      }
      recordPoolObservation(endpoint.source, { latencyMs });
      recordProviderCall({ source: endpoint.source, httpStatus: response.status, networkError: false, latencyMs });
      runQuotaWarningCheck();
      return (await response.json()) as InvokeResult;
    } catch (error) {
      lastError = error;
      attempts.push({ source: endpoint.source, httpStatus: null, message: error instanceof Error ? error.message : String(error) });
      recordProviderCall({ source: endpoint.source, httpStatus: null, networkError: true, latencyMs: Date.now() - startedAt });
      recordProviderFailover({ source: endpoint.source, failoverTo: nextSource(ordered, endpoint.source) });
      continue;
    }
  }

  // Sprint 153: Sind ALLE Versuche an Auth-/Guthaben-Problemen gescheitert,
  // ersetzt die Diagnose den kryptischen Roh-Fehler durch eine klare
  // Handlungsanweisung (gueltigen API-Key hinterlegen).
  const diagnostics = diagnoseLlmPoolFailure(attempts);
  if (diagnostics.actionableMessage) {
    throw new Error(diagnostics.actionableMessage);
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("LLM invoke failed: alle Managed-Keys im Cooldown oder erschöpft");
}

export type ModelInfo = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

export type ModelsResponse = {
  object: string;
  data: ModelInfo[];
};

export async function listLLMModels(): Promise<ModelsResponse> {
  const managed = resolveManagedEndpoint();
  const url = managed.source === "forge"
    ? `${ENV.forgeApiUrl!.replace(/\/$/, "")}/v1/models`
    : `${managed.url.replace(/\/chat\/completions$/, "")}/models`;

  const response = await fetchWithBackoff(url, {
    headers: { authorization: `Bearer ${managed.apiKey}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `List LLM models failed: ${response.status} ${response.statusText} – ${errorText}`,
    );
  }

  return (await response.json()) as ModelsResponse;
}
