/**
 * CyberSarah Control Center — Dynamic Tool & Key Rotator Engine
 *
 * Erweitert die KeyRotatorEngine (Provider-Key-Pools) um:
 * - Zentrale Registry fuer Tool-Schnittstellen (Search, Scraping,
 *   Social-Poster, DB-Connectoren) mit kostenlosen Fallback-Ketten
 *   (z. B. Tavily -> DuckDuckGo-Scraping -> Puppeteer Headless).
 * - Kostenlose Multi-Tier Provider-Kaskade:
 *     Tier 1 (Free Cloud):  Groq, Gemini 2.5, Cerebras, SambaNova, GitHub Models
 *     Tier 2 (Free Router):  OpenRouter (:free), Hugging Face Serverless,
 *                           Cloudflare Workers AI
 *     Tier 3 (Local):        Ollama (http://127.0.0.1:11434) — unbegrenzt,
 *                           keine Cloud-Abhaengigkeit, niemals im Cooldown.
 * - Autonomous Cooldown Management: blockierte Keys/Tools landen fuer
 *   60 Sekunden in einer Cooldown-Queue und werden nach Ablauf automatisch
 *   wieder freigeschaltet (STATUS: HEALTHY).
 * - Dedicated VIP Admin Bypass: reservierte Admin-Keys (ADMIN_<PROVIDER>_KEY)
 *   werden vom Hintergrund-Loop NIEMALS beruehrt.
 *
 * Keys werden komma-separiert aus der .env gelesen:
 *   GROQ_API_KEYS, GEMINI_API_KEYS, OPENROUTER_API_KEYS, GITHUB_TOKENS, ...
 */

import { EventEmitter } from "node:events";
import { AllKeysLimitReachedError } from "./rotatorEngine";

/** Standard-Cooldown nach HTTP 429 / Quota Exceeded (60 Sekunden). */
export const RATE_LIMIT_COOLDOWN_MS = 60_000;

// ---------------------------------------------------------------------------
// Limit-Fehler-Klassifikation
// ---------------------------------------------------------------------------

export type ToolLimitKind =
  | "rate_limit" // HTTP 429 / Too Many Requests
  | "quota_exceeded" // Kontingent aufgebraucht
  | "token_limit" // Context/Token-Limit erreicht
  | "permission_denied" // HTTP 403
  | "service_unavailable"; // HTTP 503

/** Strukturierter Limit-Fehler — Basis fuer das autonome Re-Routing. */
export class ToolLimitError extends Error {
  public readonly kind: ToolLimitKind;
  public readonly httpStatus?: number;
  public readonly provider?: string;
  public readonly tool?: string;

  constructor(
    kind: ToolLimitKind,
    message: string,
    options: { httpStatus?: number; provider?: string; tool?: string } = {}
  ) {
    super(message);
    this.name = "ToolLimitError";
    this.kind = kind;
    this.httpStatus = options.httpStatus;
    this.provider = options.provider;
    this.tool = options.tool;
  }
}

const LIMIT_MESSAGE_PATTERN =
  /\b(rate.?limit|too many requests|quota|insufficient_quota|resource_exhausted|limit exceeded|token limit|context length|exceeded your current quota|429)\b/i;

const RATE_LIMIT_STATUS = new Set([429, 403, 503]);

/**
 * Klassifiziert einen beliebigen Fehler als Tool/API-Limit.
 * Erkennt HTTP 429/403/503, "Quota Exceeded", Rate-Limit- und
 * Token-Limit-Meldungen ueber alle Provider hinweg.
 */
export function classifyToolLimitError(error: unknown): ToolLimitError | null {
  if (error instanceof ToolLimitError) return error;

  let httpStatus: number | undefined;
  let message = "";
  let provider: string | undefined;
  let tool: string | undefined;

  if (error instanceof Error) {
    message = error.message;
    const status = (error as Error & { status?: number; statusCode?: number }).status;
    const statusCode = (error as Error & { status?: number; statusCode?: number }).statusCode;
    httpStatus = typeof status === "number" ? status : typeof statusCode === "number" ? statusCode : undefined;
    provider = (error as Error & { provider?: string }).provider;
    tool = (error as Error & { tool?: string }).tool;
  } else if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    message = String(record.message ?? record.error ?? record.detail ?? "");
    const status = record.status ?? record.statusCode ?? record.code;
    if (typeof status === "number") httpStatus = status;
    if (typeof record.provider === "string") provider = record.provider;
    if (typeof record.tool === "string") tool = record.tool;
  } else if (typeof error === "string" && error.trim()) {
    message = error;
  }

  const isHttpStatusLimit = httpStatus !== undefined && RATE_LIMIT_STATUS.has(httpStatus);
  const isMessageLimit = LIMIT_MESSAGE_PATTERN.test(message);

  if (!isHttpStatusLimit && !isMessageLimit) return null;

  const kind: ToolLimitKind =
    httpStatus === 403
      ? "permission_denied"
      : httpStatus === 503
        ? "service_unavailable"
        : /token limit|context length/i.test(message)
          ? "token_limit"
          : /quota|insufficient_quota|resource_exhausted/i.test(message)
            ? "quota_exceeded"
            : "rate_limit";

  return new ToolLimitError(kind, message || `${kind} (HTTP ${httpStatus ?? "?"})`, {
    httpStatus,
    provider,
    tool,
  });
}

// ---------------------------------------------------------------------------
// Provider-Kaskade (kostenlose Multi-Tier Cascade)
// ---------------------------------------------------------------------------

export type ProviderTier = 1 | 2 | 3;

export interface ProviderEndpoint {
  /** Stabile ID (z. B. "groq") — Key fuer Cooldown-Registry und Events. */
  id: string;
  label: string;
  tier: ProviderTier;
  /** OpenAI-kompatibler Chat-Completions-Endpoint (Tier 3: Ollama). */
  baseUrl: string;
  model: string;
  /** Komma-separierter Agent-Key-Pool aus der .env. */
  keyEnvVar: string;
  /** Fallback-Env-Var (z. B. GITHUB_TOKEN bei GITHUB_TOKENS). */
  keyFallbackEnvVar?: string;
  /** Reservierter Admin-VIP-Key — vom Cooldown-Loop unberuehrt. */
  adminKeyEnvVar: string;
  /** Lokaler Tier-3-Provider: unbegrenzt, niemals im Cooldown. */
  local?: boolean;
}

const ollamaBaseUrl = () => (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");

/**
 * Kostenlose Fallback-Kaskade — Tier 1 (Free Cloud) vor Tier 2 (Free
 * Router & Edge) vor Tier 3 (Lokal, garantiert unbegrenzt).
 */
export const FREE_PROVIDER_CASCADE: ProviderEndpoint[] = [
  // --- Tier 1: Free Cloud APIs ---
  {
    id: "groq",
    label: "Groq (Free Tier)",
    tier: 1,
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    keyEnvVar: "GROQ_API_KEYS",
    keyFallbackEnvVar: "GROQ_API_KEY",
    adminKeyEnvVar: "ADMIN_GROQ_KEY",
  },
  {
    id: "gemini",
    label: "Gemini 2.5 (Free Tier)",
    tier: 1,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    keyEnvVar: "GEMINI_API_KEYS",
    keyFallbackEnvVar: "GEMINI_API_KEY",
    adminKeyEnvVar: "ADMIN_GEMINI_KEY",
  },
  {
    id: "cerebras",
    label: "Cerebras (Free Tier)",
    tier: 1,
    baseUrl: "https://api.cerebras.ai/v1/chat/completions",
    model: process.env.CEREBRAS_MODEL ?? "llama-3.3-70b",
    keyEnvVar: "CEREBRAS_API_KEYS",
    keyFallbackEnvVar: "CEREBRAS_API_KEY",
    adminKeyEnvVar: "ADMIN_CEREBRAS_KEY",
  },
  {
    id: "sambanova",
    label: "SambaNova (Free Tier)",
    tier: 1,
    baseUrl: "https://api.sambanova.ai/v1/chat/completions",
    model: process.env.SAMBANOVA_MODEL ?? "Meta-Llama-3.3-70B-Instruct",
    keyEnvVar: "SAMBANOVA_API_KEYS",
    keyFallbackEnvVar: "SAMBANOVA_API_KEY",
    adminKeyEnvVar: "ADMIN_SAMBANOVA_KEY",
  },
  {
    id: "github",
    label: "GitHub Models (Free Tier)",
    tier: 1,
    baseUrl: "https://models.github.ai/inference/chat/completions",
    model: process.env.GITHUB_MODEL ?? "openai/gpt-4o-mini",
    keyEnvVar: "GITHUB_TOKENS",
    keyFallbackEnvVar: "GITHUB_TOKEN",
    adminKeyEnvVar: "ADMIN_GITHUB_TOKEN",
  },
  // --- Tier 2: Free Router & Edge ---
  {
    id: "openrouter",
    label: "OpenRouter (:free Modelle)",
    tier: 2,
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    model: process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
    keyEnvVar: "OPENROUTER_API_KEYS",
    keyFallbackEnvVar: "OPENROUTER_API_KEY",
    adminKeyEnvVar: "ADMIN_OPENROUTER_KEY",
  },
  {
    id: "huggingface",
    label: "Hugging Face Serverless Inference",
    tier: 2,
    baseUrl: "https://router.huggingface.co/v1/chat/completions",
    model: process.env.HUGGINGFACE_MODEL ?? "meta-llama/Llama-3.1-8B-Instruct",
    keyEnvVar: "HUGGINGFACE_TOKENS",
    keyFallbackEnvVar: "HF_TOKEN",
    adminKeyEnvVar: "ADMIN_HUGGINGFACE_TOKEN",
  },
  {
    id: "cloudflare",
    label: "Cloudflare Workers AI",
    tier: 2,
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions",
    model: process.env.CLOUDFLARE_MODEL ?? "@cf/meta/llama-3.1-8b-instruct",
    keyEnvVar: "CLOUDFLARE_API_TOKENS",
    keyFallbackEnvVar: "CLOUDFLARE_API_TOKEN",
    adminKeyEnvVar: "ADMIN_CLOUDFLARE_API_TOKEN",
  },
  // --- Tier 3: Lokaler Offline-Fallback — garantiert unbegrenzt ---
  {
    id: "ollama",
    label: "Ollama (Lokal, unbegrenzt)",
    tier: 3,
    baseUrl: `${ollamaBaseUrl()}/v1/chat/completions`,
    model: process.env.OLLAMA_MODEL ?? "llama3.1",
    keyEnvVar: "OLLAMA_API_KEYS",
    adminKeyEnvVar: "ADMIN_OLLAMA_KEY",
    local: true,
  },
];

// ---------------------------------------------------------------------------
// Tool-Registry (zentrale Schnittstellen mit kostenlosen Fallback-Ketten)
// ---------------------------------------------------------------------------

export type ToolKind = "search" | "scraping" | "social_poster" | "db_connector";

export interface ToolCandidate {
  /** Stabiler Name (z. B. "tavily"). */
  name: string;
  kind: ToolKind;
  /** True, wenn ohne Key einsatzfaehig (kostenlos & unbegrenzt). */
  requiresKey: boolean;
  keyEnvVar?: string;
  keyFallbackEnvVar?: string;
  free: boolean;
}

/**
 * Standard-Registry: pro Tool-Kind eine geordnete, vollstaendig
 * kostenfreie Fallback-Kette — der vorderste Kandidat ist bevorzugt,
 * der letzte ist immer keyless/unbegrenzt verfuegbar.
 */
export const DEFAULT_TOOL_REGISTRY: ToolCandidate[] = [
  // Search-APIs: Tavily -> DuckDuckGo Scraping -> Puppeteer Headless
  { name: "tavily", kind: "search", requiresKey: true, keyEnvVar: "TAVILY_API_KEYS", keyFallbackEnvVar: "TAVILY_API_KEY", free: true },
  { name: "duckduckgo-scrape", kind: "search", requiresKey: false, free: true },
  { name: "puppeteer-headless", kind: "search", requiresKey: false, free: true },
  // Scraping-Tools: Puppeteer Headless -> HTTP-Static-Fetch
  { name: "puppeteer-headless", kind: "scraping", requiresKey: false, free: true },
  { name: "static-fetch", kind: "scraping", requiresKey: false, free: true },
  // Social-Poster: Mastodon (kostenlos) -> Bluesky (kostenlos)
  { name: "mastodon-poster", kind: "social_poster", requiresKey: true, keyEnvVar: "MASTODON_TOKENS", keyFallbackEnvVar: "MASTODON_TOKEN", free: true },
  { name: "bluesky-poster", kind: "social_poster", requiresKey: false, free: true },
  // DB-Connectoren: Postgres-Pool -> SQLite (lokal, unbegrenzt)
  { name: "postgres-connector", kind: "db_connector", requiresKey: true, keyEnvVar: "DATABASE_URLS", keyFallbackEnvVar: "DATABASE_URL", free: true },
  { name: "sqlite-local", kind: "db_connector", requiresKey: false, free: true },
];

// ---------------------------------------------------------------------------
// Ergebnis-Typen
// ---------------------------------------------------------------------------

/** Gewaehltes Tool inkl. abstrahiertem API-Key (falls erforderlich). */
export interface ToolAssignment {
  tool: ToolCandidate;
  apiKey?: string;
}

/** Gewaehlter Provider inkl. Key und Model fuer den naechsten Versuch. */
export interface ProviderAssignment {
  provider: ProviderEndpoint;
  apiKey?: string;
  model: string;
  baseUrl: string;
  tier: ProviderTier;
}

export interface CooldownSweepResult {
  recoveredTools: string[];
  recoveredProviders: string[];
  recoveredKeys: string[];
}

/** Alle Tools einer Kind-Kette sind im Cooldown. */
export class AllToolsLimitedError extends Error {
  public readonly kind: ToolKind;
  public readonly retryInSeconds: number;

  constructor(kind: ToolKind, retryInSeconds: number) {
    super(
      `ALL_TOOLS_LIMIT_REACHED: Alle ${kind}-Tools sind im Cooldown. ` +
        `Naechstes Tool voraussichtlich in ${retryInSeconds}s wieder verfuegbar.`
    );
    this.name = "AllToolsLimitedError";
    this.kind = kind;
    this.retryInSeconds = retryInSeconds;
  }
}

function readKeyPool(primary: string, fallback?: string): string[] {
  const raw = process.env[primary] ?? (fallback ? process.env[fallback] : undefined) ?? "";
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------


/**
 * Zentrale Rotator-Engine fuer Provider-Keys, Provider-Endpoints und
 * Tool-Schnittstellen mit 60s-Cooldown-Queue und Selbstheilung.
 *
 * Events (EventEmitter):
 *  - "tool:cooldown"    ({ kind, tool, cooldownUntil })
 *  - "tool:recovered"  ({ kind, tool })                — STATUS: HEALTHY
 *  - "provider:cooldown" ({ providerId, cooldownUntil })
 *  - "provider:recovered" ({ providerId })            — STATUS: HEALTHY
 *  - "key:recovered"   ({ providerId, key })          — STATUS: HEALTHY
 */
export class ToolRotatorEngine extends EventEmitter {
  /** `${kind}:${toolName}` -> Cooldown-Ende (Epoch-ms) */
  private readonly toolCooldowns = new Map<string, number>();
  /** providerId -> Cooldown-Ende (Epoch-ms) */
  private readonly providerCooldowns = new Map<string, number>();
  /** `${providerId}:${key}` -> Cooldown-Ende (Epoch-ms) */
  private readonly keyCooldowns = new Map<string, number>();
  /** providerId -> naechster Round-Robin-Index */
  private readonly cursor = new Map<string, number>();
  /** kind -> geordnete Fallback-Kette */
  private readonly registry = new Map<ToolKind, ToolCandidate[]>();
  private autoHealTimer: ReturnType<typeof setInterval> | null = null;

  constructor(customRegistry: ToolCandidate[] = DEFAULT_TOOL_REGISTRY) {
    super();
    for (const candidate of customRegistry) {
      this.registerTool(candidate);
    }
  }

  // ----------------------------- Tool-Registry -----------------------------

  /** Registriert ein Tool in der Fallback-Kette seines Kinds. */
  registerTool(candidate: ToolCandidate): void {
    const chain = this.registry.get(candidate.kind) ?? [];
    const existingIndex = chain.findIndex((entry) => entry.name === candidate.name);
    if (existingIndex >= 0) chain[existingIndex] = candidate;
    else chain.push(candidate);
    this.registry.set(candidate.kind, chain);
  }

  /** Liefert die aktuell registrierte Fallback-Kette eines Kinds. */
  getToolChain(kind: ToolKind): ToolCandidate[] {
    return [...(this.registry.get(kind) ?? [])];
  }

  private isToolConfigured(tool: ToolCandidate): boolean {
    if (!tool.requiresKey) return true;
    return readKeyPool(tool.keyEnvVar ?? "", tool.keyFallbackEnvVar).length > 0;
  }

  /**
   * Waehlt das naechste gesunde, konfigurierte Tool einer Kette.
   * Schlaegt eine Anfrage fehl, meldet der Aufrufer den Limit-Fall via
   * reportToolLimit() und bekommt hier automatisch das naechste
   * gleichwertige, kostenlose Alternativ-Tool.
   */
  selectTool(kind: ToolKind): ToolAssignment {
    const chain = this.registry.get(kind) ?? [];
    const now = Date.now();

    for (const tool of chain) {
      if (!this.isToolConfigured(tool)) continue;
      if (this.isToolCoolingDown(kind, tool.name, now)) continue;
      return { tool, apiKey: tool.requiresKey ? readKeyPool(tool.keyEnvVar ?? "", tool.keyFallbackEnvVar)[0] : undefined };
    }

    const nextAvailableAt = chain
      .map((tool) => this.toolCooldowns.get(`${kind}:${tool.name}`) ?? Number.POSITIVE_INFINITY)
      .reduce((earliest, until) => (until < earliest ? until : earliest), Number.POSITIVE_INFINITY);
    const retryInSeconds = Number.isFinite(nextAvailableAt)
      ? Math.max(1, Math.ceil((nextAvailableAt - now) / 1000))
      : 1;
    throw new AllToolsLimitedError(kind, retryInSeconds);
  }

  /**
   * Meldet ein Tool-Limit (429/403/503, Quota) und setzt das Tool fuer
   * `cooldownMs` Millisekunden (Standard: 60s) auf die Cooldown-Bank.
   */
  reportToolLimit(kind: ToolKind, toolName: string, cooldownMs: number = RATE_LIMIT_COOLDOWN_MS): void {
    if (!toolName) return;
    const cooldownUntil = Date.now() + Math.max(0, cooldownMs);
    this.toolCooldowns.set(`${kind}:${toolName}`, cooldownUntil);
    this.emit("tool:cooldown", { kind, tool: toolName, cooldownUntil });
  }

  isToolCoolingDown(kind: ToolKind, toolName: string, now: number = Date.now()): boolean {
    const until = this.toolCooldowns.get(`${kind}:${toolName}`);
    return until !== undefined && until > now;
  }

  // --------------------------- Provider-Cascade ----------------------------

  private resolveProviderKeys(provider: ProviderEndpoint): string[] {
    return readKeyPool(provider.keyEnvVar, provider.keyFallbackEnvVar);
  }

  private providerBaseUrl(provider: ProviderEndpoint): string {
    if (provider.tier === 2 && provider.id === "cloudflare") {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
      if (!accountId) return provider.baseUrl;
      return provider.baseUrl.replace("${CLOUDFLARE_ACCOUNT_ID}", accountId);
    }
    return provider.baseUrl;
  }

  /**
   * Waehlt den naechsten gesunden Provider aus der kostenlosen Kaskade
   * (Tier 1 -> Tier 2 -> Tier 3). Der lokale Tier-3-Fallback (Ollama)
   * ist niemals im Cooldown und garantiert unbegrenzte Ausfuehrung.
   *
   * `isAdmin: true` nutzt die reservierte VIP-Lane (ADMIN_<PROVIDER>_KEY)
   * und wird vom Cooldown-Loop NIEMALS beruehrt.
   */
  selectProvider(options: { isAdmin?: boolean; excludeIds?: string[] } = {}): ProviderAssignment {
    const { isAdmin = false, excludeIds = [] } = options;
    const now = Date.now();
    const cascade = [...FREE_PROVIDER_CASCADE].sort((a, b) => a.tier - b.tier);

    for (const provider of cascade) {
      if (excludeIds.includes(provider.id)) continue;
      if (provider.local) {
        // Tier 3: garantiert unbegrenzt — immer verfuegbar, nie im Cooldown.
        return {
          provider,
          apiKey: this.resolveProviderKeys(provider)[0],
          model: provider.model,
          baseUrl: this.providerBaseUrl(provider),
          tier: provider.tier,
        };
      }
      // Dedicated VIP Admin Bypass: die reservierte Admin-Lane wird von
      // Provider- und Key-Cooldowns NIEMALS beruehrt (0% Limits).
      if (isAdmin) {
        const adminKey = (process.env[provider.adminKeyEnvVar] ?? "").trim();
        if (!adminKey) continue; // Keine VIP-Lane konfiguriert -> naechster Provider
        return {
          provider,
          apiKey: adminKey,
          model: provider.model,
          baseUrl: this.providerBaseUrl(provider),
          tier: provider.tier,
        };
      }

      if (this.isProviderCoolingDown(provider.id, now)) continue;

      const keys = this.resolveProviderKeys(provider);
      if (keys.length === 0) continue;

      // Round-Robin mit Ueberspringen kuehlender Keys (pro Provider).
      const start = this.cursor.get(provider.id) ?? 0;
      let earliestCooldown = Number.POSITIVE_INFINITY;
      for (let offset = 0; offset < keys.length; offset += 1) {
        const index = (start + offset) % keys.length;
        const key = keys[index];
        const until = this.keyCooldowns.get(`${provider.id}:${key}`);
        if (until !== undefined && until > now) {
          if (until < earliestCooldown) earliestCooldown = until;
          continue;
        }
        this.cursor.set(provider.id, (index + 1) % keys.length);
        return {
          provider,
          apiKey: key,
          model: provider.model,
          baseUrl: this.providerBaseUrl(provider),
          tier: provider.tier,
        };
      }
    }

    // Alle Cloud-Tiers erschöpft — strukturierte Ausnahme mit Retry-Hinweis.
    const nextAvailableAt = this.nextProviderRecoveryAt(now);
    const retryInSeconds = Number.isFinite(nextAvailableAt)
      ? Math.max(1, Math.ceil((nextAvailableAt - now) / 1000))
      : 1;
    throw new AllKeysLimitReachedError("cascade", retryInSeconds);
  }

  private nextProviderRecoveryAt(now: number): number {
    let earliest = Number.POSITIVE_INFINITY;
    for (const until of this.providerCooldowns.values()) {
      if (until > now && until < earliest) earliest = until;
    }
    for (const until of this.keyCooldowns.values()) {
      if (until > now && until < earliest) earliest = until;
    }
    return earliest;
  }

  /**
   * Meldet ein Provider-Limit (z. B. HTTP 429): setzt den Provider bzw.
   * den konkreten Key fuer 60s in die Cooldown-Queue. Der Resolver-Agent
   * rotiert in Millisekunden auf den naechsten gesunden Kandidaten.
   */
  reportProviderLimit(providerId: string, options: { key?: string; cooldownMs?: number } = {}): void {
    const cooldownMs = options.cooldownMs ?? RATE_LIMIT_COOLDOWN_MS;
    const cooldownUntil = Date.now() + Math.max(0, cooldownMs);
    if (options.key) {
      this.keyCooldowns.set(`${providerId}:${options.key}`, cooldownUntil);
    } else {
      this.providerCooldowns.set(providerId, cooldownUntil);
      this.emit("provider:cooldown", { providerId, cooldownUntil });
    }
  }

  isProviderCoolingDown(providerId: string, now: number = Date.now()): boolean {
    const until = this.providerCooldowns.get(providerId);
    return until !== undefined && until > now;
  }

  /** Sekunden bis zur naechsten moeglichen Erholung (Retry-After-Hinweis). */
  retryInSeconds(): number {
    const next = this.nextProviderRecoveryAt(Date.now());
    return Number.isFinite(next) ? Math.max(1, Math.ceil((next - Date.now()) / 1000)) : 1;
  }

  // ------------------------ Cooldown-Queue & Selbstheilung -----------------

  /**
   * Selbstheilungs-Sweep: gibt alle abgelaufenen Cooldowns frei und
   * meldet die Wiederherstellung (STATUS: HEALTHY) als Events.
   */
  sweepCooldowns(now: number = Date.now()): CooldownSweepResult {
    const recoveredTools: string[] = [];
    const recoveredProviders: string[] = [];
    const recoveredKeys: string[] = [];

    for (const [mapKey, until] of [...this.toolCooldowns.entries()]) {
      if (until <= now) {
        const [kind, tool] = mapKey.split(":");
        this.toolCooldowns.delete(mapKey);
        recoveredTools.push(tool);
        this.emit("tool:recovered", { kind, tool });
      }
    }
    for (const [providerId, until] of [...this.providerCooldowns.entries()]) {
      if (until <= now) {
        this.providerCooldowns.delete(providerId);
        recoveredProviders.push(providerId);
        this.emit("provider:recovered", { providerId });
      }
    }
    for (const [mapKey, until] of [...this.keyCooldowns.entries()]) {
      if (until <= now) {
        const separatorIndex = mapKey.indexOf(":");
        const providerId = mapKey.slice(0, separatorIndex);
        const key = mapKey.slice(separatorIndex + 1);
        this.keyCooldowns.delete(mapKey);
        recoveredKeys.push(`${providerId}:${key}`);
        this.emit("key:recovered", { providerId, key });
      }
    }

    return { recoveredTools, recoveredProviders, recoveredKeys };
  }

  /** Startet den Hintergrund-Loop, der Cooldowns automatisch freigibt. */
  startAutoHeal(intervalMs: number = 5_000): void {
    if (this.autoHealTimer) return;
    this.autoHealTimer = setInterval(() => {
      const result = this.sweepCooldowns();
      if (result.recoveredKeys.length > 0) {
        console.log(
          `[tool-rotator] STATUS: HEALTHY — ${result.recoveredKeys.length} Key(s) automatisch wieder freigeschaltet.`
        );
      }
    }, Math.max(1_000, intervalMs));
    this.autoHealTimer.unref?.();
  }

  /** Stoppt den Hintergrund-Loop (z. B. fuer Tests/Shutdown). */
  stopAutoHeal(): void {
    if (this.autoHealTimer) {
      clearInterval(this.autoHealTimer);
      this.autoHealTimer = null;
    }
  }

  /** Diagnose-Snapshot (ohne Klartext-Keys). */
  getSnapshot(now: number = Date.now()) {
    const tools = [...this.toolCooldowns.entries()].map(([mapKey, until]) => {
      const separatorIndex = mapKey.indexOf(":");
      return {
        kind: mapKey.slice(0, separatorIndex),
        tool: mapKey.slice(separatorIndex + 1),
        state: until > now ? "COOLDOWN" : "HEALTHY",
        cooldownUntil: until,
      };
    });
    const providers = [...this.providerCooldowns.entries()].map(([providerId, until]) => ({
      providerId,
      state: until > now ? "COOLDOWN" : "HEALTHY",
      cooldownUntil: until,
    }));
    const keys = [...this.keyCooldowns.entries()].map(([mapKey, until]) => ({
      providerId: mapKey.slice(0, mapKey.indexOf(":")),
      keyFingerprint: `${mapKey.slice(mapKey.indexOf(":") + 1).slice(0, 8)}***`,
      state: until > now ? "COOLDOWN" : "HEALTHY",
      cooldownUntil: until,
    }));
    return { tools, providers, keys };
  }
}
