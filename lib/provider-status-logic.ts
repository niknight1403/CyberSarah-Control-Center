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

function isPrivateEndpoint(endpoint?: string) {
  if (!endpoint) return false;
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    )
      return true;
    if (
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    )
      return true;
    return hostname.endsWith(".local");
  } catch {
    return false;
  }
}

export function getProviderChannel(
  provider: ProviderId,
  endpoint?: string,
): ProviderChannel {
  if (provider === "custom")
    return isPrivateEndpoint(endpoint) ? "local" : "cloud";
  return localProviders.has(provider) ? "local" : "cloud";
}

export function getProviderLabel(provider: ProviderId) {
  return labels[provider];
}

export function getProviderStatusCopy(
  provider: ProviderId,
  activity: ProviderActivity,
  providerUsed?: ProviderId,
  endpoint?: string,
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
  const channel = getProviderChannel(
    activity === "active" ? usedProvider : provider,
    endpoint,
  );
  if (activity === "active")
    return {
      title: channel === "local" ? "Lokale KI aktiv" : "Cloud-Provider aktiv",
      detail: `${getProviderLabel(usedProvider)} verarbeitet den aktuellen Auftrag.`,
      tone: channel === "local" ? ("ready" as const) : ("accent" as const),
      badge: channel === "local" ? "Lokal" : "Cloud",
    };
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
