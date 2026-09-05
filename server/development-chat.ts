import { TRPCError } from "@trpc/server";
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
});

type ProviderId = z.infer<typeof providerSchema>;
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
  const result = await invokeLLM({
    messages: toProviderMessages(messages) as Message[],
    model: requestedModel,
    maxTokens: 1_800,
  });
  return { content: extractContent(result), model: result.model };
}

function isTransientChatError(error: unknown) {
  if (error instanceof TRPCError) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /\b(408|425|429|500|502|503|504)\b/.test(message) ||
    (error instanceof TypeError) ||
    (error instanceof Error && error.name === "AbortError");
}

function getFallbackProvider(provider: ProviderId) {
  const fallback = getEnv("AI_FALLBACK_PROVIDER");
  if (!fallback || fallback === provider || fallback === "managed" && provider === "managed") return undefined;
  const parsed = providerSchema.safeParse(fallback);
  return parsed.success ? parsed.data : undefined;
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
  send: protectedProcedure.input(chatInputSchema).mutation(async ({ input }) => {
    try {
      const reply = await callProvider(input.provider, input.messages, input.model);
      return { ...reply, providerUsed: input.provider, fallbackUsed: false, receivedAt: new Date().toISOString() };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      const fallbackProvider = isTransientChatError(error) ? getFallbackProvider(input.provider) : undefined;
      if (fallbackProvider) {
        try {
          const reply = await callProvider(fallbackProvider, input.messages, input.model);
          return { ...reply, providerUsed: fallbackProvider, fallbackUsed: true, receivedAt: new Date().toISOString() };
        } catch (fallbackError) {
          throw new TRPCError({ code: "BAD_GATEWAY", message: fallbackError instanceof Error ? fallbackError.message : "Der KI-Fallback-Provider konnte den Entwicklungsauftrag nicht verarbeiten." });
        }
      }
      throw new TRPCError({ code: "BAD_GATEWAY", message: error instanceof Error ? error.message : "Der KI-Provider konnte den Entwicklungsauftrag nicht verarbeiten." });
    }
  }),
});
