import { TRPCError } from "@trpc/server";
import { insertChatTurn, insertAgentLearningRecord, listChatMessages, listChatSessions, listRecentAgentLearnings } from "./db";
import {
  buildLearningRecord,
  deriveLearningFromTurn,
  formatLearningsForContext,
  isAgentLearningKind,
  selectRelevantLearnings,
  turnDeservesLearning,
} from "../lib/agent-memory-logic";
import { measureRetrievalOnUserMessage, recordLearningInjection } from "./retrieval-metrics";
import { sanitizeSessionId } from "../lib/chat-session-logic";
import {
  DEFAULT_DAILY_CHAT_LIMIT,
  countMessagesToday,
  evaluateChatQuota,
} from "../lib/chat-quota-logic";
import {
  isFeatureEnabled,
  parseFeatureFlagOverrides,
  resolveFeatureFlags,
} from "../lib/feature-flag-logic";
import { searchChatMessages, validateSearchQuery } from "../lib/chat-search-logic";
import {
  buildChatExport,
  type ExportSession,
} from "../lib/chat-export-logic";
import { buildPersistableTurn } from "../lib/chat-history-logic";
import { compressPersistedChatHistory } from "../lib/chat-compression-logic";
import { z } from "zod";
import { invokeLLM, type InvokeResult, type Message, type Tool, type ToolCall } from "./_core/llm";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { callWorkspaceService } from "./_core/renderProxy";
import { resolveAdminGithubToken } from "../lib/admin-integrations-logic";
import {
  AGENT_TOOL_DEFINITIONS,
  MAX_AGENT_TOOL_ITERATIONS,
  MAX_TOOL_RESULT_CHARS,
  buildAgentSystemPrompt,
  buildWorkspaceToolRequest,
  formatToolResultForModel,
  isAgentToolName,
  parseToolArguments,
  type AgentToolName,
} from "../lib/dev-agent-tools-logic";
import {
  BUSINESS_TOOL_DESCRIPTIONS,
  BUSINESS_TOOL_NAMES,
  formatBusinessResult,
  isBusinessToolName,
} from "../lib/data-hub-logic";
import { executeBusinessSnapshot } from "./data-hub";

import {
  buildProviderOrder,
  classifyPrompt,
  type RouterProviderId,
} from "../lib/model-router-logic";
import { buildSuperagentBrief, shouldAttachSuperagentBrief } from "../lib/superagent-brief-logic";
import { getRuntimeLogs } from "./runtime-logger";
import { classifyRuntimeState } from "../lib/live-status-logic";
import {
  getPreferredProviderOrder,
  getRouterHealth,
  getRouterConfiguredProviders,
  recordRouterOutcome,
  getRouterSnapshot,
  setPreferredProviderOrder,
  probeLocalProviders,
} from "./model-router";

const providerSchema = z.enum([
  "auto",
  "managed",
  "openai",
  "gemini",
  "openrouter",
  "groq",
  "together",
  "anthropic",
  "ollama",
  "lmstudio",
  "custom",
  "huggingface",
]);

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(16_000),
});

const chatInputSchema = z.object({
  messages: z.array(messageSchema).min(1).max(24),
  provider: providerSchema.default("managed"),
  model: z.string().trim().min(1).max(160).optional(),
  sessionId: z.string().trim().max(64).optional(),
  /** Sprint 88 — Workspace-ID aktiviert den autonomen Werkzeug-Modus. */
  workspaceId: z.string().trim().min(1).max(128).optional(),
  githubToken: z.string().trim().min(1).max(255).optional(),
  branch: z.string().trim().min(1).max(160).optional(),
});

type ProviderId = z.infer<typeof providerSchema>;

/** Aktive Flags (ENV FEATURE_FLAGS ueberschreibt Registry-Defaults). */
const currentFeatureFlags = () =>
  resolveFeatureFlags(parseFeatureFlagOverrides(process.env.FEATURE_FLAGS ?? ""));
type ChatMessage = z.infer<typeof messageSchema>;

type ProviderConfig = {
  endpoint: string;
  apiKey?: string;
  model: string;
  headers?: Record<string, string>;
};

const SYSTEM_PROMPT = `Du bist CyberSarah, eine präzise Entwicklungsassistentin im Control Center. Antworte auf Deutsch, wenn der Nutzer Deutsch schreibt. Analysiere Code und Architektur nachvollziehbar, benenne Annahmen klar und schlage sichere, überprüfbare nächste Schritte vor. Erfinde keine ausgeführten Änderungen. Gib bei Code-Vorschlägen nur die relevanten Dateien und Abschnitte an.`;

function getEnv(name: string) {
  return process.env[name]?.trim() || undefined;
}

function getProviderConfig(provider: Exclude<ProviderId, "managed" | "anthropic" | "auto">, requestedModel?: string): ProviderConfig {
  const base: Record<Exclude<ProviderId, "managed" | "anthropic" | "auto">, Omit<ProviderConfig, "model"> & { defaultModel: string }> = {
    openai: {
      endpoint: getEnv("AI_OPENAI_BASE_URL") ?? "https://api.openai.com/v1/chat/completions",
      apiKey: getEnv("AI_OPENAI_API_KEY") ?? getEnv("OPENAI_API_KEY"),
      defaultModel: getEnv("AI_OPENAI_MODEL") ?? "gpt-4o-mini",
    },
    gemini: {
      endpoint: getEnv("AI_GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: getEnv("AI_GEMINI_API_KEY") ?? getEnv("GEMINI_API_KEY"),
      defaultModel: getEnv("AI_GEMINI_MODEL") ?? "gemini-flash-latest",
    },
    openrouter: {
      endpoint: getEnv("AI_OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1/chat/completions",
      apiKey: getEnv("AI_OPENROUTER_API_KEY") ?? getEnv("OPENROUTER_API_KEY"),
      defaultModel: getEnv("AI_OPENROUTER_MODEL") ?? "meta-llama/llama-3.3-70b-instruct:free",
      headers: { "HTTP-Referer": getEnv("APP_BASE_URL") ?? "https://localhost", "X-Title": "CyberSarah Control Center" },
    },
    groq: {
      endpoint: getEnv("AI_GROQ_BASE_URL") ?? "https://api.groq.com/openai/v1/chat/completions",
      apiKey: getEnv("AI_GROQ_API_KEY") ?? getEnv("GROQ_API_KEY"),
      defaultModel: getEnv("AI_GROQ_MODEL") ?? "openai/gpt-oss-20b",
    },
    together: {
      endpoint: getEnv("AI_TOGETHER_BASE_URL") ?? "https://api.together.xyz/v1/chat/completions",
      apiKey: getEnv("AI_TOGETHER_API_KEY") ?? getEnv("TOGETHER_API_KEY"),
      defaultModel: getEnv("AI_TOGETHER_MODEL") ?? "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    },
    ollama: {
      endpoint: `${(getEnv("AI_OLLAMA_BASE_URL") ?? getEnv("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1").replace(/\/+$/, "")}/chat/completions`,
      apiKey: getEnv("AI_OLLAMA_API_KEY") ?? "ollama",
      defaultModel: getEnv("AI_OLLAMA_MODEL") ?? "qwen2.5-coder:7b",
    },
    lmstudio: {
      endpoint: `${(getEnv("AI_LMSTUDIO_BASE_URL") ?? getEnv("LMSTUDIO_BASE_URL") ?? "http://127.0.0.1:1234/v1").replace(/\/+$/, "")}/chat/completions`,
      apiKey: getEnv("AI_LMSTUDIO_API_KEY") ?? "local",
      defaultModel: getEnv("AI_LMSTUDIO_MODEL") ?? "local-model",
    },
    custom: {
      endpoint: getEnv("AI_CUSTOM_BASE_URL") ?? getEnv("CUSTOM_OPENAI_BASE_URL") ?? "",
      apiKey: getEnv("AI_CUSTOM_API_KEY") ?? getEnv("CUSTOM_OPENAI_API_KEY"),
      defaultModel: getEnv("AI_CUSTOM_MODEL") ?? getEnv("CUSTOM_OPENAI_MODEL") ?? "local-model",
    },
    huggingface: {
      endpoint: getEnv("AI_HUGGINGFACE_BASE_URL") ?? "https://router.huggingface.co/v1/chat/completions",
      apiKey: getEnv("AI_HUGGINGFACE_API_KEY") ?? getEnv("HF_TOKEN"),
      defaultModel: getEnv("AI_HUGGINGFACE_MODEL") ?? "deepseek-ai/DeepSeek-R1:fastest",
    },
  };

  const config = base[provider];
  if (!config.endpoint) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Der Endpoint für ${provider} ist serverseitig nicht konfiguriert.` });
  }
  if (!config.apiKey && provider !== "ollama" && provider !== "lmstudio") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Der API-Schlüssel für ${provider} ist serverseitig nicht konfiguriert.` });
  }
  return { endpoint: config.endpoint, apiKey: config.apiKey, headers: config.headers, model: requestedModel ?? config.defaultModel };
}

function toProviderMessages(messages: ChatMessage[]) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((message) => ({ role: message.role, content: message.content })),
  ];
}

function extractContent(payload: unknown): string {
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => typeof part === "object" && part && "text" in part && typeof part.text === "string" ? part.text : "")
      .filter(Boolean)
      .join("\n")
      .trim();
    if (joined) return joined;
  }
  throw new Error("Der Provider hat keine Textantwort zurückgegeben.");
}

async function callOpenAICompatibleProvider(provider: Exclude<ProviderId, "managed" | "anthropic" | "auto">, messages: ChatMessage[], requestedModel?: string) {
  const config = getProviderConfig(provider, requestedModel);
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      ...config.headers,
    },
    body: JSON.stringify({ model: config.model, messages: toProviderMessages(messages), temperature: 0.2, max_tokens: 1_800 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`${provider} antwortet mit ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return { content: extractContent(await response.json()), model: config.model };
}

async function callAnthropic(messages: ChatMessage[], requestedModel?: string) {
  const apiKey = getEnv("AI_ANTHROPIC_API_KEY") ?? getEnv("ANTHROPIC_API_KEY");
  if (!apiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Der API-Schlüssel für anthropic ist serverseitig nicht konfiguriert." });
  const response = await fetch(getEnv("AI_ANTHROPIC_BASE_URL") ?? "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: requestedModel ?? getEnv("AI_ANTHROPIC_MODEL") ?? "claude-3-5-haiku-latest", max_tokens: 1_800, temperature: 0.2, system: SYSTEM_PROMPT, messages }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`anthropic antwortet mit ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }>; model?: string };
  const content = payload.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n").trim();
  if (!content) throw new Error("anthropic hat keine Textantwort zurückgegeben.");
  return { content, model: payload.model ?? requestedModel ?? "claude-3-5-haiku-latest" };
}

async function callManaged(messages: ChatMessage[], requestedModel?: string) {
  try {
    const result = await invokeLLM({
      messages: toProviderMessages(messages) as Message[],
      model: requestedModel,
      maxTokens: 1_800,
    });
    return { content: extractContent(result), model: result.model };
  } catch (error) {
    if (error instanceof Error && /OPENAI_API_KEY/.test(error.message)) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Der On-Server-LLM ist nicht konfiguriert. Bitte OPENAI_API_KEY in der Serverumgebung setzen.",
      });
    }
    throw error;
  }
}

function isTransientChatError(error: unknown) {
  if (error instanceof TRPCError) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /\b(408|425|429|500|502|503|504)\b/.test(message) ||
    (error instanceof TypeError) ||
    (error instanceof Error && error.name === "AbortError");
}

function getFallbackProviders(provider: ProviderId) {
  const configured: string[] = (getEnv("AI_FALLBACK_PROVIDERS") ?? getEnv("AI_FALLBACK_PROVIDER") ?? "")
    .split(",")
    .map((value: string) => value.trim())
    .filter(Boolean);
  const parsed: Array<{ success: boolean; data?: ProviderId }> = configured.map((value: string) => {
    const result = providerSchema.safeParse(value);
    return result.success ? { success: true, data: result.data } : { success: false };
  });
  const providers: ProviderId[] = parsed
    .filter((result): result is { success: true; data: ProviderId } => result.success && Boolean(result.data))
    .map((result) => result.data);
  return providers.filter((candidate, index, all) => candidate !== provider && all.indexOf(candidate) === index);
}

async function callProvider(provider: ProviderId, messages: ChatMessage[], model?: string) {
  if (provider === "auto") return callManaged(messages, model);
  if (provider === "managed") return callManaged(messages, model);
  if (provider === "anthropic") return callAnthropic(messages, model);
  return callOpenAICompatibleProvider(provider, messages, model);
}

/**
 * Sprint 50 — konfigurierbare Obergrenze der Chat-Verlaufskompression
 * (CHAT_COMPRESSION_MAX_MESSAGES). Ungueltige Werte fallen deterministisch
 * auf den Standard von 60 Nachrichten zurueck.
 */
function getChatCompressionLimit(): number {
  const parsed = Number(process.env.CHAT_COMPRESSION_MAX_MESSAGES);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 60;
}

export const developmentChatRouter = router({
  /**
   * Sprint 108 — System-State der Chat-Quote: Der Admin-Account arbeitet mit
   * UNLIMITED_TOKENS (QUOTA_EXEMPT) — keine Obergrenze, kein Zaehler. Alle
   * anderen Konten erhalten die Fair-Use-Tagesbewertung.
   */
  quota: protectedProcedure.query(async ({ ctx }) => {
    try {
      const recentMessages = await listChatMessages(ctx.user.openId, 500);
      const usedToday = countMessagesToday(recentMessages, new Date());
      return evaluateChatQuota(
        {
          dailyLimit: Number(process.env.DAILY_CHAT_LIMIT) || DEFAULT_DAILY_CHAT_LIMIT,
          role: ctx.user.role,
        },
        usedToday,
        new Date(),
      );
    } catch (error) {
      console.warn("[developmentChat] Quotenabruf fehlgeschlagen:", error);
      // Best-Effort: Bei unbekannter Historie gilt die aktive Tagesquote.
      return evaluateChatQuota(
        {
          dailyLimit: Number(process.env.DAILY_CHAT_LIMIT) || DEFAULT_DAILY_CHAT_LIMIT,
          role: "user",
        },
        0,
        new Date(),
      );
    }
  }),

  providers: protectedProcedure.query(() => ({
    providers: [
      { id: "auto", label: "Autonomer Superagent / Auto-Router", type: "auto" },
      { id: "managed", label: "On-Server LLM", type: "managed" },
      { id: "ollama", label: "Ollama lokal", type: "local" },
      { id: "lmstudio", label: "LM Studio lokal", type: "local" },
      { id: "openrouter", label: "OpenRouter Free", type: "cloud" },
      { id: "huggingface", label: "Hugging Face", type: "cloud" },
      { id: "gemini", label: "Google Gemini", type: "cloud" },
      { id: "groq", label: "Groq", type: "cloud" },
      { id: "openai", label: "OpenAI", type: "cloud" },
      { id: "together", label: "Together AI", type: "cloud" },
      { id: "anthropic", label: "Anthropic", type: "cloud" },
      { id: "custom", label: "Eigener OpenAI-kompatibler Endpoint", type: "custom" },
    ] as const,
  })),
  /** Sprint 71 — Aggregierter Router-Status fuer die Admin-UI. */
  routerStatus: adminProcedure.query(async () => getRouterSnapshot()),

  /** Sprint 71 — Bevorzugte Provider-Reihenfolge persistent speichern. */
  setPreferredOrder: adminProcedure
    .input(z.object({ order: z.array(z.string().trim().min(1).max(64)).max(11) }))
    .mutation(async ({ input }) => {
      const order = await setPreferredProviderOrder(input.order);
      return { order };
    }),

  /** Sprint 71 — Lokale Endpoints (Ollama/LM Studio) aktiv anpingen. */
  probeLocalProviders: adminProcedure.mutation(async () => probeLocalProviders()),

  send: protectedProcedure
    .input(chatInputSchema)
    .mutation(async ({ input, ctx }) => {
      // Sprint 59: Fair-Use-Tagesquote aus der persistenten Historie
      // (Admins ausgenommen) — schuetzt vor unbegrenzter Chat-Nutzung.
      // Sprint 61: nur wirksam, solange das chatQuota-Flag aktiv ist.
      if (isFeatureEnabled(currentFeatureFlags(), "chatQuota")) {
        try {
          const recentMessages = await listChatMessages(ctx.user.openId, 500);
          const usedToday = countMessagesToday(recentMessages, new Date());
          const quota = evaluateChatQuota(
            {
              dailyLimit: Number(process.env.DAILY_CHAT_LIMIT) || DEFAULT_DAILY_CHAT_LIMIT,
              role: ctx.user.role,
            },
            usedToday,
            new Date(),
          );
          if (!quota.allowed) {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: quota.reason ?? "Tageslimit erreicht." });
          }
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          console.warn("[developmentChat] Quotenpruefung uebersprungen:", error);
        }
      }
      // Sprint 113: Nutzer-Nachricht gegen die letzte Learning-Injektion
      // derselben Session messen (Trefferquote der Top-3-Injektion).
      if (input.sessionId) {
        measureRetrievalOnUserMessage(input.sessionId, input.messages.at(-1)?.content ?? "");
      }
      const result = await handleDevelopmentChat({ ...input, role: ctx.user.role, userOpenId: ctx.user.openId });
      // Sprint 54: Turn auf PostgreSQL persistieren (Best-Effort —
      // Persistenzfehler brechen die Chat-Antwort nicht ab).
      try {
        const turn = buildPersistableTurn({
          userContent: input.messages.at(-1)?.content ?? "",
          assistantContent: result.content,
          provider: result.providerUsed,
        });
        if (turn) {
          await insertChatTurn({
            userOpenId: ctx.user.openId,
            userContent: turn.userMessage.content,
            assistantContent: turn.assistantMessage.content,
            provider: turn.provider,
            sessionId: input.sessionId,
          });
        }
      } catch (error) {
        console.warn("[developmentChat] Turn nicht persistiert:", error);
      }
      return result;
    }),
  history: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(500).default(100),
        sessionId: z.string().trim().max(64).optional(),
      }),
    )
    .query(async ({ input, ctx }) =>
      // Sprint 50: Gespeicherte Entwicklungschats werden beim Überschreiten
      // konfigurierbarer Grenzen deterministisch komprimiert; der stabile
      // Verdauungseintrag (Anzahl + FNV-1a-Hash) wird mitgeliefert.
      compressPersistedChatHistory(
        await listChatMessages(ctx.user.openId, input.limit, input.sessionId),
        { maxMessages: getChatCompressionLimit() },
      ),
    ),
  sessions: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(500).default(500),
      }),
    )
    .query(async ({ input, ctx }) =>
      listChatSessions(ctx.user.openId, input.limit),
    ),
  export: protectedProcedure
    .input(
      z.object({
        format: z.enum(["markdown", "json"]).default("markdown"),
        sessionId: z.string().trim().max(64).optional(),
        limit: z.number().int().min(1).max(500).default(500),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!isFeatureEnabled(currentFeatureFlags(), "chatExport")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Der Chat-Export ist derzeit deaktiviert.",
        });
      }
      const overview = await listChatSessions(ctx.user.openId, input.limit);
      const wanted = input.sessionId
        ? overview.filter((session) => session.sessionId === sanitizeSessionId(input.sessionId))
        : overview;
      const sessions: ExportSession[] = [];
      for (const session of wanted) {
        const messages = await listChatMessages(
          ctx.user.openId,
          input.limit,
          session.sessionId,
        );
        sessions.push({
          sessionId: session.sessionId,
          title: session.title,
          messages: [...messages]
            .reverse()
            .map((message) => ({
              role: message.role,
              content: message.content,
              createdAt: message.createdAt,
              provider: message.provider,
            })),
        });
      }
      if (sessions.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Keine Chat-Historie zum Export gefunden.",
        });
      }
      return buildChatExport({
        sessions,
        format: input.format,
        userLabel: ctx.user.email ?? undefined,
      });
    }),
  search: protectedProcedure
    .input(
      z.object({
        q: z.string().trim().min(1).max(200),
        sessionId: z.string().trim().max(64).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      const validation = validateSearchQuery(input.q);
      if (!validation.valid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: validation.reason });
      }
      const sessions = await listChatSessions(ctx.user.openId, 500);
      const wanted = input.sessionId
        ? sessions.filter((session) => session.sessionId === sanitizeSessionId(input.sessionId))
        : sessions;
      const candidates = [];
      for (const session of wanted) {
        const messages = await listChatMessages(ctx.user.openId, 500, session.sessionId);
        for (const message of messages) {
          candidates.push({
            role: message.role,
            content: message.content,
            sessionId: session.sessionId,
            title: session.title,
            createdAt: message.createdAt,
          });
        }
      }
      return searchChatMessages(candidates, input.q, input.limit);
    }),
  testConnection: protectedProcedure
    .input(
      z.object({
        provider: providerSchema.default("managed"),
        model: z.string().trim().min(1).max(160).optional(),
      }),
    )
    .mutation(({ input }) =>
      testDevelopmentChatConnection(input.provider, input.model),
    ),
});

export type DevelopmentChatResult = {
  content: string;
  model: string;
  providerUsed: ProviderId;
  fallbackUsed: boolean;
  receivedAt: string;
  /** Sprint 71 — Entscheidung des autonomen Modell-Routers (nur bei "auto"). */
  route?: {
    taskType: "code" | "reasoning" | "ui" | "chat";
    complexity: "light" | "medium" | "heavy";
    attemptedProviders: RouterProviderId[];
    reasons: string[];
  };
  /** Sprint 127 — Werkzeugaufrufe dieser Antwort (Superagent-Entwicklungsfenster). */
  devTrace?: { tool: string; args: string; resultSummary: string }[];
};

/* ==================================================================
 * Sprint 88 — Autonomer Werkzeug-Modus (Agent-Tools).
 *
 * Ist ein Workspace verbunden, erhaelt der Chat-Agent echte Werkzeuge
 * (Repository-Dateien lesen/schreiben/listen, Git-Status/Commit/Push/
 * Pull Request) und arbeitet Prompt-Auftraege selbststaendig ab, statt
 * den Nutzer nach Code zu fragen. Der Multi-Turn-Loop:
 *   Modell -> tool_calls -> Ausfuehrung gegen den Workspace-Service
 *   (renderProxy.callWorkspaceService) -> tool-Ergebnisse -> Modell ...
 * bis eine finale Textantwort vorliegt oder das Iterationslimit
 * erreicht ist (dann finale Antwort erzwungen, ohne Tools).
 * ================================================================== */

/** GitHub-Token fuer Workspace-Git-Operationen: Client-Token oder serverseitiges Admin-Token. */
function resolveAgentGithubToken(role: string | null | undefined, clientToken?: string): string | undefined {
  if (clientToken?.trim()) return clientToken.trim();
  const resolved = resolveAdminGithubToken(
    { ADMIN_GITHUB_TOKEN: process.env.ADMIN_GITHUB_TOKEN, GITHUB_TOKEN: process.env.GITHUB_TOKEN },
    role === "admin",
  );
  return resolved.available ? resolved.token : undefined;
}

/** Fuehrt einen einzelnen Agent-Tool-Aufruf gegen den Workspace-Service aus. */
async function executeAgentTool(
  tool: AgentToolName,
  workspaceId: string,
  args: Record<string, unknown>,
  githubToken?: string,
): Promise<string> {
  const built = buildWorkspaceToolRequest(tool, workspaceId, args);
  if (!built.ok) return `FEHLER: ${built.error}`;
  const { method, path, body } = built.request;
  const result = await callWorkspaceService(path, {
    method,
    headers: githubToken ? { "x-github-token": githubToken } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!result.ok) return `FEHLER (${result.status}): ${result.error}`;
  return formatToolResultForModel(tool, result.json);
}

/** Roh-Aufruf eines Providers mit Tool-Unterstützung (managed + OpenAI-kompatibel). */
async function callProviderWithTools(
  provider: ProviderId,
  messages: Message[],
  requestedModel: string | undefined,
  tools: Tool[] | undefined,
): Promise<InvokeResult> {
  if (provider === "managed" || provider === "auto") {
    return invokeLLM({ messages, tools, model: requestedModel, maxTokens: 1_800 });
  }
  if (provider === "anthropic") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Der autonome Werkzeug-Modus unterstuetzt anthropic derzeit nicht — bitte einen anderen Provider waehlen.",
    });
  }
  const config = getProviderConfig(provider, requestedModel);
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      ...config.headers,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      temperature: 0.2,
      max_tokens: 1_800,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`${provider} antwortet mit ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return (await response.json()) as InvokeResult;
}

/** Provider-Kandidaten fuer den Agent-Modus bei Provider "auto" (Router-Logik). */
async function resolveAgentProviderCandidates(lastUserMessage: string, role?: string | null): Promise<ProviderId[]> {
  const classification = classifyPrompt(lastUserMessage);
  const preferredOrder = await getPreferredProviderOrder();
  const order = buildProviderOrder({
    taskType: classification.taskType,
    complexity: classification.complexity,
    preferredOrder,
    health: getRouterHealth(),
    configuredProviders: getRouterConfiguredProviders(),
    now: Date.now(),
    adminPriority: role === "admin", // Sprint 95: Elite-Override
  });
  const candidates = order
    .filter((entry) => entry.available)
    .map((entry) => entry.provider as string)
    .filter((provider): provider is ProviderId => provider !== "anthropic");
  return candidates.length > 0 ? candidates.slice(0, 4) : ["managed"];
}

type AgentToolChatInput = {
  provider: ProviderId;
  messages: ChatMessage[];
  model?: string;
  role?: string | null;
  workspaceId?: string;
  githubToken?: string;
  branch?: string;
  userOpenId?: string;
  sessionId?: string;
};

/**
 * Sprint 94 — Langzeit-Gedächtnis: Top-Learnings zum aktuellen Prompt laden
 * (Best-Effort — bei Datenbankproblemen bleibt der Prompt unveraendert).
 */
async function loadLearningContext(userOpenId: string | undefined, prompt: string, sessionId?: string): Promise<string> {
  if (!userOpenId) return "";
  try {
    const learnings = await listRecentAgentLearnings(userOpenId, 50);
    const ranked = learnings.map((learning) => ({
      kind: learning.kind,
      title: learning.title,
      detail: learning.detail,
      keywords: learning.keywords,
      createdAt: learning.createdAt.toISOString(),
    }));
    const selected = selectRelevantLearnings(ranked, prompt);
    // Sprint 113: Injektion fuer die Retrieval-Trefferquote registrieren.
    recordLearningInjection(
      sessionId ?? "",
      selected.map((learning) => learning.keywords.split(",").map((word) => word.trim()).filter(Boolean)),
    );
    return formatLearningsForContext(selected);
  } catch (error) {
    console.warn("[agentMemory] Learnings nicht geladen:", error instanceof Error ? error.message.slice(0, 120) : error);
    return "";
  }
}

/** Sprint 94 — save_learning ausfuehren (Datenbank statt Workspace-Service). */
async function executeSaveLearningTool(userOpenId: string | undefined, args: Record<string, unknown>): Promise<string> {
  const title = typeof args.title === "string" ? args.title : "";
  const detail = typeof args.detail === "string" ? args.detail : "";
  const rawKind = typeof args.kind === "string" ? args.kind : undefined;
  if (!title.trim() || !detail.trim()) return "FEHLER: save_learning benoetigt 'title' und 'detail'.";
  if (!userOpenId) return "FEHLER: Langzeit-Gedächtnis ist nur fuer angemeldete Nutzer verfuegbar.";
  const record = buildLearningRecord({
    title,
    detail,
    kind: rawKind && isAgentLearningKind(rawKind) ? rawKind : undefined,
  });
  try {
    await insertAgentLearningRecord({ userOpenId, ...record });
    return `Learning gespeichert [${record.kind}]: ${record.title}`;
  } catch (error) {
    console.warn("[agentMemory] Learning nicht gespeichert:", error instanceof Error ? error.message.slice(0, 120) : error);
    return "FEHLER: Learning konnte nicht gespeichert werden (Datenbank nicht erreichbar).";
  }
}

/** Sprint 94 — Auto-Learning nach nutzwerkzeuglastigen Turns (Best-Effort, nie blockierend). */
async function storeAutoLearning(input: AgentToolChatInput, userMessage: string, assistantSummary: string, toolsUsed: string[]): Promise<void> {
  if (!input.userOpenId || !turnDeservesLearning(toolsUsed)) return;
  try {
    const record = buildLearningRecord(deriveLearningFromTurn(userMessage, assistantSummary, toolsUsed));
    await insertAgentLearningRecord({ userOpenId: input.userOpenId, ...record });
    console.log(`[agentMemory] Auto-Learning gespeichert [${record.kind}]`);
  } catch (error) {
    console.warn("[agentMemory] Auto-Learning nicht gespeichert:", error instanceof Error ? error.message.slice(0, 120) : error);
  }
}

/** Ein Agent-Loop-Lauf gegen genau einen Provider. */
async function runAgentToolLoop(provider: ProviderId, input: AgentToolChatInput): Promise<DevelopmentChatResult> {
  const githubToken = resolveAgentGithubToken(input.role, input.githubToken);
  const lastUserMessage = [...input.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const learningContext = await loadLearningContext(input.userOpenId, lastUserMessage, input.sessionId);
  const conversation: Message[] = [
    { role: "system", content: `${buildAgentSystemPrompt(input.branch ?? "main")}${learningContext}` },
    ...input.messages.map((message) => ({ role: message.role, content: message.content })),
  ];
  const businessTools = BUSINESS_TOOL_NAMES.map((name) => ({
    type: "function" as const,
    function: {
      name,
      description: BUSINESS_TOOL_DESCRIPTIONS[name],
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  }));
  const tools = [...(AGENT_TOOL_DEFINITIONS as unknown as Tool[]), ...(businessTools as unknown as Tool[])];
  const toolsUsedInTurn = new Set<string>();
  // Sprint 127 — Werkzeugaufrufe fuer das mobile Entwicklungsfenster mitschneiden
  // (Tool-Name, kurze Argumentzusammenfassung, kurzes Ergebnis). Bewusst separat
  // vom Konversationsverlauf (der volle Tool-Content bleibt fuer den naechsten
  // Provider-Call erhalten) und laengenbegrenzt fuer die Persistenz.
  const devTrace: { tool: string; args: string; resultSummary: string }[] = [];

  for (let iteration = 0; iteration < MAX_AGENT_TOOL_ITERATIONS; iteration += 1) {
    const payload = await callProviderWithTools(provider, conversation, input.model, tools);
    const choice = payload?.choices?.[0];
    const toolCalls: ToolCall[] = choice?.message?.tool_calls ?? [];
    if (!toolCalls.length) {
      const content = extractContent(payload);
      await storeAutoLearning(input, lastUserMessage, content, [...toolsUsedInTurn]);
      return { content, model: payload.model, providerUsed: provider, fallbackUsed: false, receivedAt: new Date().toISOString(), devTrace: devTrace.length ? devTrace : undefined };
    }
    conversation.push({
      role: "assistant",
      content: typeof choice.message.content === "string" ? choice.message.content : "",
      tool_calls: toolCalls,
    });
    for (const call of toolCalls) {
      const toolName = call.function?.name ?? "";
      toolsUsedInTurn.add(toolName);
      const toolArgs = parseToolArguments(call.function?.arguments);
      const toolResult = toolName === "save_learning"
        ? await executeSaveLearningTool(input.userOpenId, toolArgs)
        : isAgentToolName(toolName)
          ? await executeAgentTool(toolName, input.workspaceId ?? "", toolArgs, githubToken)
          : isBusinessToolName(toolName)
            ? formatBusinessResult(toolName, await executeBusinessSnapshot(toolName))
            : `FEHLER: Unbekanntes Werkzeug '${toolName}'.`;
      devTrace.push({
        tool: toolName || "unbekannt",
        args: JSON.stringify(toolArgs ?? {}).slice(0, 240),
        resultSummary: toolResult.slice(0, 320),
      });
      conversation.push({ role: "tool", tool_call_id: call.id, content: toolResult.slice(0, MAX_TOOL_RESULT_CHARS) });
    }
  }

  // Iterationslimit erreicht: finale Antwort ohne Tools erzwingen.
  const payload = await callProviderWithTools(provider, conversation, input.model, undefined);
  const finalContent = extractContent(payload);
  await storeAutoLearning(input, lastUserMessage, finalContent, [...toolsUsedInTurn]);
  return { content: finalContent, model: payload.model, providerUsed: provider, fallbackUsed: false, receivedAt: new Date().toISOString(), devTrace: devTrace.length ? devTrace : undefined };
}

/** Agent-Modus mit Provider-Failover (auto) bzw. fixem Provider. */
async function handleAgentToolChat(input: AgentToolChatInput): Promise<DevelopmentChatResult> {
  const lastUserMessage = [...input.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const providers = input.provider === "auto"
    ? await resolveAgentProviderCandidates(lastUserMessage, input.role)
    : [input.provider];

  let lastError: unknown = new Error("Kein verfuegbarer KI-Provider fuer die Werkzeug-Route.");
  for (const provider of providers) {
    const startedAt = Date.now();
    try {
      const reply = await runAgentToolLoop(provider, input);
      recordRouterOutcome(provider as RouterProviderId, { kind: "success", latencyMs: Date.now() - startedAt }, Date.now());
      return reply;
    } catch (error) {
      lastError = error;
      if (error instanceof TRPCError) {
        recordRouterOutcome(provider as RouterProviderId, { kind: "failure", retryable: false, rateLimited: false }, Date.now());
        throw error;
      }
      recordRouterOutcome(provider as RouterProviderId, { kind: "failure", retryable: isTransientChatError(error), rateLimited: /\b429\b/.test(error instanceof Error ? error.message : "") }, Date.now());
      if (!isTransientChatError(error)) break;
    }
  }
  throw new TRPCError({
    code: "BAD_GATEWAY",
    message: lastError instanceof Error
      ? sanitizeChatError(lastError.message, "Der autonome Chat-Agent konnte keinen KI-Provider erreichen.")
      : "Der autonome Chat-Agent konnte keinen KI-Provider erreichen.",
  });
}

/**
 * Kern des Entwicklungschats: ruft den primären Provider auf und weicht bei
 * transienten Fehlern auf die konfigurierten Fallback-Provider aus. Als
 * eigenständige Funktion exportiert, damit die gesamte Kette (Provider-
 * Auswahl, Fallback, Fehlersemantik) deterministisch getestet werden kann.
 */
type RoutedMessage = { role: "user" | "assistant" | "system"; content: string };

/** Live-Systemdaten fuer den Superagent-Briefing-Kontext sammeln. */
async function buildSuperagentContext() {
  const now = Date.now();
  const errors = getRuntimeLogs()
    .filter((entry) => entry.level === "error" || entry.level === "warn")
    .slice(-5)
    .map((entry) => `${entry.level}: ${entry.message}`.slice(0, 300));
  let workspaceConnected = false;
  const workspaceUrl = process.env.WORKSPACE_SERVICE_URL?.trim().replace(/\/$/, "");
  if (workspaceUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2_000);
      const response = await fetch(`${workspaceUrl}/api/v1/health`, { signal: controller.signal });
      clearTimeout(timer);
      workspaceConnected = response.ok;
    } catch {
      workspaceConnected = false;
    }
  }
  return {
    runtime: {
      state: classifyRuntimeState({ processUp: true, nowMs: now }),
      uptimeSeconds: Math.round(process.uptime()),
      activeUrl: process.env.APP_BASE_URL?.trim() ?? null,
    },
    workspace: {
      connected: workspaceConnected,
      repositoryUrl: process.env.CYBERSARAH_REVENUE_REPOSITORY_URL?.trim() ?? null,
      branch: "main",
    },
    recentErrors: errors,
    availableSkills: ["agent", "quality", "diff"],
  };
}

/**
 * Sprint 71 — Autonomer Modell-Router: klassifiziert den Auftrag, waehlt die
 * beste Provider-Reihenfolge und failover-t bei Fehlern/Timeouts/Rate-Limits
 * unterbrechungsfrei auf die naechste Alternative. Admins erhalten zusaetzlich
 * den Superagent-Briefing-Kontext (Live-Status, Logs, Workspace).
 */
async function handleAutoRoutedChat(
  input: { messages: ChatMessage[]; model?: string; role?: string | null },
): Promise<DevelopmentChatResult> {
  const lastUserMessage = [...input.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const classification = classifyPrompt(lastUserMessage);
  const preferredOrder = await getPreferredProviderOrder();
  const now = Date.now();
  const order = buildProviderOrder({
    adminPriority: input.role === "admin", // Sprint 95: Elite-Override
    taskType: classification.taskType,
    complexity: classification.complexity,
    preferredOrder,
    health: getRouterHealth(),
    configuredProviders: getRouterConfiguredProviders(),
    now,
  });
  const candidates = order
    .filter((entry) => entry.available)
    .slice(0, 4)
    .map((entry) => entry.provider) as RouterProviderId[];

  const isAdmin = input.role === "admin";
  let messages: RoutedMessage[] = input.messages;
  if (isAdmin && shouldAttachSuperagentBrief(lastUserMessage, input.role)) {
    const context = await buildSuperagentContext();
    const brief = buildSuperagentBrief({
      ...context,
      role: input.role,
      now: new Date(),
    });
    messages = [{ role: "system", content: brief }, ...input.messages];
  }

  let lastError: unknown = new Error("Kein verfuegbarer KI-Provider fuer die automatische Route.");
  for (const provider of candidates) {
    const startedAt = Date.now();
    try {
      const reply = await callProvider(provider, messages as ChatMessage[], input.model);
      recordRouterOutcome(provider, { kind: "success", latencyMs: Date.now() - startedAt }, Date.now());
      return {
        ...reply,
        providerUsed: provider,
        fallbackUsed: provider !== candidates[0],
        receivedAt: new Date().toISOString(),
        route: {
          taskType: classification.taskType,
          complexity: classification.complexity,
          attemptedProviders: candidates,
          reasons: classification.reasons,
        },
      };
    } catch (error) {
      lastError = error;
      if (error instanceof TRPCError) {
        recordRouterOutcome(provider as RouterProviderId, { kind: "failure", retryable: false, rateLimited: false }, Date.now());
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      const rateLimited = /\b429\b/.test(message);
      recordRouterOutcome(
        provider,
        error instanceof Error && error.name === "AbortError"
          ? { kind: "timeout" }
          : { kind: "failure", retryable: isTransientChatError(error), rateLimited },
        Date.now(),
      );
      if (!isTransientChatError(error)) break;
    }
  }
  throw new TRPCError({
    code: "BAD_GATEWAY",
    message: lastError instanceof Error
      ? sanitizeChatError(lastError.message, "Der autonome Modell-Router konnte keinen KI-Provider erreichen.")
      : "Der autonome Modell-Router konnte keinen KI-Provider erreichen.",
  });
}

export async function handleDevelopmentChat(input: {
  provider: ProviderId;
  messages: ChatMessage[];
  model?: string;
  role?: string | null;
  workspaceId?: string;
  githubToken?: string;
  branch?: string;
  userOpenId?: string;
  sessionId?: string;
}): Promise<DevelopmentChatResult> {
  if (input.workspaceId) {
    return handleAgentToolChat(input);
  }
  if (input.provider === "auto") {
    return handleAutoRoutedChat({ messages: input.messages, model: input.model, role: input.role });
  }
  try {
    const reply = await callProvider(input.provider, input.messages, input.model);
    return { ...reply, providerUsed: input.provider, fallbackUsed: false, receivedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (isTransientChatError(error)) {
      let lastFallbackError: unknown = error;
      for (const fallbackProvider of getFallbackProviders(input.provider)) {
        try {
          const reply = await callProvider(fallbackProvider, input.messages, input.model);
          return { ...reply, providerUsed: fallbackProvider, fallbackUsed: true, receivedAt: new Date().toISOString() };
        } catch (fallbackError) {
          lastFallbackError = fallbackError;
          if (!isTransientChatError(fallbackError)) break;
        }
      }
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: lastFallbackError instanceof Error
          ? sanitizeChatError(lastFallbackError.message, "Die konfigurierten KI-Fallback-Provider konnten den Entwicklungsauftrag nicht verarbeiten.")
          : "Die konfigurierten KI-Fallback-Provider konnten den Entwicklungsauftrag nicht verarbeiten.",
      });
    }
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: error instanceof Error
        ? sanitizeChatError(error.message, "Der KI-Provider konnte den Entwicklungsauftrag nicht verarbeiten.")
        : "Der KI-Provider konnte den Entwicklungsauftrag nicht verarbeiten.",
    });
  }
}

export type DevelopmentChatConnectionTestResult = {
  ok: boolean;
  provider: ProviderId;
  model?: string;
  latencyMs: number;
  error?: string;
};

/**
 * Redigiert Fehlermeldungen für die Anzeige: URLs und potenziell sensible
 * Fragmente werden entfernt, die Länge begrenzt.
 */
/**
 * Sprint 53 — redigiert Backend-Fehlermeldungen (URLs, Keys) auf dem
 * Chat-Sende-Pfad, bevor sie an den Client gehen.
 */
export function sanitizeChatError(message: string, fallback: string): string {
  const sanitized = sanitizeConnectionError(message);
  return sanitized.length > 0 ? sanitized : fallback;
}

function sanitizeConnectionError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/https?:\/\/\S+/g, "[redigiert]")
    .replace(/(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{10,})/g, "[redigiert]")
    .slice(0, 400);
}

/**
 * Prüft die Chat-Anbindung Ende-zu-Ende über denselben Provider-Pfad wie der
 * echte Entwicklungsauftrag und misst die Latenz. Fehler werden redigiert
 * zurückgegeben, damit die Ursache sichtbar bleibt, ohne Endpoints oder
 * Schlüsselfragmente preiszugeben.
 */
export async function testDevelopmentChatConnection(
  provider: ProviderId,
  requestedModel?: string,
): Promise<DevelopmentChatConnectionTestResult> {
  const startedAt = Date.now();
  try {
    const reply = await callProvider(provider, [
      { role: "user", content: "Antworte ausschließlich mit dem Wort OK." },
    ], requestedModel);
    return {
      ok: true,
      provider,
      model: reply.model,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      provider,
      latencyMs: Date.now() - startedAt,
      error: sanitizeConnectionError(error),
    };
  }
}
