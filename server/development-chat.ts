import { TRPCError } from "@trpc/server";
import { insertChatTurn, listChatMessages, listChatSessions } from "./db";
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
import {
  buildPersistableTurn,
  toDisplayHistory,
} from "../lib/chat-history-logic";
import { z } from "zod";
import { invokeLLM, type Message } from "./_core/llm";
import { protectedProcedure, router } from "./_core/trpc";

const providerSchema = z.enum([
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

function getProviderConfig(provider: Exclude<ProviderId, "managed" | "anthropic">, requestedModel?: string): ProviderConfig {
  const base: Record<Exclude<ProviderId, "managed" | "anthropic">, Omit<ProviderConfig, "model"> & { defaultModel: string }> = {
    openai: {
      endpoint: getEnv("AI_OPENAI_BASE_URL") ?? "https://api.openai.com/v1/chat/completions",
      apiKey: getEnv("AI_OPENAI_API_KEY") ?? getEnv("OPENAI_API_KEY"),
      defaultModel: getEnv("AI_OPENAI_MODEL") ?? "gpt-4o-mini",
    },
    gemini: {
      endpoint: getEnv("AI_GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: getEnv("AI_GEMINI_API_KEY") ?? getEnv("GEMINI_API_KEY"),
      defaultModel: getEnv("AI_GEMINI_MODEL") ?? "gemini-2.5-flash",
    },
    openrouter: {
      endpoint: getEnv("AI_OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1/chat/completions",
      apiKey: getEnv("AI_OPENROUTER_API_KEY") ?? getEnv("OPENROUTER_API_KEY"),
      defaultModel: getEnv("AI_OPENROUTER_MODEL") ?? "openrouter/free",
      headers: { "HTTP-Referer": getEnv("APP_BASE_URL") ?? "https://localhost", "X-Title": "CyberSarah Control Center" },
    },
    groq: {
      endpoint: getEnv("AI_GROQ_BASE_URL") ?? "https://api.groq.com/openai/v1/chat/completions",
      apiKey: getEnv("AI_GROQ_API_KEY") ?? getEnv("GROQ_API_KEY"),
      defaultModel: getEnv("AI_GROQ_MODEL") ?? "llama-3.3-70b-versatile",
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

async function callOpenAICompatibleProvider(provider: Exclude<ProviderId, "managed" | "anthropic">, messages: ChatMessage[], requestedModel?: string) {
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
  if (provider === "managed") return callManaged(messages, model);
  if (provider === "anthropic") return callAnthropic(messages, model);
  return callOpenAICompatibleProvider(provider, messages, model);
}

export const developmentChatRouter = router({
  providers: protectedProcedure.query(() => ({
    providers: [
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
      const result = await handleDevelopmentChat(input);
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
      toDisplayHistory(
        await listChatMessages(ctx.user.openId, input.limit, input.sessionId),
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
};

/**
 * Kern des Entwicklungschats: ruft den primären Provider auf und weicht bei
 * transienten Fehlern auf die konfigurierten Fallback-Provider aus. Als
 * eigenständige Funktion exportiert, damit die gesamte Kette (Provider-
 * Auswahl, Fallback, Fehlersemantik) deterministisch getestet werden kann.
 */
export async function handleDevelopmentChat(input: {
  provider: ProviderId;
  messages: ChatMessage[];
  model?: string;
}): Promise<DevelopmentChatResult> {
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
