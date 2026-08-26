export type ProviderId = "managed" | "openai" | "gemini" | "openrouter" | "groq" | "together" | "anthropic";

export const providerDefaults: Record<ProviderId, { model: string; freeTierNote: string }> = {
  managed: { model: "gpt-4o-mini", freeTierNote: "On-Server-Konfiguration" },
  openai: { model: "gpt-4o-mini", freeTierNote: "Kosten und Limits hängen vom OpenAI-Konto ab." },
  gemini: { model: "gemini-2.5-flash", freeTierNote: "Kostenlose Nutzung hängt von Region, Konto und aktuellem Google-AI-Studio-Limit ab." },
  openrouter: { model: "openrouter/free", freeTierNote: "Verwendet den OpenRouter-Free-Router, sofern verfügbar; Limits können sich ändern." },
  groq: { model: "llama-3.3-70b-versatile", freeTierNote: "Kosten und Limits hängen vom Groq-Konto ab." },
  together: { model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", freeTierNote: "Kosten und Limits hängen vom Together-Konto ab." },
  anthropic: { model: "claude-3-5-haiku-latest", freeTierNote: "Kosten und Limits hängen vom Anthropic-Konto ab." },
};

export type PersistedStudioSettings = {
  workspaceUrl: string;
  repositoryUrl: string;
  branch: string;
  provider: ProviderId;
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
    protectChatContent: input.protectChatContent,
  };
}

export function getRepositoryLabel(repositoryUrl: string) {
  const withoutSuffix = repositoryUrl.trim().replace(/\/$/, "").replace(/\.git$/, "");
  return withoutSuffix.split("/").filter(Boolean).slice(-2).join("/") || "Lokaler Arbeitsbereich";
}
