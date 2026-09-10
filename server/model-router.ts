/**
 * Sprint 71 — Server-seitige Modell-Router-Laufzeit.
 *
 * Zustaendigkeiten: In-Memory-Health-Registry (mit Cooldowns), persistente
 * Admin-Konfiguration (bevorzugte Reihenfolge + Status-Snapshot in der
 * modelRouterSettings-Tabelle) und leichte Health-Probes fuer lokale
 * Endpoints. Das eigentliche Routing (Prompt-Klassifikation, Kandidaten-
 * Reihenfolge, Failover-Schleife) laeuft in development-chat.ts — dort liegt
 * callProvider; dieses Modul bleibt frei von LLM-Aufrufen (keine Zyklen).
 */

import {
  detectConfiguredProviders,
  emptyProviderHealth,
  healthSnapshot,
  recordProviderOutcome,
  type ProviderHealthMap,
  type ProviderOutcome,
  type RouterProviderId,
} from "../lib/model-router-logic";
import * as db from "./db";

/** Health-Registry (Prozess-lebendig; Snapshot wird persisted). */
let routerHealth: ProviderHealthMap = {};

const PREFERRED_ORDER_KEY = "preferredProviderOrder";
const HEALTH_SNAPSHOT_KEY = "healthSnapshot";

/** Beim Boot zuletzt persistierte Cooldowns/Statuswerte wiederherstellen. */
export async function restoreRouterState(): Promise<void> {
  try {
    const persisted = await db.getModelRouterSetting<ProviderHealthMap>(HEALTH_SNAPSHOT_KEY);
    if (persisted && typeof persisted === "object") {
      for (const [provider, state] of Object.entries(persisted)) {
        if (state && typeof state === "object") {
          routerHealth[provider as RouterProviderId] = {
            ...emptyProviderHealth(),
            ...(state as unknown as Record<string, never>),
          };
        }
      }
    }
  } catch (error) {
    console.warn("[model-router] Persistierter Zustand nicht ladbar:", error instanceof Error ? error.message : error);
  }
}

/** Best-Effort-Persistenz der Statuswerte (darf Routing niemals blockieren). */
async function persistRouterState(): Promise<void> {
  try {
    await db.setModelRouterSetting(HEALTH_SNAPSHOT_KEY, routerHealth);
  } catch {
    // Persistenzfehler sind nicht fatal — Registry laeuft im Speicher weiter.
  }
}

export function getRouterHealth(): ProviderHealthMap {
  return routerHealth;
}

export function recordRouterOutcome(provider: RouterProviderId, outcome: ProviderOutcome, now = Date.now()): void {
  routerHealth = recordProviderOutcome(routerHealth, provider, outcome, now);
  void persistRouterState();
}

export function getRouterConfiguredProviders(): RouterProviderId[] {
  return detectConfiguredProviders(process.env as Record<string, string | undefined>);
}

/** Bevorzugte Admin-Reihenfolge (persistent). */
export async function getPreferredProviderOrder(): Promise<string[]> {
  try {
    const value = await db.getModelRouterSetting<string[]>(PREFERRED_ORDER_KEY);
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry.trim()) : [];
  } catch {
    return [];
  }
}

export async function setPreferredProviderOrder(order: readonly string[]): Promise<string[]> {
  const cleaned = [...new Set(order.map((entry) => entry.trim()).filter(Boolean))];
  await db.setModelRouterSetting(PREFERRED_ORDER_KEY, cleaned);
  return cleaned;
}

/** Aggregierter Snapshot fuer die Admin-UI (tRPC routerStatus). */
export async function getRouterSnapshot() {
  const now = Date.now();
  const configured = getRouterConfiguredProviders();
  return {
    now: new Date(now).toISOString(),
    configured,
    preferredOrder: await getPreferredProviderOrder(),
    health: healthSnapshot(routerHealth, configured, now),
  };
}

/**
 * Leichter Probe fuer lokale Endpoints (ollama/lmstudio): GET {base}/models
 * mit 2 s Timeout. Erfolg/Fehler fliessen in die Registry — cloud Provider
 * werden bewusst nicht aktiv angepingt (Kosten, Rate-Limits); ihr Zustand
 * ergibt sich aus den realen Chat-Aufrufen (Erfolg/Fehler/Timeout).
 */
export async function probeLocalProviders(): Promise<Array<{ provider: RouterProviderId; reachable: boolean }>> {
  const targets: Array<{ provider: RouterProviderId; baseUrl: string }> = [
    {
      provider: "ollama",
      baseUrl: (process.env.AI_OLLAMA_BASE_URL ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(/\/+$/, ""),
    },
    {
      provider: "lmstudio",
      baseUrl: (process.env.AI_LMSTUDIO_BASE_URL ?? process.env.LMSTUDIO_BASE_URL ?? "http://127.0.0.1:1234/v1").replace(/\/+$/, ""),
    },
  ];
  const results = await Promise.all(
    targets.map(async (target) => {
      const startedAt = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2_000);
        const response = await fetch(`${target.baseUrl}/models`, { signal: controller.signal });
        clearTimeout(timer);
        const reachable = response.ok;
        recordRouterOutcome(target.provider, { kind: "success", latencyMs: Date.now() - startedAt }, Date.now());
        return { provider: target.provider, reachable };
      } catch {
        recordRouterOutcome(target.provider, { kind: "failure", retryable: true, rateLimited: false }, Date.now());
        return { provider: target.provider, reachable: false };
      }
    }),
  );
  return results;
}
