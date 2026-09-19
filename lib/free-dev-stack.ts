/**
 * CyberSarah Control Center — Zero-Cost Dev-Stack-Registry (Sprint 164)
 *
 * Zentrales Verzeichnis ALLER fuer die autonome App-/Spiel-Entwicklung
 * genutzten Ressourcen mit der harten Garantie: jede Einheit ist
 * dauerhaft kostenfrei (free: true) oder lokal (local: true).
 *
 * Bereiche:
 * - LLM-Kaskade: Groq > OpenRouter (:free) > Gemini > (Admin-Override:
 *   Forge/OpenAI) — identische Prioritaet wie die Managed-Chat-Runtime.
 * - Lokale Offline-LLMs: Ollama (11434) / LM Studio (1234) — unbegrenzt.
 * - Entwicklungswerkzeuge: tsc (Typcheck), vitest (Tests), node --check
 *   (Syntax), lokale Dateiablage (Workspace) — alle kostenlos.
 * - Anbindungs-Alternativen (kostenlos): GitHub-API (Free Tier, Tokens
 *   via $GITHUB_TOKEN), Neon-Postgres (Free Tier, DATABASE_URL), lokale
 *   KV-Store-Fallbacks, DuckDuckGo-Scraping statt bezahlter Search-APIs,
 *   Discord-Webhook fuer Ops-Alerts (Free), Inline-SVG/CDN-Assets statt
 *   bezahlter Asset-Stores.
 *
 * Die Registry liefert mit resolveFreeStack() die AKTIV konfigurierte
 * Auswahl — inkl. Nachweis isZeroCost(), dass kein Element Kosten
 * verursachen kann. Bezahlte Elemente erscheinen NUR mit dem expliziten
 * Admin-Override (AI_ALLOW_PAID_LLM_FALLBACK=true) und werden von der
 * autonomen Entwicklung standardmaessig nie beruehrt.
 */

import {
  isFreeManagedSource,
  resolveManagedLlmEndpoint,
  type ManagedLlmEndpoint,
  type ManagedLlmEnv,
} from "./managed-llm-fallback-logic";

export interface FreeStackEntry {
  /** Stabile ID (z. B. "groq", "tsc", "github-api"). */
  id: string;
  label: string;
  category: "llm" | "dev_tool" | "connector" | "asset";
  /** Dauerhaft kostenfrei (Free Tier / OSS / lokal). */
  free: boolean;
  /** Lokal ausgefuehrt — keinerlei Cloud-Abhaengigkeit. */
  local: boolean;
  /** Nur mit explizitem Admin-Override aktiv (Standard: nie genutzt). */
  adminOverrideOnly?: boolean;
}

/** Entwicklungswerkzeuge — alle Open Source / lokal, 0 EUR. */
export const FREE_DEV_TOOLS: FreeStackEntry[] = [
  { id: "tsc", label: "TypeScript-Compiler (Typcheck)", category: "dev_tool", free: true, local: true },
  { id: "vitest", label: "Vitest (Testrunner)", category: "dev_tool", free: true, local: true },
  { id: "node-check", label: "node --check (JS-Syntaxpruefung)", category: "dev_tool", free: true, local: true },
  { id: "workspace-fs", label: "Lokaler Workspace (Dateiablage)", category: "dev_tool", free: true, local: true },
  { id: "git", label: "Git + GitHub-API (Free Tier)", category: "dev_tool", free: true, local: false },
];

/** Anbindungen — pro Zweck die kostenlose Alternative (nie bezahlt). */
export const FREE_CONNECTORS: FreeStackEntry[] = [
  { id: "github-api", label: "GitHub REST/GraphQL (Free Tier)", category: "connector", free: true, local: false },
  { id: "neon-postgres", label: "Neon Postgres (Free Tier, DATABASE_URL)", category: "connector", free: true, local: false },
  { id: "kv-store", label: "Lokaler KV-Store (In-Prozess-Fallback)", category: "connector", free: true, local: true },
  { id: "duckduckgo", label: "DuckDuckGo-Scraping (Search, keyless)", category: "connector", free: true, local: false },
  { id: "discord-webhook", label: "Discord-Webhook Ops-Alerts (Free)", category: "connector", free: true, local: false },
  { id: "local-storage", label: "Lokale Dateiablage statt Cloud-Storage", category: "connector", free: true, local: true },
];

/** Assets — keine bezahlten Stock-/Icon-/Font-Stores noetig. */
export const FREE_ASSETS: FreeStackEntry[] = [
  { id: "inline-svg", label: "Inline-SVG-Grafiken (selbst generiert)", category: "asset", free: true, local: true },
  { id: "cdn-icons", label: "SimpleIcons/CDN (Open-Source-Icons)", category: "asset", free: true, local: false },
  { id: "system-fonts", label: "System-Font-Stack (keine Webfonts noetig)", category: "asset", free: true, local: true },
  { id: "canvas-rendering", label: "HTML5-Canvas (Spielegrafik ohne Assets)", category: "asset", free: true, local: true },
];

/** Lokale Offline-LLMs — garantiert unbegrenzt, keine Cloud. */
export const LOCAL_LLMS: FreeStackEntry[] = [
  {
    id: "ollama",
    label: `Ollama (lokal, ${process.env.AI_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"})`,
    category: "llm",
    free: true,
    local: true,
  },
  {
    id: "lmstudio",
    label: `LM Studio (lokal, ${process.env.AI_LMSTUDIO_BASE_URL ?? "http://127.0.0.1:1234/v1"})`,
    category: "llm",
    free: true,
    local: true,
  },
];

export interface FreeStackSnapshot {
  /** Aktiver LLM der Gratis-Kaskade (oder null, wenn keiner konfiguriert). */
  activeLlm: { id: string; label: string; source: string; free: boolean } | null;
  /** Lokale LLM-Endpunkte (immer verfuegbar, offline unabhaengig). */
  localLlms: FreeStackEntry[];
  devTools: FreeStackEntry[];
  connectors: FreeStackEntry[];
  assets: FreeStackEntry[];
  /** True, wenn kein aktives Element Kosten verursachen kann. */
  zeroCost: boolean;
  /** Begruendung im Fehlerfall (Admin-Diagnose). */
  zeroCostDetail: string;
}

function readEnv(env: ManagedLlmEnv, key: keyof ManagedLlmEnv): string | undefined {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Liefert den aktuell konfigurierten, vollstaendig kostenlosen
 * Entwicklungs-Stack. Der Nachweis isZeroCost() prueft die AKTIVEN
 * Elemente — ist kein Cloud-LLM-Key konfiguriert, greifen die lokalen
 * Offline-LLMs (Ollama/LM Studio) und die Stack-Garantie bleibt wahr.
 */
export function resolveFreeStack(env: Partial<ManagedLlmEnv> = process.env as unknown as Partial<ManagedLlmEnv>): FreeStackSnapshot {
  const managedEnv: ManagedLlmEnv = {
    forgeApiUrl: readEnv(env, "forgeApiUrl"),
    forgeApiKey: readEnv(env, "forgeApiKey"),
    geminiApiKey: readEnv(env, "geminiApiKey"),
    openaiBaseUrl: readEnv(env, "openaiBaseUrl"),
    openaiApiKey: readEnv(env, "openaiApiKey"),
    groqApiKey: readEnv(env, "groqApiKey"),
    groqBaseUrl: readEnv(env, "groqBaseUrl"),
    openrouterApiKey: readEnv(env, "openrouterApiKey"),
    openrouterBaseUrl: readEnv(env, "openrouterBaseUrl"),
    openrouterReferer: readEnv(env, "openrouterReferer"),
    allowPaidFallback: env.allowPaidFallback,
  };

  let activeLlm: FreeStackSnapshot["activeLlm"] = null;
  let endpoint: ManagedLlmEndpoint | null = null;
  try {
    endpoint = resolveManagedLlmEndpoint(managedEnv);
  } catch {
    endpoint = null;
  }

  let zeroCost = true;
  let zeroCostDetail = "Alle aktiven Ressourcen sind kostenfrei oder lokal.";

  if (endpoint) {
    const free = isFreeManagedSource(endpoint.source);
    activeLlm = {
      id: endpoint.source,
      label: `Managed-LLM ${endpoint.source}`,
      source: endpoint.source,
      free,
    };
    if (!free) {
      zeroCost = false;
      zeroCostDetail =
        `Aktiver LLM '${endpoint.source}' ist kostenpflichtig. Die autonome Entwicklung ` +
        `nutzt ihn nicht — Setze GROQ_API_KEY/OPENROUTER_API_KEY/GEMINI_API_KEY fuer 0 EUR.`;
      activeLlm = null; // Autonome Entwicklung greift NIE auf den bezahlten Endpoint zu.
    }
  } else {
    activeLlm = null;
    zeroCostDetail = env.groqApiKey || env.openrouterApiKey || env.geminiApiKey
      ? "Kein kostenfreier LLM-Key aktiv — lokale Ollama/LM-Studio-Endpunkte bleiben verfuegbar."
      : "Kein Cloud-LLM konfiguriert — lokale Offline-LLMs (Ollama/LM Studio) sind die aktive Kaskade.";
  }

  return {
    activeLlm,
    localLlms: LOCAL_LLMS,
    devTools: FREE_DEV_TOOLS,
    connectors: FREE_CONNECTORS,
    assets: FREE_ASSETS,
    zeroCost,
    zeroCostDetail,
  };
}
