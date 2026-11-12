/**
 * Öffentliche v1-API: Health, Agenten-Lauf, LLM-Kaskade, Nutzungsbericht,
 * Onboarding-Seed.
 *
 * Monetarisierungs-Regel für die Ausführungsrouten:
 *  1. Auth prüfen.
 *  2. Guthaben atomar reservieren (Advisory-Lock) — nicht "lesen, dann hoffen".
 *  3. Reicht es nicht: HTTP 402 mit strukturiertem Payload (Checkout, Pakete,
 *     Upgrade) — der Client kann direkt weiterleiten.
 *  4. Nach dem Lauf: tatsächlichen Verbrauch verbuchen und protokollieren.
 *
 * Eigene Provider (lokales Ollama) bleiben kostenfrei; dort wird nichts
 * reserviert.
 */
import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { superAgents } from "../drizzle/schema";
import {
  TEMPLATE_AGENTS,
  buildPaymentRequiredPayload,
  estimatePromptTokens,
  missingTemplateAgents,
  resolveUsageProvider,
} from "../lib/usage-metering-logic";
import { CREDIT_PACKS } from "../lib/monetization-logic";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import { invokeLLM, type Message } from "./_core/llm";
import { creditPacksForCheckout, getUserTotalCredits, reserveCredits, settleCredits } from "./credit-ledger";
import { readUsageAnalytics, recordAgentExecution } from "./usage-metering";
import { readEntitlements } from "./entitlements";
import { requireCredits } from "./credit-guard";

const MAX_PROMPT_CHARS = 24_000;
const DEFAULT_MAX_TOKENS = 900;
const CHECKOUT_PATH = "/api/billing/stripe/checkout";

type ApiUser = { id: number; openId: string; role?: string; name?: string | null };

/** Authentifiziert einmal und legt den Nutzer in res.locals ab. */
async function attachApiUser(req: Request, res: Response, next: () => void): Promise<void> {
  const user = await requireApiUser(req, res);
  if (!user) return;
  res.locals.user = user;
  next();
}

async function requireApiUser(req: Request, res: Response): Promise<ApiUser | null> {
  try {
    const user = (await sdk.authenticateRequest(req)) as ApiUser;
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

function checkoutUrlFor(req: Request): string {
  const base = (process.env.APP_BASE_URL ?? `${req.protocol}://${req.get("host") ?? "localhost"}`).replace(/\/$/, "");
  return `${base}${CHECKOUT_PATH}`;
}

function executionKeyOf(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readMessages(body: unknown): Message[] | null {
  const payload = body as { messages?: unknown; prompt?: unknown; system?: unknown } | null;
  if (Array.isArray(payload?.messages)) {
    const messages = payload.messages
      .filter((entry): entry is { role?: unknown; content?: unknown } => !!entry && typeof entry === "object")
      .map((entry) => ({
        role: (["system", "user", "assistant"].includes(String(entry.role)) ? String(entry.role) : "user") as Message["role"],
        content: String(entry.content ?? "").slice(0, MAX_PROMPT_CHARS),
      }))
      .filter((message) => message.content.trim().length > 0);
    return messages.length > 0 ? messages : null;
  }
  if (typeof payload?.prompt === "string" && payload.prompt.trim()) {
    const messages: Message[] = [];
    if (typeof payload.system === "string" && payload.system.trim()) {
      messages.push({ role: "system", content: payload.system.slice(0, MAX_PROMPT_CHARS) });
    }
    messages.push({ role: "user", content: payload.prompt.slice(0, MAX_PROMPT_CHARS) });
    return messages;
  }
  return null;
}



/**
 * Legt fehlende Vorlagen-Agenten an (idempotent über den Namen).
 * Wird auch beim ersten Login aufgerufen, damit kein leeres Dashboard erscheint.
 */
export async function ensureTemplateAgents(openId: string): Promise<{
  available: boolean;
  created: string[];
  alreadyPresent: string[];
}> {
  const db = await getDb();
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

export function registerApiV1Routes(app: Express): void {
  /**
   * Öffentlicher Health-Check: billig, ohne Datenbank, für Loadbalancer und
   * Uptime-Monitore. Absichtlich ohne interne Details.
   */
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true, service: "cybersarah-control-center", time: Date.now() });
  });

  /** Ausführungsroute für Agenten-Läufe mit Guthaben-Prüfung. */
  const runHandler = (surface: "agent" | "llm") => async (req: Request, res: Response) => {
    const user = res.locals.user as ApiUser | undefined;
    if (!user) {
      res.status(401).json({ error: "Authentifizierung erforderlich.", code: "unauthenticated" });
      return;
    }

    const messages = readMessages(req.body);
    if (!messages) {
      res.status(400).json({
        error: "Feld 'messages' (Array) oder 'prompt' (Text) erforderlich.",
        code: "invalid_request",
      });
      return;
    }

    const body = (req.body ?? {}) as { agentId?: unknown; model?: unknown; maxTokens?: unknown };
    const requestedModel = typeof body.model === "string" && body.model.trim() ? body.model.trim() : "";
    const agentId = typeof body.agentId === "string" ? body.agentId : null;
    const provider = resolveUsageProvider(requestedModel);
    const maxTokens = Math.max(64, Math.min(4000, Number(body.maxTokens) || DEFAULT_MAX_TOKENS));

    const promptTokens = messages.reduce((sum, message) => sum + estimatePromptTokens(String(message.content)), 0);
    const estimatedTokens = promptTokens + maxTokens;
    // Eigene/lokale Provider kosten nichts: keine Reservierung nötig.
    const billable = provider !== "ollama";
    const executionKey = executionKeyOf(surface);
    const startedAt = Date.now();

    let reserved = 0;
    if (billable && user.role !== "admin") {
      const reservation = await reserveCredits({
        openId: user.openId,
        tokens: estimatedTokens,
        executionKey,
        reason: surface === "agent" ? "Agenten-Lauf" : "LLM-Kaskade",
      });
      if (!reservation.ok) {
        const balance = reservation.balanceTokens ?? (await getUserTotalCredits(user.openId));
        await recordAgentExecution({
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
            creditPacks: creditPacksForCheckout().length ? creditPacksForCheckout() : CREDIT_PACKS.map((p) => ({ ...p })),
            upgradePlan: "pro",
          }),
        );
        return;
      }
      reserved = estimatedTokens;
    }

    try {
      const result = await invokeLLM({
        messages,
        maxTokens,
        ...(requestedModel ? { model: requestedModel } : {}),
      });
      const promptUsed = result.usage?.prompt_tokens ?? promptTokens;
      const completionUsed = result.usage?.completion_tokens ?? null;
      const actualTokens = promptUsed + (completionUsed ?? 0);
      const durationMs = Date.now() - startedAt;

      if (billable && reserved > 0) {
        await settleCredits({
          openId: user.openId,
          reservedTokens: reserved,
          actualTokens,
          executionKey,
        });
      }
      await recordAgentExecution({
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
          billed: billable && user.role !== "admin",
        },
        durationMs,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if (billable && reserved > 0) {
        // Fehlgeschlagener Lauf: Reservierung vollständig zurückgeben.
        await settleCredits({ openId: user.openId, reservedTokens: reserved, actualTokens: 0, executionKey });
      }
      await recordAgentExecution({
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

  // Reihenfolge: Auth → billige Guthaben-Vorprüfung (402 mit Handlungsoption)
  // → Lauf mit atomarer Reservierung. Der Wächter bucht nichts.
  app.post("/api/v1/agent/run", attachApiUser, requireCredits({ requiredTokens: 1, upgradePlan: "pro" }), runHandler("agent"));
  app.post("/api/v1/llm/cascade", attachApiUser, requireCredits({ requiredTokens: 1, upgradePlan: "pro" }), runHandler("llm"));

  /** Berechtigungen des angemeldeten Nutzers (Plan, Status, Guthaben, Limits). */
  app.get("/api/v1/entitlements", attachApiUser, async (_req, res) => {
    const user = res.locals.user as ApiUser;
    const result = await readEntitlements({
      userId: user.id,
      openId: user.openId,
      isAdmin: user.role === "admin",
    });
    if (!result.available || !result.view) {
      res.status(207).json({ ok: false, available: false, note: "Berechtigungen derzeit nicht lesbar." });
      return;
    }
    res.json({ ok: true, available: true, ...result.view });
  });

  /** Nutzungs- und ROI-Bericht des angemeldeten Nutzers. */
  app.get("/api/v1/analytics/usage", async (req, res) => {
    const user = await requireApiUser(req, res);
    if (!user) return;
    const days = Number(req.query.days ?? 30);
    const planValue = Number(req.query.planValueEurPerMonth ?? NaN);
    const summary = await readUsageAnalytics({
      userOpenId: user.openId,
      days: Number.isFinite(days) ? days : 30,
      planValueEurPerMonth: Number.isFinite(planValue) ? planValue : null,
    });
    const balance = await getUserTotalCredits(user.openId);
    res.status(summary.available ? 200 : 207).json({
      ok: summary.available,
      available: summary.available,
      creditBalanceTokens: balance,
      plan: user.role === "admin" ? "expert" : "free",
      ...summary.summary,
      ...(summary.available ? {} : { note: "Nutzungsdaten derzeit nicht lesbar." }),
    });
  });

  /**
   * Onboarding: legt die drei Vorlagen-Agenten an, sofern sie fehlen.
   * Idempotent — mehrfaches Aufrufen erzeugt keine Dubletten.
   */
  app.post("/api/v1/onboarding/seed", async (req, res) => {
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
  });

  /** Eigene Agenten des Nutzers (für Dashboard/Verifikation des Seeds). */
  app.get("/api/v1/agents", async (req, res) => {
    const user = await requireApiUser(req, res);
    if (!user) return;
    const db = await getDb();
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
  });
}
