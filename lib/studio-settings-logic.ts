export type ProviderId = "managed" | "openai" | "gemini" | "openrouter" | "groq" | "together" | "anthropic" | "ollama" | "lmstudio" | "custom" | "huggingface";

export const freeProviderIds: readonly ProviderId[] = ["gemini", "openrouter", "groq", "ollama", "lmstudio", "huggingface"];
export type CloudProviderId = Exclude<ProviderId, "managed" | "ollama" | "lmstudio" | "custom">;
export const cloudProviderIds: readonly CloudProviderId[] = ["openai", "gemini", "openrouter", "groq", "together", "anthropic", "huggingface"];

export function isFreeTierProvider(provider: ProviderId) {
  return freeProviderIds.includes(provider);
}

export function getDefaultFreeProvider(): ProviderId {
  return "gemini";
}

export const providerDefaults: Record<ProviderId, { model: string; freeTierNote: string }> = {
  managed: { model: "gpt-4o-mini", freeTierNote: "On-Server-Konfiguration" },
  openai: { model: "gpt-4o-mini", freeTierNote: "Kosten und Limits hängen vom OpenAI-Konto ab." },
  gemini: { model: "gemini-3.6-flash", freeTierNote: "Kostenlose Nutzung hängt von Region, Konto und aktuellem Google-AI-Studio-Limit ab." },
  openrouter: { model: "openrouter/free", freeTierNote: "Verwendet den OpenRouter-Free-Router, sofern verfügbar; Limits können sich ändern." },
  groq: { model: "llama-3.3-70b-versatile", freeTierNote: "Kosten und Limits hängen vom Groq-Konto ab." },
  together: { model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", freeTierNote: "Kosten und Limits hängen vom Together-Konto ab." },
  anthropic: { model: "claude-3-5-haiku-latest", freeTierNote: "Kosten und Limits hängen vom Anthropic-Konto ab." },
  ollama: { model: "qwen2.5-coder:7b", freeTierNote: "Kostenlos lokal; benötigt einen erreichbaren Ollama-Server." },
  lmstudio: { model: "local-model", freeTierNote: "Kostenlos lokal; benötigt einen laufenden LM-Studio-Server." },
  custom: { model: "local-model", freeTierNote: "OpenAI-kompatibler eigener Endpoint; Kosten und Limits bestimmst du selbst." },
  huggingface: { model: "deepseek-ai/DeepSeek-R1:fastest", freeTierNote: "Begrenztes monatliches Free-Guthaben; Modell- und Provider-Verfügbarkeit kann sich ändern." },
};

export type LocalProviderEndpoints = {
  ollama: string;
  lmstudio: string;
};

export const defaultLocalProviderEndpoints: LocalProviderEndpoints = {
  ollama: "http://127.0.0.1:11434/v1",
  lmstudio: "http://127.0.0.1:1234/v1",
};

export function normalizeLocalProviderEndpoint(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : fallback;
}

export function normalizeLocalProviderEndpoints(input?: Partial<LocalProviderEndpoints>): LocalProviderEndpoints {
  return {
    ollama: normalizeLocalProviderEndpoint(input?.ollama, defaultLocalProviderEndpoints.ollama),
    lmstudio: normalizeLocalProviderEndpoint(input?.lmstudio, defaultLocalProviderEndpoints.lmstudio),
  };
}

export type PersistedStudioSettings = {
  workspaceUrl: string;
  repositoryUrl: string;
  branch: string;
  provider: ProviderId;
  localProviderEndpoints?: Partial<LocalProviderEndpoints>;
  protectChatContent: boolean;
};

export function normalizeWorkspaceUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

export function toPersistedStudioSettings(input: PersistedStudioSettings): PersistedStudioSettings {
  return {
    workspaceUrl: normalizeWorkspaceUrl(input.workspaceUrl),
    repositoryUrl: input.repositoryUrl.trim(),
    branch: input.branch.trim() || "main",
    provider: input.provider,
    localProviderEndpoints: normalizeLocalProviderEndpoints(input.localProviderEndpoints),
    protectChatContent: input.protectChatContent,
  };
}

export function getRepositoryLabel(repositoryUrl: string) {
  const withoutSuffix = repositoryUrl.trim().replace(/\/$/, "").replace(/\.git$/, "");
  return withoutSuffix.split("/").filter(Boolean).slice(-2).join("/") || "Lokaler Arbeitsbereich";
}
