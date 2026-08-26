import type { ProviderId } from "@/lib/studio-settings-logic";

export type ProviderActivity = "idle" | "requesting" | "active" | "fallback" | "error";
export type ProviderChannel = "local" | "cloud";

const localProviders = new Set<ProviderId>(["ollama", "lmstudio", "custom"]);
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

export function getProviderChannel(provider: ProviderId): ProviderChannel {
  return localProviders.has(provider) ? "local" : "cloud";
}

export function getProviderLabel(provider: ProviderId) {
  return labels[provider];
}

export function getProviderStatusCopy(provider: ProviderId, activity: ProviderActivity, providerUsed?: ProviderId) {
  const usedProvider = providerUsed ?? provider;
  if (activity === "requesting") return { title: "KI-Anfrage läuft", detail: `Verbinde mit ${getProviderLabel(usedProvider)} …`, tone: "accent" as const, badge: "Prüfung" };
  if (activity === "fallback") return { title: "Cloud-Fallback aktiv", detail: `${getProviderLabel(provider)} war nicht erreichbar · ${getProviderLabel(usedProvider)} antwortet.`, tone: "warning" as const, badge: "Fallback" };
  if (activity === "error") return { title: "Provider nicht erreichbar", detail: `${getProviderLabel(provider)} konnte keine Antwort liefern.`, tone: "warning" as const, badge: "Fehler" };
  if (activity === "active") return { title: getProviderChannel(usedProvider) === "local" ? "Lokale KI aktiv" : "Cloud-Provider aktiv", detail: `${getProviderLabel(usedProvider)} verarbeitet den aktuellen Auftrag.`, tone: getProviderChannel(usedProvider) === "local" ? "ready" as const : "accent" as const, badge: getProviderChannel(usedProvider) === "local" ? "Lokal" : "Cloud" };
  return { title: getProviderChannel(provider) === "local" ? "Lokale KI ausgewählt" : "Cloud-Provider ausgewählt", detail: `${getProviderLabel(provider)} wird für den nächsten Auftrag verwendet.`, tone: getProviderChannel(provider) === "local" ? "ready" as const : "accent" as const, badge: getProviderChannel(provider) === "local" ? "Lokal" : "Cloud" };
}
