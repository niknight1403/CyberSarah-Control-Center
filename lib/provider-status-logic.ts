import type { ProviderId } from "@/lib/studio-settings-logic";

export type ProviderActivity =
  | "idle"
  | "requesting"
  | "active"
  | "fallback"
  | "error";
export type ProviderChannel = "local" | "cloud";

const localProviders = new Set<ProviderId>(["ollama", "lmstudio"]);
const labels: Record<ProviderId, string> = {
  managed: "On-Server",
  openai: "OpenAI",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  groq: "Groq",
  together: "Together AI",
  anthropic: "Anthropic",
  ollama: "Ollama lokal",
  lmstudio: "LM Studio lokal",
  custom: "Eigener Endpoint",
  huggingface: "Hugging Face",
};

/**
 * Custom endpoints default to cloud because their location cannot be inferred
 * safely from the provider id alone. Callers with explicit endpoint knowledge
 * can opt into the local channel.
 */
export function getProviderChannel(
  provider: ProviderId,
  customChannel: ProviderChannel = "cloud",
): ProviderChannel {
  if (provider === "custom") return customChannel;
  return localProviders.has(provider) ? "local" : "cloud";
}

export function getProviderLabel(provider: ProviderId) {
  return labels[provider];
}

export function getProviderStatusCopy(
  provider: ProviderId,
  activity: ProviderActivity,
  providerUsed?: ProviderId,
  customChannel: ProviderChannel = "cloud",
) {
  const usedProvider = providerUsed ?? provider;
  if (activity === "requesting")
    return {
      title: "KI-Anfrage läuft",
      detail: `Verbinde mit ${getProviderLabel(usedProvider)} …`,
      tone: "accent" as const,
      badge: "Prüfung",
    };
  if (activity === "fallback")
    return {
      title: "Cloud-Fallback aktiv",
      detail: `${getProviderLabel(provider)} war nicht erreichbar · ${getProviderLabel(usedProvider)} antwortet.`,
      tone: "warning" as const,
      badge: "Fallback",
    };
  if (activity === "error")
    return {
      title: "Provider nicht erreichbar",
      detail: `${getProviderLabel(provider)} konnte keine Antwort liefern.`,
      tone: "warning" as const,
      badge: "Fehler",
    };
  if (activity === "active") {
    const channel = getProviderChannel(usedProvider, customChannel);
    return {
      title: channel === "local" ? "Lokale KI aktiv" : "Cloud-Provider aktiv",
      detail: `${getProviderLabel(usedProvider)} verarbeitet den aktuellen Auftrag.`,
      tone: channel === "local" ? ("ready" as const) : ("accent" as const),
      badge: channel === "local" ? "Lokal" : "Cloud",
    };
  }
  const channel = getProviderChannel(provider, customChannel);
  return {
    title:
      channel === "local"
        ? "Lokale KI ausgewählt"
        : "Cloud-Provider ausgewählt",
    detail: `${getProviderLabel(provider)} wird für den nächsten Auftrag verwendet.`,
    tone: channel === "local" ? ("ready" as const) : ("accent" as const),
    badge: channel === "local" ? "Lokal" : "Cloud",
  };
}
