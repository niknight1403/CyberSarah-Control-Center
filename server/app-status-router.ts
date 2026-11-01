import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { detectConfiguredProviders, type RouterProviderId } from "../lib/model-router-logic";
import { getRouterHealth , getRouterSnapshot } from "./model-router";
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
import { getTelegramStatus } from "./_core/telegram";
import { getToolProxyQueueMetrics } from "./_core/tool-proxy-queue";
import { getRouteRotationStatus } from "./route-rotation-agent";
import { getAdministratorStripeHealth } from "./stripe-admin-health";
import { readStripeAdminCatalog } from "./stripe-catalog-readonly";
import { getDb } from "./db";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { productReleaseEvents } from "../drizzle/schema";
import { filterCatalogProducts, reviewCatalogProduct } from "../lib/admin-catalog-mobile-logic";
import { queueStripeProductCampaign } from "./stripe-product-content-bridge";

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
  const baseUrl = ENV.workspaceServiceUrl;
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
  stripeCampaignDraft: adminProcedure.input(z.object({
    productId: z.string().regex(/^prod_[A-Za-z0-9]+$/).max(90),
    personaId: z.enum(["nova","mira","juno","lina","kaya","zara"]).default("nova"),
    platform: z.enum(["instagram","tiktok","linkedin","x","threads","bluesky"]).default("instagram"),
  })).mutation(({input}) => queueStripeProductCampaign(input)),
  stripeCatalog: adminProcedure.query(async () => {
    try { return await readStripeAdminCatalog(); }
    catch (error) {
      // Sprint 29 - Provider und Recovery-Status sichtbar machen statt pauschal zu verallgemeinern.
      const state = (error as { providerSync?: {
        provider: string; lastErrorClass: string | null; consecutiveFailures: number;
        nextRetryAt: number | null; requiresManualAction: boolean; lastErrorMessage: string | null;
      } }).providerSync;
      if (state) {
        const retry = state.requiresManualAction
          ? "manuelle Pruefung erforderlich"
          : state.nextRetryAt
            ? `naechster Versuch ab ${new Date(state.nextRetryAt).toISOString()}`
            : "kein automatischer Wiederholungsversuch";
        throw new Error(
          `Stripe-Produktkatalog nicht lesbar (${state.provider}: ${state.lastErrorClass ?? "unbekannt"}, ` +
          `Fehlerserie ${state.consecutiveFailures}, ${retry}). Admin-Konfiguration und Rechte pruefen.`,
        );
      }
      throw new Error("Stripe-Produktkatalog derzeit nicht lesbar. Admin-Konfiguration und Rechte pruefen.");
    }
  }),
  /**
   * Sprint 30 — Mobile Katalogansicht: gefilterte, geprueften Zeilen mit
   * Facetten. Read-only; die Freigabe selbst laeuft ueber stripeProductRelease.
   */
  stripeCatalogView: adminProcedure.input(z.object({
    search: z.string().trim().max(80).optional(),
    activeOnly: z.boolean().optional(),
    onlyWithIssues: z.boolean().optional(),
    verdict: z.enum(["freigabefaehig", "pruefen", "blockiert"]).optional(),
    currency: z.string().trim().length(3).optional(),
    maxPriceMinor: z.number().int().min(0).max(100_000_000).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }).optional()).query(async ({ input }) => {
    const catalog = await readStripeAdminCatalog();
    const prices = catalog.prices.map(price => ({
      id: price.id,
      currency: price.currency,
      amountMinor: price.amountMinor,
      billing: price.billing,
      interval: price.interval,
      intervalCount: price.intervalCount,
      taxBehavior: price.taxBehavior,
      active: price.active,
      createdAtMs: price.createdAt === null ? null : Date.parse(price.createdAt),
      isDefault: catalog.products.some(product => product.defaultPriceId === price.id),
    }));
    const view = filterCatalogProducts(
      catalog.products.map(product => ({
        id: product.id,
        name: product.name,
        active: product.active,
        defaultPriceId: product.defaultPriceId,
        priceCount: product.priceCount,
        issues: product.issues,
      })),
      prices,
      input ?? {},
      { catalogComplete: catalog.complete },
    );
    return { ...view, mode: catalog.mode, providerSync: catalog.providerSync };
  }),

  /** Sprint 30 — letzte manuelle Freigaben/Empfehlungen dieses Admins. */
  stripeProductReleases: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { available: false as const, events: [] };
    const events = await db.select({
      productId: productReleaseEvents.productId,
      productName: productReleaseEvents.productName,
      action: productReleaseEvents.action,
      verdict: productReleaseEvents.verdict,
      note: productReleaseEvents.note,
      createdAt: productReleaseEvents.createdAt,
    }).from(productReleaseEvents)
      .where(eq(productReleaseEvents.actorOpenId, ctx.user.openId))
      .orderBy(desc(productReleaseEvents.createdAt)).limit(100);
    return { available: true as const, events };
  }),

  /**
   * Sprint 30 — manuelle Freigabe. Die Pruefung erfolgt serverseitig gegen den
   * aktuellen Katalog; ein blockierter Befund verhindert die Freigabe.
   */
  stripeProductRelease: adminProcedure.input(z.object({
    productId: z.string().regex(/^prod_[A-Za-z0-9]+$/).max(90),
    action: z.enum(["approved", "withdrawn"]),
    note: z.string().trim().max(300).optional(),
  })).mutation(async ({ ctx, input }) => {
    const catalog = await readStripeAdminCatalog();
    const product = catalog.products.find(entry => entry.id === input.productId);
    if (!product) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Produkt ist im aktuellen Katalog nicht enthalten." });
    }
    const review = reviewCatalogProduct(
      {
        id: product.id,
        name: product.name,
        active: product.active,
        defaultPriceId: product.defaultPriceId,
        priceCount: product.priceCount,
        issues: product.issues,
      },
      catalog.prices.map(price => ({
        id: price.id,
        currency: price.currency,
        amountMinor: price.amountMinor,
        billing: price.billing,
        interval: price.interval,
        intervalCount: price.intervalCount,
        taxBehavior: price.taxBehavior,
        active: price.active,
        createdAtMs: price.createdAt === null ? null : Date.parse(price.createdAt),
        isDefault: price.id === product.defaultPriceId,
      })),
      { catalogComplete: catalog.complete },
    );
    if (input.action === "approved" && !review.eligible) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Freigabe blockiert: ${review.blockers.join(" | ")}`,
      });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Datenbank nicht verfügbar." });
    await db.insert(productReleaseEvents).values({
      productId: product.id,
      productName: product.name,
      mode: catalog.mode,
      action: input.action,
      verdict: review.verdict,
      actorOpenId: ctx.user.openId,
      issuesSnapshot: product.issues.slice(0, 40),
      note: input.note ?? null,
      catalogComplete: catalog.complete,
    });
    return {
      ok: true as const,
      action: input.action,
      verdict: review.verdict,
      blockers: review.blockers,
      warnings: review.warnings,
      evidenceNote:
        "Freigabe ist eine menschliche Entscheidung; Stripe bleibt read-only und Medien-/Affiliate-Rechte gelten als unverifiziert.",
    };
  }),

  /**
   * Sprint 196 — Aggregierter Integrations-Status fuer die Admin-UI:
   * LLM-Routen (Health/Reihenfolge), Telegram-Bruecke (maskiert) und
   * Tool-Proxy-Queue-Auslastung in einer Admin-geschuetzten Abfrage.
   */
  integrationStatus: adminProcedure.query(async () => {
    const snapshot = await getRouterSnapshot();
    const telegram = getTelegramStatus();
    const queue = getToolProxyQueueMetrics();
    const rotation = await getRouteRotationStatus();
    const stripe = await getAdministratorStripeHealth();
    const configuredRoutes = rotation.routes.filter((route) => route.configured);
    const healthyRoutes = configuredRoutes.filter((route) => route.healthy);
    return {
      llm: {
        healthy: snapshot.health.filter((provider) => provider.status === "ready").length,
        degraded: snapshot.health.filter((provider) => provider.status === "cooldown" || provider.status === "unknown").length,
        total: snapshot.health.length,
        preferredOrder: snapshot.preferredOrder,
        checkedAt: snapshot.now,
      },
      routeRotation: {
        enabled: rotation.enabled,
        primary: rotation.primary,
        forced: rotation.forced,
        lastTickAt: rotation.lastTickAt,
        configured: configuredRoutes.length,
        healthy: healthyRoutes.length,
        recentAction: rotation.ledger[0]?.action ?? "keep",
        recentReason: rotation.ledger[0]?.reason ?? null,
      },
      telegram,
      stripe,
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
