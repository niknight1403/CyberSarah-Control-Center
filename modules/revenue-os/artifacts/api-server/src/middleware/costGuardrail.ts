/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * COST GUARDRAIL — Dynamisches Token- & Kosten-Budgeting pro Tenant
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * VOR jedem LLM-/Agenten-Aufruf:
 *   → istBudgetErschoepft() prüft usedTokensThisMonth < monthlyTokenBudget
 *   → Bei Überschreitung: HTTP 429 "Monthly Token Limit Reached - Upgrade Plan",
 *     es wird KEIN LLM-Call ausgeführt.
 *
 * NACH jedem LLM-Aufruf:
 *   → erfasseTokenVerbrauch() bucht die exakten Token aus dem OpenAI-usage-Objekt
 *     atomar in der Datenbank (token_logs + usedTokensThisMonth) und prüft die
 *     80%-Upsell-Schwelle (automatischer Sales-Agent-Trigger).
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { TIER_UPSELL, PLAN_TIERS, type PlanTier, db } from "@workspace/db";
import { tenantsTable, tokenLogsTable, type Tenant } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { holeTenantById, holeDefaultTenant, stelleSicherInternerTenant } from "../lib/tenantManager";

// ─── LLM-Ausführungskontext (agentName + Tenant) ────────────────────────────────

interface LLMKontext {
  agentName: string;
  tenantId: number | null;
}

let llmKontext: LLMKontext = { agentName: "system", tenantId: null };

/** Setzt den Kontext für den nächsten LLM-Call (von AgentBase vor ausfuehren gesetzt) */
export function setzeLLMKontext(agentName: string, tenantId: number | null = null): void {
  llmKontext = { agentName, tenantId };
}

export function holeLLMKontext(): LLMKontext {
  return llmKontext;
}

// ─── Tenant-Auflösung ───────────────────────────────────────────────────────────

/**
 * Löst den aktuellen Tenant auf: explizit (X-Tenant-Id), sonst Kontext,
 * sonst Default-Tenant (erster externer, sonst interner System-Tenant).
 */
export async function holeAktuellenTenant(tenantIdHeader?: string | number | null): Promise<Tenant | undefined> {
  const id =
    tenantIdHeader ??
    llmKontext.tenantId ??
    (typeof globalThis !== "undefined" ? (globalThis as any).__aktuelleRequestTenantId ?? null : null);

  if (id != null && !Number.isNaN(Number(id))) {
    const t = await holeTenantById(Number(id));
    if (t) return t;
  }
  return (await holeDefaultTenant()) ?? (await stelleSicherInternerTenant());
}

// ─── PRE-CALL: Budget-Prüfung ───────────────────────────────────────────────────

export interface BudgetPruefung {
  erlaubt: boolean;
  tenant?: Tenant;
  grund?: string;
}

/**
 * PRE-CALL GUARD: Muss VOR jedem OpenAI-/Agenten-Aufruf geprüft werden.
 * Interner Tenant wird nie gesperrt (eigene Revenue-Agenten).
 */
export async function istBudgetErschoepft(): Promise<BudgetPruefung> {
  try {
    const tenant = await holeAktuellenTenant();
    if (!tenant) return { erlaubt: true }; // DB offline → System weiterlaufen lassen (Watchdog loggt)
    if (tenant.intern) return { erlaubt: true, tenant };

    if (tenant.status === "canceled") {
      return { erlaubt: false, tenant, grund: "Subscription gekündigt — Zugriff gesperrt" };
    }
    if (tenant.status === "past_due") {
      return { erlaubt: false, tenant, grund: "Zahlungsausfall — Zugriff gesperrt (past_due)" };
    }
    if (tenant.usedTokensThisMonth >= tenant.monthlyTokenBudget) {
      return { erlaubt: false, tenant, grund: "Monthly Token Limit Reached - Upgrade Plan" };
    }
    return { erlaubt: true, tenant };
  } catch (err) {
    logger.warn({ err }, "⚠️ Budget-Prüfung fehlgeschlagen (DB offline?) — Call wird erlaubt");
    return { erlaubt: true };
  }
}

// ─── POST-CALL: Atomare Verbrauchsbuchung ──────────────────────────────────────

/** GPT-4o-mini Preis je Token (USD) — Fallback-Schätzung, exakt genug für Budgeting */
const GPT4O_MINI_EINGABE_PREIS = 0.00000015;
const GPT4O_MINI_AUSGABE_PREIS = 0.0000006;

export interface TokenVerbrauch {
  promptTokens: number;
  completionTokens: number;
}

export function berechneKostenUsd(verbrauch: TokenVerbrauch, model?: string): number {
  if (model && !model.includes("gpt-4o-mini")) {
    // Grobe Fallback-Schätzung für andere Modelle (2x 4o-mini)
    return (
      verbrauch.promptTokens * GPT4O_MINI_EINGABE_PREIS * 2 +
      verbrauch.completionTokens * GPT4O_MINI_AUSGABE_PREIS * 2
    );
  }
  return (
    verbrauch.promptTokens * GPT4O_MINI_EINGABE_PREIS +
    verbrauch.completionTokens * GPT4O_MINI_AUSGABE_PREIS
  );
}

/**
 * POST-CALL HOOK: Wird automatisch nach jedem erfolgreichen LLM-Call ausgeführt.
 * - Schreibt einen exakten token_logs-Eintrag
 * - Summiert usedTokensThisMonth ATOMAR hoch (SQL-Increment, kein Read-Modify-Write)
 * - Prüft die 80%-Schwelle → triggert automatisch die Sales-Agent-Upsell-Sequenz
 * Feuer-und-vergessen: Fehler beim Loggen brechen den Agenten-Flow NICHT.
 */
export async function erfasseTokenVerbrauch(params: {
  verbrauch: TokenVerbrauch;
  agentName?: string;
  model?: string;
}): Promise<void> {
  const { verbrauch } = params;
  const agentName = params.agentName ?? llmKontext.agentName;
  const totalTokens = verbrauch.promptTokens + verbrauch.completionTokens;
  if (totalTokens <= 0) return;

  try {
    const tenant = await holeAktuellenTenant();
    if (!tenant) return;

    const kostenUsd = berechneKostenUsd(verbrauch, params.model);

    // Exakter Verbrauchs-Log
    await db.insert(tokenLogsTable).values({
      tenantId: tenant.id,
      agentName,
      promptTokens: verbrauch.promptTokens,
      completionTokens: verbrauch.completionTokens,
      totalTokens,
      totalCostUsd: kostenUsd.toFixed(6),
      model: params.model ?? "gpt-4o-mini",
    });

    // Atomares Hochzählen (konkurrierende Agenten-Aufrufe sicher)
    const [aktualisiert] = await db
      .update(tenantsTable)
      .set({
        usedTokensThisMonth: sql`${tenantsTable.usedTokensThisMonth} + ${totalTokens}`,
        updatedAt: new Date(),
      })
      .where(eq(tenantsTable.id, tenant.id))
      .returning();

    // Metered Upsell Trigger (80%-Schwelle)
    if (aktualisiert) {
      await pruefeUndTriggerUpsell(aktualisiert);
    }
  } catch (err) {
    logger.warn({ err, agentName }, "⚠️ Token-Verbrauch konnte nicht gebucht werden (DB offline?)");
  }
}

// ─── Metered Upsell Trigger (80%-Schwelle) ──────────────────────────────────────

const UPSELL_SCHWELLE = 0.8;
/** Max. 1 Upsell-Trigger je Abrechnungsmonat (25 Tage Schutzfrist) */
const UPSELL_COOLDOWN_MS = 25 * 24 * 60 * 60 * 1000;

/**
 * Bei ≥80% des monatlichen Token- ODER Lead-Budgets startet der Sales Agent
 * automatisch eine E-Mail-Nurturing-Sequenz zur Upgrade-Einladung.
 * Cooldown verhindert Spam (max. 1 Trigger pro Monat).
 */
export async function pruefeUndTriggerUpsell(tenant: Tenant): Promise<void> {
  if (tenant.intern) return; // Kein Upsell für interne Agenten

  const tokenQuote = tenant.monthlyTokenBudget > 0
    ? tenant.usedTokensThisMonth / tenant.monthlyTokenBudget
    : 0;
  const leadQuote = tenant.monthlyLeadBudget > 0
    ? tenant.usedLeadsThisMonth / tenant.monthlyLeadBudget
    : 0;

  if (tokenQuote < UPSELL_SCHWELLE && leadQuote < UPSELL_SCHWELLE) return;

  // Cooldown: bereits in diesem Abrechnungsmonat getriggert?
  if (tenant.lastUpsellTriggerAt && Date.now() - tenant.lastUpsellTriggerAt.getTime() < UPSELL_COOLDOWN_MS) {
    return;
  }

  // Cooldown-Flag sofort atomar setzen (verhindert Doppel-Trigger bei Parallelauf)
  const [reserviert] = await db
    .update(tenantsTable)
    .set({ lastUpsellTriggerAt: new Date(), updatedAt: new Date() })
    .where(
      sql`${tenantsTable.id} = ${tenant.id} AND (${tenantsTable.lastUpsellTriggerAt} IS NULL OR ${tenantsTable.lastUpsellTriggerAt} < ${new Date(Date.now() - UPSELL_COOLDOWN_MS).toISOString()})`
    )
    .returning();

  if (!reserviert) return; // Anderer Parallelaufruf hat bereits getriggert

  const planTier = (PLAN_TIERS as readonly string[]).includes(tenant.planTier)
    ? (tenant.planTier as PlanTier)
    : "lite";
  const naechsteStufe = TIER_UPSELL[planTier] ?? null;
  if (!naechsteStufe) return; // Elite: höchste Stufe erreicht

  logger.info(
    { tenantId: tenant.id, name: tenant.name, tokenQuote: `${(tokenQuote * 100).toFixed(1)}%`, leadQuote: `${(leadQuote * 100).toFixed(1)}%`, naechsteStufe },
    `📈 80%-Budget-Schwelle erreicht — Sales-Agent-Upsell-Sequenz getriggert (${tenant.planTier} → ${naechsteStufe})`
  );

  // Sales Agent asynchron über die globale Job-Queue starten (kein Circular Import)
  try {
    const { globalQueue } = await import("../agents/JobQueue");
    globalQueue.fuegeHinzu(
      "sales_upsell_nurture",
      {
        aktion: "upsell_nurture",
        tenantId: tenant.id,
        tenantName: tenant.name,
        aktuellerPlan: tenant.planTier,
        naechsteStufe,
        tokenQuote,
        leadQuote,
      },
      { prioritaet: 2 }
    );
  } catch (err) {
    logger.warn({ err }, "⚠️ Upsell-Task konnte nicht in die Queue gestellt werden");
  }
}

// ─── Express-Middleware für Agenten-Executions ─────────────────────────────────

/**
 * Schützt alle Agenten-Execution-Endpunkte:
 * - 403: Tenant gesperrt (Kündigung / Zahlungsausfall)
 * - 429: Monats-Token-Budget erschöpft → "Upgrade Plan"
 * Resolved Tenant wird in res.locals.tenant für nachgelagerte Handler bereitgestellt.
 */
export const costGuardrailMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  void verarbeiteCostGuardrail(req, res, next);
};

async function verarbeiteCostGuardrail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantHeader = req.headers["x-tenant-id"];
    const tenant = await holeAktuellenTenant(Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader);

    if (!tenant) {
      // Keine DB / kein Tenant: Legacy-Verhalten aktiv lassen (interner Betrieb)
      next();
      return;
    }
    (res as any).locals.tenant = tenant;

    if (!tenant.intern) {
      if (tenant.status === "canceled" || tenant.status === "past_due") {
        res.status(403).json({
          error: "Forbidden",
          message: tenant.status === "canceled"
            ? "Subscription gekündigt — Agenten-Executions gesperrt. Reaktiviere dein Abo."
            : "Zahlungsausfall — Agenten-Executions gesperrt. Bitte Zahlungsmittel aktualisieren.",
          code: "SUBSCRIPTION_INACTIVE",
        });
        return;
      }
      if (tenant.usedTokensThisMonth >= tenant.monthlyTokenBudget) {
        res.status(429).json({
          error: "Too Many Requests",
          message: "Monthly Token Limit Reached - Upgrade Plan",
          code: "TOKEN_BUDGET_EXCEEDED",
          usedTokensThisMonth: tenant.usedTokensThisMonth,
          monthlyTokenBudget: tenant.monthlyTokenBudget,
          planTier: tenant.planTier,
        });
        return;
      }
    }

    next();
  } catch (err) {
    logger.warn({ err }, "⚠️ Cost-Guardrail-Fehler — Request wird durchgelassen");
    next();
  }
}
