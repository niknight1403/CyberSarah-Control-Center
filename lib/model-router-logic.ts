/**
 * Sprint 71 — Autonomer Modell-Router — reine Logik.
 *
 * Der Router ueberwacht alle verfuegbaren KI-Endpoints, klassifiziert
 * eingehende Entwicklungsauftraege (Aufgabentyp + Komplexitaet) und waehlt
 * daraus die bestmoegliche Provider-Reihenfolge. Fehler, Timeouts und
 * Rate-Limits fuehren zu autonomen Cooldowns — der Chat-Prozess wird
 * unterbrechungsfrei auf die naechste Alternative umgeleitet.
 */

import type { ProviderId } from "./studio-settings-logic";

/** Provider, die der Router autonom verwalten darf. */
export const ROUTER_PROVIDER_IDS = [
  "managed",
  "openai",
  "gemini",
  "anthropic",
  "openrouter",
  "groq",
  "together",
  "huggingface",
  "ollama",
  "lmstudio",
  "custom",
] as const satisfies readonly ProviderId[];

export type RouterProviderId = (typeof ROUTER_PROVIDER_IDS)[number];

export type TaskType = "code" | "reasoning" | "ui" | "chat";
export type Complexity = "light" | "medium" | "heavy";

/** Faehigkeitsprofil je Provider (0..10) — bewusst konservativ geschaetzt. */
export const PROVIDER_CAPABILITIES: Record<RouterProviderId, {
  code: number;
  reasoning: number;
  ui: number;
  chat: number;
  local: boolean;
}> = {
  managed: { code: 7, reasoning: 7, ui: 7, chat: 8, local: false },
  openai: { code: 9, reasoning: 9, ui: 8, chat: 9, local: false },
  anthropic: { code: 10, reasoning: 10, ui: 8, chat: 9, local: false },
  gemini: { code: 8, reasoning: 8, ui: 8, chat: 8, local: false },
  openrouter: { code: 7, reasoning: 7, ui: 7, chat: 7, local: false },
  groq: { code: 7, reasoning: 6, ui: 6, chat: 8, local: false },
  together: { code: 7, reasoning: 7, ui: 6, chat: 7, local: false },
  huggingface: { code: 5, reasoning: 5, ui: 5, chat: 6, local: false },
  ollama: { code: 6, reasoning: 6, ui: 5, chat: 6, local: true },
  lmstudio: { code: 6, reasoning: 6, ui: 5, chat: 6, local: true },
  custom: { code: 6, reasoning: 6, ui: 6, chat: 6, local: false },
};

/** Cooldown-Strategie: Basis 30 s, Verdopplung je Folgefehler, Deckel 300 s. */
export const COOLDOWN_BASE_MS = 30_000;
export const COOLDOWN_MAX_MS = 300_000;
/** Rate-Limit (429) sofort mit 60 s Cooldown belegen. */
export const RATE_LIMIT_COOLDOWN_MS = 60_000;

export type ProviderHealth = {
  status: "unknown" | "ready" | "degraded" | "cooldown" | "unconfigured";
  consecutiveFailures: number;
  lastLatencyMs: number | null;
  lastCheckedAt: number | null;
  cooldownUntil: number | null;
};

export type ProviderHealthMap = Partial<Record<RouterProviderId, ProviderHealth>>;

export function emptyProviderHealth(): ProviderHealth {
  return {
    status: "unknown",
    consecutiveFailures: 0,
    lastLatencyMs: null,
    lastCheckedAt: null,
    cooldownUntil: null,
  };
}

// ---------------------------------------------------------------------------
// Prompt-Klassifikation
// ---------------------------------------------------------------------------

export type PromptClassification = {
  taskType: TaskType;
  complexity: Complexity;
  estimatedTokens: number;
  reasons: string[];
};

const CODE_MARKERS = ["```", "function ", "const ", "class ", "import ", "npm ", "tsc", "vitest", "git ", ".ts", ".tsx"];
const REASONING_MARKERS = ["audit", "architektur", "analys", "warum", "refactor", "bewert", "entscheid", "migrationsplan", "risiko", "sprint"];
const UI_MARKERS = ["ui", "design", "layout", "farbe", "typografie", "bildschirm", "screen", "css", "tailwind"];

/** Grobe Token-Schaetzung (4 Zeichen ~ 1 Token, inkl. Fussweg fuer Deutsch). */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

/**
 * Klassifiziert den letzten Nutzer-Prompt nach Aufgabentyp und Komplexitaet.
 * Deterministische Heuristik: Marker-Treffer + Laenge + Token-Bedarf.
 */
export function classifyPrompt(userMessage: string): PromptClassification {
  const text = userMessage ?? "";
  const lower = text.toLowerCase();
  const reasons: string[] = [];

  const codeHits = CODE_MARKERS.filter((marker) => lower.includes(marker)).length;
  const reasoningHits = REASONING_MARKERS.filter((marker) => lower.includes(marker)).length;
  const uiHits = UI_MARKERS.filter((marker) => lower.includes(marker)).length;

  let taskType: TaskType = "chat";
  if (codeHits >= reasoningHits && codeHits >= uiHits && codeHits > 0) {
    taskType = "code";
    reasons.push(`${codeHits} Code-Marker`);
  } else if (reasoningHits > 0 && reasoningHits >= uiHits) {
    taskType = "reasoning";
    reasons.push(`${reasoningHits} Analyse-/Audit-Marker`);
  } else if (uiHits > 0) {
    taskType = "ui";
    reasons.push(`${uiHits} UI-/Design-Marker`);
  }

  const estimatedTokens = estimateTokens(text);
  let complexity: Complexity = "light";
  if (estimatedTokens >= 1200 || /\b(audit|migration|architektur|refactor|sprint)\b/i.test(lower)) {
    complexity = "heavy";
    reasons.push(`Token-Bedarf ~${estimatedTokens}`);
  } else if (estimatedTokens >= 400 || taskType !== "chat") {
    complexity = "medium";
    if (reasons.length === 0) reasons.push(`Token-Bedarf ~${estimatedTokens}`);
  }

  if (reasons.length === 0) reasons.push("kurzer einfacher Prompt");
  return { taskType, complexity, estimatedTokens, reasons };
}

// ---------------------------------------------------------------------------
// Kandidaten-Reihenfolge
// ---------------------------------------------------------------------------

export type RouteScore = {
  provider: RouterProviderId;
  score: number;
  available: boolean;
  blockedReason: "none" | "cooldown" | "unconfigured";
};

/** Mindest-Faehigkeit je Komplexitaet — schwache Provider fallen bei heavy zurueck. */
const COMPLEXITY_MIN_STRENGTH: Record<Complexity, number> = {
  light: 0,
  medium: 5,
  heavy: 7,
};

export type BuildOrderInput = {
  taskType: TaskType;
  complexity: Complexity;
  /** Bevorzugte Reihenfolge (persistent gespeicherte Admin-Konfiguration). */
  preferredOrder?: readonly string[];
  health: ProviderHealthMap;
  /** Provider, deren API-Keys/Endpoints konfiguriert sind. */
  configuredProviders: readonly RouterProviderId[];
  now: number;
};

/** Prueft Verfuegbarkeit anhand Cooldown-Fenster. */
export function providerBlockedReason(
  health: ProviderHealthMap,
  provider: RouterProviderId,
  now: number,
): "none" | "cooldown" | "unconfigured" {
  const state = health[provider];
  if (state?.cooldownUntil && state.cooldownUntil > now) return "cooldown";
  return "none";
}

/**
 * Baut die bewertete, absteigend sortierte Provider-Reihenfolge.
 * Deterministisch: Score = Faehigkeitswert (Task) + Komplexitaets-Bonus
 * - Abzug bei nicht verfuegbaren Providern; blockierte bleiben sichtbar.
 */
export function buildProviderOrder(input: BuildOrderInput): RouteScore[] {
  const preferred = new Map<string, number>();
  (input.preferredOrder ?? []).forEach((provider, index) => {
    preferred.set(provider, index);
  });
  const configured = new Set(input.configuredProviders);

  const scores: RouteScore[] = ROUTER_PROVIDER_IDS.map((provider) => {
    const capabilities = PROVIDER_CAPABILITIES[provider];
    let score = capabilities[input.taskType];
    if (capabilities[input.taskType] < COMPLEXITY_MIN_STRENGTH[input.complexity]) {
      score -= 3;
    }
    if (input.complexity === "heavy" && capabilities.local) {
      score -= 1; // schwere Auftraege bevorzugt in die Cloud
    }
    const preferredRank = preferred.get(provider);
    if (preferredRank != null) score += Math.max(0, 4 - preferredRank); // bevorzugte ReihenfoLge
    const blockedReason = !configured.has(provider)
      ? "unconfigured"
      : providerBlockedReason(input.health, provider, input.now);
    if (blockedReason !== "none") score -= 20;
    return {
      provider,
      score,
      available: blockedReason === "none",
      blockedReason,
    };
  });

  return scores.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Failover-Zustandsmaschine
// ---------------------------------------------------------------------------

export type ProviderOutcome =
  | { kind: "success"; latencyMs: number }
  | { kind: "failure"; retryable: boolean; rateLimited: boolean }
  | { kind: "timeout" };

export function recordProviderOutcome(
  health: ProviderHealthMap,
  provider: RouterProviderId,
  outcome: ProviderOutcome,
  now: number,
): ProviderHealthMap {
  const current = health[provider] ?? emptyProviderHealth();
  if (outcome.kind === "success") {
    return {
      ...health,
      [provider]: {
        status: "ready",
        consecutiveFailures: 0,
        lastLatencyMs: outcome.latencyMs,
        lastCheckedAt: now,
        cooldownUntil: null,
      },
    };
  }
  const consecutiveFailures = current.consecutiveFailures + 1;
  const cooldownMs = outcome.kind === "failure" && outcome.rateLimited
    ? RATE_LIMIT_COOLDOWN_MS
    : Math.min(COOLDOWN_BASE_MS * 2 ** (consecutiveFailures - 1), COOLDOWN_MAX_MS);
  return {
    ...health,
    [provider]: {
      status: "cooldown",
      consecutiveFailures,
      lastLatencyMs: current.lastLatencyMs,
      lastCheckedAt: now,
      cooldownUntil: now + cooldownMs,
    },
  };
}

/** Administratoren: Auto-Routing ist immer aktiv (unterbrechungsfreie Kapazitaet). */
export function shouldAutoRoute(role: string | null | undefined): boolean {
  return role === "admin";
}

/** Snapshot fuer tRPC/Audit (stabile, sortierte Ausgabe). */
export function healthSnapshot(
  health: ProviderHealthMap,
  configured: readonly RouterProviderId[],
  now: number,
): Array<ProviderHealth & { provider: RouterProviderId }> {
  return ROUTER_PROVIDER_IDS.map((provider) => {
    const state = health[provider] ?? emptyProviderHealth();
    const blockedReason = providerBlockedReason(health, provider, now);
    const status: ProviderHealth["status"] =
      !configured.includes(provider)
        ? "unconfigured"
        : blockedReason === "cooldown"
          ? "cooldown"
          : state.status;
    return { provider, ...state, status };
  });
}

// ---------------------------------------------------------------------------
// Konfigurationserkennung (pure — ENV als Input, deterministisch testbar)
// ---------------------------------------------------------------------------

const CLOUD_PROVIDER_KEYS: Partial<Record<RouterProviderId, readonly string[]>> = {
  openai: ["AI_OPENAI_API_KEY", "OPENAI_API_KEY"],
  gemini: ["AI_GEMINI_API_KEY", "GEMINI_API_KEY"],
  openrouter: ["AI_OPENROUTER_API_KEY", "OPENROUTER_API_KEY"],
  groq: ["AI_GROQ_API_KEY", "GROQ_API_KEY"],
  together: ["AI_TOGETHER_API_KEY", "TOGETHER_API_KEY"],
  anthropic: ["AI_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"],
  huggingface: ["AI_HUGGINGFACE_API_KEY", "HF_TOKEN"],
};

/**
 * Ermittelt die konfigurierten Provider aus der Umgebung. Lokale Provider
 * (ollama/lmstudio) und der Managed-Endpoint gelten als grundsaetzlich
 * verfuegbar (Defaults existieren); Cloud-Provider benoetigen API-Keys.
 */
export function detectConfiguredProviders(env: Record<string, string | undefined>): RouterProviderId[] {
  const configured: RouterProviderId[] = ["managed", "ollama", "lmstudio"];
  for (const provider of ROUTER_PROVIDER_IDS) {
    const keys = CLOUD_PROVIDER_KEYS[provider];
    if (keys && keys.some((key) => (env[key] ?? "").trim())) configured.push(provider);
  }
  if ((env.AI_CUSTOM_BASE_URL ?? env.CUSTOM_OPENAI_BASE_URL ?? "").trim()) configured.push("custom");
  return configured;
}
