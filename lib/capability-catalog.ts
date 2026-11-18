/**
 * Central capability inventory for the CyberSarah integration control plane.
 *
 * Configuration is NOT a live health check. This catalog deliberately reports
 * health as "not_checked" until a provider-specific, read-only probe exists.
 * Only environment-variable NAMES are returned; secret values never leave the server.
 */
export type CapabilityCategory =
  | "llm" | "tts" | "mcp" | "payments" | "commerce" | "crm"
  | "analytics" | "social" | "publishing" | "email" | "media"
  | "developer" | "observability" | "search";

export type CapabilityDefinition = {
  id: string;
  name: string;
  category: CapabilityCategory;
  envAllOf?: readonly string[];
  envAnyOf?: readonly string[];
  builtin?: boolean;
  capabilities: readonly string[];
  setupUrl?: string;
  boundary: string;
};

export type CapabilityStatus = CapabilityDefinition & {
  configuration: "available" | "configured" | "partial" | "not_configured";
  health: "healthy" | "degraded" | "unavailable" | "not_checked";
  configuredEnv: string[];
  missingEnv: string[];
  lastChecked: string | null;
};

export const CAPABILITY_CATALOG: readonly CapabilityDefinition[] = [
  { id: "llm-openai", name: "OpenAI API", category: "llm", envAnyOf: ["OPENAI_API_KEY", "OPENAI_BACKUP_KEY"], capabilities: ["Chat completions", "LLM fallback"], setupUrl: "https://platform.openai.com/api-keys", boundary: "Kostenpflichtige Requests nur nach Budget-/Provider-Policy." },
  { id: "llm-groq", name: "Groq", category: "llm", envAllOf: ["GROQ_API_KEY"], capabilities: ["OpenAI-kompatible Inferenz", "Fallback-Routing"], setupUrl: "https://console.groq.com/keys", boundary: "Quota und Modellverfügbarkeit providerseitig prüfen." },
  { id: "llm-gemini", name: "Google Gemini", category: "llm", envAnyOf: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], capabilities: ["LLM-Inferenz", "Fallback-Routing"], setupUrl: "https://aistudio.google.com/app/apikey", boundary: "Kostenlose Limits sind nicht garantiert." },
  { id: "llm-openrouter", name: "OpenRouter", category: "llm", envAllOf: ["OPENROUTER_API_KEY"], capabilities: ["Multi-Model-Routing", "Free-Model-Fallback"], setupUrl: "https://openrouter.ai/keys", boundary: "Kosten-/Free-Model-Status vor produktiven Calls prüfen." },
  { id: "llm-cerebras", name: "Cerebras", category: "llm", envAllOf: ["CEREBRAS_API_KEY"], capabilities: ["Schnelle Inferenz", "Fallback-Routing"], setupUrl: "https://cloud.cerebras.ai/", boundary: "Provider-Quota und Rate-Limits beachten." },
  { id: "llm-huggingface", name: "Hugging Face Inference", category: "llm", envAnyOf: ["HF_TOKEN", "HUGGINGFACE_API_KEY"], capabilities: ["Inference API", "Modell-Fallback"], setupUrl: "https://huggingface.co/settings/tokens", boundary: "Modellzugriff und Nutzungsrechte pro Modell prüfen." },
  { id: "llm-mistral", name: "Mistral", category: "llm", envAllOf: ["MISTRAL_API_KEY"], capabilities: ["LLM-Inferenz", "Fallback-Routing"], setupUrl: "https://console.mistral.ai/api-keys/", boundary: "Kosten- und Rate-Limits beachten." },
  { id: "llm-ollama", name: "Ollama / Local LLM", category: "llm", envAllOf: ["OLLAMA_BASE_URL"], capabilities: ["Lokale Inferenz", "Offline-Fallback"], setupUrl: "https://ollama.com/", boundary: "Erreichbarkeit des lokalen Hosts ist separat zu testen." },
  { id: "tts-edge", name: "Microsoft Edge TTS", category: "tts", builtin: true, capabilities: ["Deutschsprachige Sprachsynthese", "MP3-Cache"], boundary: "Benötigt ausgehende Verbindung zum Edge-TTS-Dienst; keine Verfügbarkeitsgarantie." },
  { id: "tts-elevenlabs", name: "ElevenLabs", category: "tts", envAllOf: ["ELEVENLABS_API_KEY"], capabilities: ["Premium-TTS", "Voiceover"], setupUrl: "https://elevenlabs.io/app/settings/api-keys", boundary: "Voice-Rechte, Kontingente und Kosten prüfen." },
  { id: "mcp-remote", name: "Remote MCP Server", category: "mcp", envAllOf: ["MCP_SERVER_URL"], capabilities: ["Tool discovery", "Streamable HTTP", "SSE fallback"], boundary: "Tool-Ausführung bleibt durch Grants, Approval und Audit begrenzt." },
  { id: "payments-stripe", name: "Stripe", category: "payments", envAllOf: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], capabilities: ["Checkout", "Abonnements", "signierte Webhooks", "Produkt-/Preis-Katalog"], setupUrl: "https://dashboard.stripe.com/apikeys", boundary: "Live-Zahlungen und Katalogänderungen benötigen explizite Freigabe." },
  { id: "commerce-digistore24", name: "Digistore24", category: "commerce", envAllOf: ["DIGISTORE24_API_KEY", "DIGISTORE24_IPN_SECRET"], capabilities: ["Affiliate-Katalog", "REST-Sync", "IPN", "Provisionen"], setupUrl: "https://www.digistore24.com/app/api_keys", boundary: "IPN-Signatur prüfen; keine Produkt-/Checkout-Änderung ohne Review." },
  { id: "crm-hubspot", name: "HubSpot", category: "crm", envAllOf: ["HUBSPOT_ACCESS_TOKEN"], capabilities: ["CRM-Kontakte", "Deals", "Pipeline", "MRR-Abgleich"], setupUrl: "https://app.hubspot.com/private-apps/", boundary: "Schreibzugriffe nur mit minimalen Scopes und Freigabe." },
  { id: "analytics-ga4", name: "Google Analytics 4", category: "analytics", envAllOf: ["GA4_PROPERTY_ID", "GA4_ACCESS_TOKEN"], capabilities: ["Sessions", "Nutzer", "Conversions", "Akquisitionskanäle"], setupUrl: "https://analytics.google.com/", boundary: "Nur aggregierte Analytics-Daten; Consent und Datenschutz beachten." },
  { id: "analytics-search-console", name: "Google Search Console", category: "analytics", envAnyOf: ["GOOGLE_SEARCH_CONSOLE_TOKEN", "GSC_ACCESS_TOKEN"], capabilities: ["SEO-Klicks", "Impressionen", "CTR", "Position"], setupUrl: "https://search.google.com/search-console", boundary: "Nur für verifizierte Properties und autorisierte Konten." },
  { id: "social-meta", name: "Meta / Instagram", category: "social", envAnyOf: ["META_ACCESS_TOKEN", "INSTAGRAM_ACCESS_TOKEN", "IG_ACCESS_TOKEN"], capabilities: ["Profil-/Reichweitendaten", "Insights", "Publishing je Scope"], setupUrl: "https://developers.facebook.com/apps/", boundary: "Posting, DMs und Ads erfordern passende App-Review-/Scopes und Freigabe." },
  { id: "social-tiktok", name: "TikTok", category: "social", envAnyOf: ["TIKTOK_ACCESS_TOKEN", "TIKTOK_PUBLISH_TOKEN"], capabilities: ["Profil-/Video-Insights", "Publishing je Scope"], setupUrl: "https://developers.tiktok.com/", boundary: "Nur genehmigte Scopes; Publishing nicht aus bloßem Token-Besitz ableiten." },
  { id: "social-youtube", name: "YouTube", category: "social", envAnyOf: ["YT_ACCESS_TOKEN", "YOUTUBE_ACCESS_TOKEN", "YOUTUBE_API_KEY"], capabilities: ["Views", "Watchtime", "Subscribers", "Video-Metadaten"], setupUrl: "https://console.cloud.google.com/apis/credentials", boundary: "Analytics OAuth und Data API Key haben unterschiedliche Berechtigungen." },
  { id: "social-x", name: "X", category: "social", envAnyOf: ["X_ACCESS_TOKEN", "X_BEARER_TOKEN"], capabilities: ["Profil-/Post-Metriken je API-Zugang"], setupUrl: "https://developer.x.com/", boundary: "Zugriff und Limits hängen vom X API Plan ab." },
  { id: "social-linkedin", name: "LinkedIn", category: "social", envAnyOf: ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_PUBLISH_TOKEN"], capabilities: ["Company-Page Insights", "Publishing je Scope"], setupUrl: "https://www.linkedin.com/developers/", boundary: "Organization-Scopes und App-Freigabe sind erforderlich." },
  { id: "email-resend", name: "Resend", category: "email", envAllOf: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"], capabilities: ["Transaktionsmail", "Domain-/DNS-Prüfung"], setupUrl: "https://resend.com/api-keys", boundary: "Versand nur mit verifizierter Domain, Opt-in und Freigabe." },
  { id: "developer-github", name: "GitHub", category: "developer", envAnyOf: ["ADMIN_GITHUB_TOKEN", "GITHUB_TOKEN"], capabilities: ["Repository", "Issues", "Pull Requests", "CI"], setupUrl: "https://github.com/settings/tokens", boundary: "Schreibzugriff nur auf freigegebene Repositories." },
  { id: "media-huggingface", name: "Hugging Face Media", category: "media", envAnyOf: ["HF_TOKEN", "HUGGINGFACE_API_KEY"], capabilities: ["Bild-/Media-Inferenz"], setupUrl: "https://huggingface.co/settings/tokens", boundary: "Modell- und Lizenzbedingungen beachten." },
  { id: "search-perplexity", name: "Perplexity", category: "search", envAllOf: ["PERPLEXITY_API_KEY"], capabilities: ["Web-Recherche", "Quellenbasierte Antworten"], setupUrl: "https://www.perplexity.ai/settings/api", boundary: "Quellen und Aktualität in Antworten ausweisen." },
  { id: "ops-observability", name: "Observability Hub", category: "observability", envAllOf: ["METRICS_TOKEN"], capabilities: ["Prometheus Metrics", "Grafana", "Loki", "Tempo", "Faro"], boundary: "Metriken und Logs authentifizieren; PII und Tokens redigieren." },
];

function present(env: Record<string, string | undefined>, key: string): boolean {
  const value = env[key]?.trim();
  return Boolean(value && value.length > 0 && !/^(replace|changeme|your_|todo|placeholder)/i.test(value));
}

export function getCapabilityCatalog(env: Record<string, string | undefined> = process.env): CapabilityStatus[] {
  return CAPABILITY_CATALOG.map((entry) => {
    const all = [...(entry.envAllOf ?? [])];
    const any = [...(entry.envAnyOf ?? [])];
    const requiredSatisfied = all.every((key) => present(env, key)) && (any.length === 0 || any.some((key) => present(env, key)));
    const configuredEnv = [...new Set([...all, ...any].filter((key) => present(env, key)))];
    const missingEnv = [...all.filter((key) => !present(env, key)), ...(any.length > 0 && !any.some((key) => present(env, key)) ? [any.join(" OR ")] : [])];
    const configuration = entry.builtin ? "available" as const : requiredSatisfied ? "configured" as const : configuredEnv.length > 0 ? "partial" as const : "not_configured" as const;
    return { ...entry, configuration, health: "not_checked" as const, configuredEnv, missingEnv, lastChecked: null };
  });
}

export function summarizeCapabilityCatalog(statuses: readonly CapabilityStatus[]) {
  return {
    total: statuses.length,
    configured: statuses.filter((item) => item.configuration === "configured" || item.configuration === "available").length,
    partial: statuses.filter((item) => item.configuration === "partial").length,
    notConfigured: statuses.filter((item) => item.configuration === "not_configured").length,
    healthVerified: statuses.filter((item) => item.health === "healthy").length,
    healthUnverified: statuses.filter((item) => item.health === "not_checked").length,
  };
}
