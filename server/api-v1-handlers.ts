/**
 * Sprint 214 — Handler der oeffentlichen v1-API mit explizitem I/O-Seam.
 *
 * Warum dieses Modul existiert: `server/api-v1.ts` enthielt Registrierung UND
 * gesamte Handler-Logik in einer Datei, die direkt `sdk`, `getDb`, `invokeLLM`
 * und das Guthaben-Ledger importierte. In der Node-Suite war davon nichts
 * erreichbar (0 % Lines), obwohl hier Geld fliesst: Reservieren, Nachbuchen,
 * Erstatten bei Fehlern, 402-Payloads.
 *
 * Die Handler bekommen ihre Abhaengigkeiten deshalb uebergeben. Produktiv
 * greift `defaultApiV1Deps` (unveraendertes Verhalten, gleiche Reihenfolge der
 * Aufrufe), in Tests kommen Fakes zum Einsatz. Bewusst KEIN `vi.mock`: die
 * Suite laeuft mit `isolate: false`, ein Modul-Mock auf `./credit-ledger`
 * wuerde in Nachbardateien lecken (Repo-Konvention, siehe `server/credit-guard.ts`).
 *
 * Fachliche Regeln, die hier festgehalten sind (jede hat einen Test):
 *  - Auth vor allem anderen: ohne Nutzer kein 400, kein 402, kein LLM-Aufruf.
 *  - Ungueltiger Auftrag (kein verwertbarer Text) → 400, bevor Guthaben
 *    angefasst wird.
 *  - Lokale Provider (Ollama) und Admins reservieren nichts.
 *  - Reicht das Guthaben nicht → 402 mit Handlungsoption, der Lauf findet
 *    nicht statt und wird als "blocked" protokolliert.
 *  - Fehlgeschlagener Modellaufruf → Reservierung vollstaendig zurueck,
 *    Protokoll "error", HTTP 502.
 *  - Erfolgreicher Lauf → Abgleich auf den tatsaechlichen Verbrauch.
 */
import type { Express, NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";

import { superAgents } from "../drizzle/schema";
import {
  buildPaymentRequiredPayload,
  estimatePromptTokens,
  missingTemplateAgents,
  resolveUsageProvider,
} from "../lib/usage-metering-logic";
import { CREDIT_PACKS } from "../lib/monetization-logic";
import {
  computeEstimatedTokens,
  isBillableProvider,
  readRequestMessages,
  resolveAgentId,
  resolveMaxTokens,
  resolveRequestedModel,
} from "../lib/api-v1-request-logic";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import { invokeLLM } from "./_core/llm";
import {
  creditPacksForCheckout,
  getUserTotalCredits,
  reserveCredits,
  settleCredits,
} from "./credit-ledger";
import { readUsageAnalytics, recordAgentExecution } from "./usage-metering";
import { readEntitlements } from "./entitlements";
import { requireCredits } from "./credit-guard";

const CHECKOUT_PATH = "/api/billing/stripe/checkout";

export type ApiUser = { id: number; openId: string; role?: string; name?: string | null };

export type CreditPack = { id: string; label: string; tokens: number; priceEur: number };

/** Alle Aussenkontakte der oeffentlichen API an einer Stelle. */
export interface ApiV1Deps {
  /** Prueft die Sitzung und liefert den Nutzer (oder null). */
  authenticate: (req: Request) => Promise<ApiUser | null>;
  /** Datenbank-Factory (Onboarding, Agentenliste). */
  getDb: typeof getDb;
  /** Modellaufruf der Ausfuehrungsrouten. */
  invokeLLM: typeof invokeLLM;
  reserveCredits: typeof reserveCredits;
  settleCredits: typeof settleCredits;
  getUserTotalCredits: (openId: string) => Promise<number | null>;
  creditPacksForCheckout: () => readonly CreditPack[];
  recordAgentExecution: typeof recordAgentExecution;
  readUsageAnalytics: typeof readUsageAnalytics;
  readEntitlements: typeof readEntitlements;
}

/** Produktionsverdrahtung — identisch zum bisherigen Verhalten. */
export const defaultApiV1Deps: ApiV1Deps = {
  authenticate: (req) => sdk.authenticateRequest(req) as Promise<ApiUser>,
  getDb,
  invokeLLM,
  reserveCredits,
  settleCredits,
  getUserTotalCredits,
  creditPacksForCheckout,
  recordAgentExecution,
  readUsageAnalytics,
  readEntitlements,
};

function checkoutUrlFor(req: Request): string {
  const base = (process.env.APP_BASE_URL ?? `${req.protocol}://${req.get("host") ?? "localhost"}`).replace(/\/$/, "");
  return `${base}${CHECKOUT_PATH}`;
}

function executionKeyOf(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Ergebnis des Onboarding-Seeds; `available: false` heisst "Datenbank fehlt". */
export interface TemplateSeedResult {
  available: boolean;
  created: string[];
  alreadyPresent: string[];
}

/**
 * Handler-Fabrik. Jeder Handler bekommt nur `req`/`res` und arbeitet
 * ausschliesslich ueber die uebergebenen Abhaengigkeiten.
 */
export function createApiV1Handlers(deps: ApiV1Deps) {
  /**
   * Authentifiziert und antwortet bei Misserfolg bereits mit 401.
   * Ein fehlender Nutzer ist kein Serverfehler: `authenticate` darf werfen.
   */
  async function requireApiUser(req: Request, res: Response): Promise<ApiUser | null> {
    try {
      const user = await deps.authenticate(req);
      if (!user?.openId) {
        res.status(401).json({ error: "Authentifizierung erforderlich.", code: "unauthenticated" });
        return null;
      }
      return user;
    } catch {
      res.status(401).json({ error: "Authentifizierung erforderlich.", code: "unauthenticated" });
      return null;
    }
  }

  /** Express-Middleware: authentifiziert einmal, legt den Nutzer in `res.locals`. */
  function attachApiUser() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const user = await requireApiUser(req, res);
      if (!user) return;
      res.locals.user = user;
      next();
    };
  }

  /**
   * Legt fehlende Vorlagen-Agenten an (idempotent ueber den Namen).
   * Wird auch beim ersten Login aufgerufen, damit kein leeres Dashboard erscheint.
   */
  async function ensureTemplateAgents(openId: string): Promise<TemplateSeedResult> {
    const db = await deps.getDb();
    if (!db || !openId) return { available: false, created: [], alreadyPresent: [] };
    try {
      const existing = await db
        .select({ name: superAgents.name })
        .from(superAgents)
        .where(eq(superAgents.userOpenId, openId));
      const existingNames = existing.map((row) => row.name);
      const missing = missingTemplateAgents(existingNames);
      if (missing.length === 0) return { available: true, created: [], alreadyPresent: existingNames };
      const sessionSeed = `${openId.slice(0, 8)}-${Date.now().toString(36)}`;
      await db.insert(superAgents).values(
        missing.map((template, index) => ({
          userOpenId: openId,
          name: template.name.slice(0, 80),
          purpose: `${template.purpose}\n\nArbeitsauftrag: ${template.prompt}`,
          sessionId: `${sessionSeed}-${index}`.slice(0, 64),
          isDefault: true,
        })),
      );
      return {
        available: true,
        created: missing.map((template) => template.name),
        alreadyPresent: existingNames,
      };
    } catch (error) {
      console.warn(
        "[onboarding] Vorlagen-Agenten nicht angelegt:",
        error instanceof Error ? error.message : String(error),
      );
      return { available: false, created: [], alreadyPresent: [] };
    }
  }

  /** Health-Check: billig, ohne Datenbank, ohne interne Details. */
  function healthz(_req: Request, res: Response): void {
    res.status(200).json({ ok: true, service: "cybersarah-control-center", time: Date.now() });
  }

  /**
   * Ausfuehrungsroute fuer Agenten-Laeufe und LLM-Kaskade.
   * `surface` landet im Protokoll und im Reservierungsgrund.
   */
  function runHandler(surface: "agent" | "llm") {
    return async (req: Request, res: Response): Promise<void> => {
      const user = res.locals.user as ApiUser | undefined;
      if (!user) {
        res.status(401).json({ error: "Authentifizierung erforderlich.", code: "unauthenticated" });
        return;
      }

      const messages = readRequestMessages(req.body);
      if (!messages) {
        res.status(400).json({
          error: "Feld 'messages' (Array) oder 'prompt' (Text) erforderlich.",
          code: "invalid_request",
        });
        return;
      }

      const body = (req.body ?? {}) as { agentId?: unknown; model?: unknown; maxTokens?: unknown };
      const requestedModel = resolveRequestedModel(body.model);
      const agentId = resolveAgentId(body.agentId);
      const provider = resolveUsageProvider(requestedModel);
      const maxTokens = resolveMaxTokens(body.maxTokens);

      const { promptTokens, estimatedTokens } = computeEstimatedTokens({
        messages,
        maxTokens,
        estimatePromptTokens,
      });
      // Eigene/lokale Provider kosten nichts: keine Reservierung noetig.
      const billable = isBillableProvider(provider);
      const executionKey = executionKeyOf(surface);
      const startedAt = Date.now();
      // Admins arbeiten ohne Guthaben-Grenze (dauerhafte Elite-Garantie).
      const chargeable = billable && user.role !== "admin";

      let reserved = 0;
      if (chargeable) {
        const reservation = await deps.reserveCredits({
          openId: user.openId,
          tokens: estimatedTokens,
          executionKey,
          reason: surface === "agent" ? "Agenten-Lauf" : "LLM-Kaskade",
        });
        if (!reservation.ok) {
          const balance = reservation.balanceTokens ?? (await deps.getUserTotalCredits(user.openId));
          await deps.recordAgentExecution({
            executionKey,
            userOpenId: user.openId,
            agentId,
            surface,
            provider,
            model: requestedModel || null,
            status: "blocked",
            promptTokens: null,
            completionTokens: null,
            durationMs: 0,
            errorCode: "payment_required",
          });
          const packs = deps.creditPacksForCheckout();
          res.status(402).json(
            buildPaymentRequiredPayload({
              plan: user.role === "admin" ? "expert" : "free",
              reason:
                reservation.reason === "unavailable"
                  ? "Guthaben derzeit nicht prüfbar."
                  : "Guthaben reicht für diesen Lauf nicht.",
              requiredTokens: estimatedTokens,
              remainingTokens: balance,
              checkoutUrl: checkoutUrlFor(req),
              creditPacks: packs.length ? packs : CREDIT_PACKS.map((p) => ({ ...p })),
              upgradePlan: "pro",
            }),
          );
          return;
        }
        reserved = estimatedTokens;
      }

      try {
        const result = await deps.invokeLLM({
          messages,
          maxTokens,
          ...(requestedModel ? { model: requestedModel } : {}),
        });
        const promptUsed = result.usage?.prompt_tokens ?? promptTokens;
        const completionUsed = result.usage?.completion_tokens ?? null;
        const actualTokens = promptUsed + (completionUsed ?? 0);
        const durationMs = Date.now() - startedAt;

        if (chargeable && reserved > 0) {
          await deps.settleCredits({
            openId: user.openId,
            reservedTokens: reserved,
            actualTokens,
            executionKey,
          });
        }
        await deps.recordAgentExecution({
          executionKey,
          userOpenId: user.openId,
          agentId,
          surface,
          provider,
          model: result.model ?? (requestedModel || null),
          status: "ok",
          promptTokens: promptUsed,
          completionTokens: completionUsed,
          durationMs,
        });

        res.json({
          ok: true,
          executionId: executionKey,
          model: result.model,
          content: result.choices?.[0]?.message?.content ?? "",
          usage: {
            promptTokens: promptUsed,
            completionTokens: completionUsed,
            totalTokens: actualTokens,
            billed: chargeable,
          },
          durationMs,
        });
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        if (chargeable && reserved > 0) {
          // Fehlgeschlagener Lauf: Reservierung vollstaendig zurueckgeben.
          await deps.settleCredits({
            openId: user.openId,
            reservedTokens: reserved,
            actualTokens: 0,
            executionKey,
          });
        }
        await deps.recordAgentExecution({
          executionKey,
          userOpenId: user.openId,
          agentId,
          surface,
          provider,
          model: requestedModel || null,
          status: "error",
          promptTokens: null,
          completionTokens: null,
          durationMs,
          errorCode: "provider_error",
        });
        res.status(502).json({
          error: "Modell-Aufruf fehlgeschlagen; kein Guthaben verbraucht.",
          code: "provider_error",
          detail: error instanceof Error ? error.message.slice(0, 300) : undefined,
        });
      }
    };
  }

  /** Berechtigungen des angemeldeten Nutzers (Plan, Status, Guthaben, Limits). */
  async function entitlements(_req: Request, res: Response): Promise<void> {
    const user = res.locals.user as ApiUser;
    const result = await deps.readEntitlements({
      userId: user.id,
      openId: user.openId,
      isAdmin: user.role === "admin",
    });
    if (!result.available || !result.view) {
      res.status(207).json({ ok: false, available: false, note: "Berechtigungen derzeit nicht lesbar." });
      return;
    }
    res.json({ ok: true, available: true, ...result.view });
  }

  /** Nutzungs- und ROI-Bericht des angemeldeten Nutzers. */
  async function usageAnalytics(req: Request, res: Response): Promise<void> {
    const user = await requireApiUser(req, res);
    if (!user) return;
    const days = Number(req.query.days ?? 30);
    const planValue = Number(req.query.planValueEurPerMonth ?? NaN);
    const summary = await deps.readUsageAnalytics({
      userOpenId: user.openId,
      days: Number.isFinite(days) ? days : 30,
      planValueEurPerMonth: Number.isFinite(planValue) ? planValue : null,
    });
    const balance = await deps.getUserTotalCredits(user.openId);
    res.status(summary.available ? 200 : 207).json({
      ok: summary.available,
      available: summary.available,
      creditBalanceTokens: balance,
      plan: user.role === "admin" ? "expert" : "free",
      ...summary.summary,
      ...(summary.available ? {} : { note: "Nutzungsdaten derzeit nicht lesbar." }),
    });
  }

  /**
   * Onboarding: legt die Vorlagen-Agenten an, sofern sie fehlen.
   * Idempotent — mehrfaches Aufrufen erzeugt keine Dubletten.
   */
  async function onboardingSeed(req: Request, res: Response): Promise<void> {
    const user = await requireApiUser(req, res);
    if (!user) return;
    const result = await ensureTemplateAgents(user.openId);
    if (!result.available) {
      res.status(503).json({ error: "Datenbank nicht verfügbar.", code: "unavailable" });
      return;
    }
    res.status(result.created.length > 0 ? 201 : 200).json({
      ok: true,
      created: result.created,
      alreadyPresent: result.alreadyPresent,
    });
  }

  /** Eigene Agenten des Nutzers (fuer Dashboard/Verifikation des Seeds). */
  async function listAgents(req: Request, res: Response): Promise<void> {
    const user = await requireApiUser(req, res);
    if (!user) return;
    const db = await deps.getDb();
    if (!db) {
      res.status(503).json({ error: "Datenbank nicht verfügbar.", code: "unavailable" });
      return;
    }
    const rows = await db
      .select({
        id: superAgents.id,
        name: superAgents.name,
        status: superAgents.status,
        isDefault: superAgents.isDefault,
        lastActiveAt: superAgents.lastActiveAt,
      })
      .from(superAgents)
      .where(and(eq(superAgents.userOpenId, user.openId)));
    res.json({ ok: true, agents: rows });
  }

  return {
    requireApiUser,
    attachApiUser,
    ensureTemplateAgents,
    healthz,
    runHandler,
    entitlements,
    usageAnalytics,
    onboardingSeed,
    listAgents,
  };
}

/**
 * Registriert die oeffentlichen Routen.
 *
 * Reihenfolge der Ausfuehrungsrouten bewusst: Auth → billige
 * Guthaben-Vorpruefung (402 mit Handlungsoption) → Lauf mit atomarer
 * Reservierung. Der Waechter bucht nichts.
 */
export function registerApiV1Routes(app: Express, deps: ApiV1Deps = defaultApiV1Deps): void {
  const handlers = createApiV1Handlers(deps);
  // Der Waechter bekommt dieselben Abhaengigkeiten wie die Handler, damit
  // Tests keine zweite, unabhaengig verdrahtete Guthaben-Quelle sehen.
  const guard = (options: Parameters<typeof requireCredits>[0]) =>
    requireCredits(options, {
      readBalance: (openId) => deps.getUserTotalCredits(openId),
      creditPacks: () => deps.creditPacksForCheckout(),
    });

  app.get("/healthz", handlers.healthz);

  app.post("/api/v1/agent/run", handlers.attachApiUser(), guard({ requiredTokens: 1, upgradePlan: "pro" }), handlers.runHandler("agent"));
  app.post("/api/v1/llm/cascade", handlers.attachApiUser(), guard({ requiredTokens: 1, upgradePlan: "pro" }), handlers.runHandler("llm"));

  app.get("/api/v1/entitlements", handlers.attachApiUser(), handlers.entitlements);
  app.get("/api/v1/analytics/usage", handlers.usageAnalytics);
  app.post("/api/v1/onboarding/seed", handlers.onboardingSeed);
  app.get("/api/v1/agents", handlers.listAgents);
}
