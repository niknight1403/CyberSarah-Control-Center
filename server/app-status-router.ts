import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { detectConfiguredProviders, type RouterProviderId } from "../lib/model-router-logic";
import { getRouterHealth } from "./model-router";
import {
  buildRuntimeStatusSnapshot,
  classifyRuntimeState,
  filterRuntimeLogs,
} from "../lib/live-status-logic";
import {
  clearRuntimeLogs,
  getRuntimeLogs,
  installRuntimeLogger,
} from "./runtime-logger";
import { getRouterSnapshot } from "./model-router";
import { getTelegramStatus } from "./_core/telegram";
import { getToolProxyQueueMetrics } from "./_core/tool-proxy-queue";

/**
 * Sprint 66 — appStatusRouter: Laufzeit-Status und Konsolen-Logs als
 * tRPC-Endpunkte fuer das Live-Panel und den Chat-Agenten.
 *
 * status: protected (nur Zustand, URL, Latenz — keine Interna).
 * recentLogs: protected, eigene Sicht auf Server-Logs gefiltert.
 * clearLogs: admin — leert den In-Memory-Puffer (kein Restart).
 */

const BOOT_AT = Date.now();

async function pingWorkspace(): Promise<number | null> {
  const baseUrl = process.env.WORKSPACE_SERVICE_URL?.replace(/\/$/, "");
  if (!baseUrl) return null;
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) return null;
    return Date.now() - started;
  } catch {
    return null;
  }
}

export const appStatusRouter = router({
  /**
   * Sprint 196 — Aggregierter Integrations-Status fuer die Admin-UI:
   * LLM-Routen (Health/Reihenfolge), Telegram-Bruecke (maskiert) und
   * Tool-Proxy-Queue-Auslastung in einer Admin-geschuetzten Abfrage.
   */
  integrationStatus: adminProcedure.query(async () => {
    const snapshot = await getRouterSnapshot();
    const telegram = getTelegramStatus();
    const queue = getToolProxyQueueMetrics();
    return {
      llm: {
        healthy: snapshot.health.filter((provider) => provider.status === "ready").length,
        degraded: snapshot.health.filter((provider) => provider.status === "cooldown" || provider.status === "unknown").length,
        total: snapshot.health.length,
        preferredOrder: snapshot.preferredOrder,
        checkedAt: snapshot.now,
      },
      telegram,
      queue,
      mcp: {
        configured: Boolean(process.env.MCP_SERVER_URL?.trim()),
        url: process.env.MCP_SERVER_URL?.trim() ? "konfiguriert" : "nicht konfiguriert",
      },
    };
  }),
  status: protectedProcedure.query(async () => {
    installRuntimeLogger();
    const logs = getRuntimeLogs();
    const pingMs = await pingWorkspace();
    return buildRuntimeStatusSnapshot({
      input: {
        processUp: true,
        lastErrorAtMs: logs
          .filter((entry) => entry.level === "error")
          .at(-1)?.atMs,
        nowMs: Date.now(),
      },
      activeUrl: process.env.PUBLIC_APP_URL || "http://localhost:3000",
      port: parseInt(process.env.PORT || "3000", 10),
      connectionKind: "sse",
      pingMs,
      buffer: logs,
      serverUptimeMs: Date.now() - BOOT_AT,
    });
  }),

  recentLogs: protectedProcedure
    .input(
      z
        .object({
          levels: z.array(z.enum(["info", "warn", "error", "success"])).max(4).optional(),
          query: z.string().trim().max(200).optional(),
          limit: z.number().int().min(1).max(500).default(100),
        })
        .default({ limit: 100 }),
    )
    .query(({ input }) => {
      installRuntimeLogger();
      const filtered = filterRuntimeLogs(getRuntimeLogs(), {
        levels: input?.levels,
        query: input?.query,
      });
      return {
        entries: filtered.slice(-Math.min(input?.limit ?? 100, 500)).reverse(),
        total: filtered.length,
      };
    }),

  clearLogs: adminProcedure.mutation(() => {
    const removed = clearRuntimeLogs();
    return { removed, state: classifyRuntimeState({ processUp: true, nowMs: Date.now() }) };
  }),
  /**
   * Sprint 156 — Provider-Uebersicht fuer das Dashboard (protected, ohne
   * Keys): Anzahl konfigurierter/gesunder Provider, aktiver Provider mit
   * Default-Modell — ausschliesslich aus serverseitigem ENV/Health-Register
   * abgeleitet. Keine API-Keys, keine Header, keine geratenen Namen.
   */
  providerSummary: protectedProcedure.query(() => {
    const env = process.env as Record<string, string | undefined>;
    const configured = detectConfiguredProviders(env);
    const health = getRouterHealth();
    const labels: Partial<Record<RouterProviderId, string>> = {
      managed: "Managed (Forge)",
      openai: "OpenAI",
      anthropic: "Anthropic",
      gemini: "Google Gemini",
      openrouter: "OpenRouter",
      groq: "Groq",
      together: "Together AI",
      huggingface: "Hugging Face",
      ollama: "Ollama (lokal)",
      lmstudio: "LM Studio (lokal)",
      custom: "Eigener Endpoint",
    };
    const models: Partial<Record<RouterProviderId, string | undefined>> = {
      openai: env.AI_OPENAI_MODEL,
      anthropic: env.AI_ANTHROPIC_MODEL,
      gemini: env.AI_GEMINI_MODEL,
      openrouter: env.AI_OPENROUTER_MODEL,
      groq: env.AI_GROQ_MODEL,
      together: env.AI_TOGETHER_MODEL,
      ollama: env.AI_OLLAMA_MODEL,
      lmstudio: env.AI_LMSTUDIO_MODEL,
      custom: env.AI_CUSTOM_MODEL,
    };
    let healthyCount = 0;
    for (const provider of configured) {
      if (health[provider]?.status === "ready") healthyCount += 1;
    }
    // Aktiver Provider: erster Gesunder in der Default-Prioritaet; ohne
    // Health-Daten wird keiner als "aktiv" behauptet (Dashboard: "wird geprueft").
    const priority: RouterProviderId[] = ["managed", "openai", "anthropic", "gemini", "openrouter", "groq", "together", "huggingface", "ollama", "lmstudio", "custom"];
    const active = priority.find(
      (provider) => configured.includes(provider) && health[provider]?.status === "ready",
    ) ?? null;
    return {
      configuredCount: configured.length,
      healthyCount,
      activeProvider: active ? (labels[active] ?? active) : null,
      activeModel: active ? (models[active] ?? null) : null,
    };
  }),
});
