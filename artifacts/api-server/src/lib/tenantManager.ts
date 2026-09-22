/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TENANT MANAGER — Stripe → Tenant Provisioning & Status-Sync
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Zentrale, idempotente Verwaltung der B2B-Tenants:
 * - Provisioning bei checkout.session.completed (Budget-Zuweisung je Plan-Tier)
 * - Status-Sperre bei Zahlungsausfall / Kündigung (customer.subscription.updated/deleted)
 * - Monats-Reset der Zähler bei invoice.payment_succeeded
 */
import { db } from "@workspace/db";
import {
  tenantsTable,
  PLAN_BUDGETS,
  type PlanTier,
  type Tenant,
  type TenantStatus,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/** Name des internen System-Tenants (eigene Revenue-Agenten — kein Billing) */
export const INTERNER_TENANT_NAME = "CyberSarah Internal";

// ─── Idempotenter Tenant-Upsert ─────────────────────────────────────────────────

export interface TenantProvisionierung {
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
  planTier: PlanTier;
  name?: string;
}

/**
 * Erstellt oder aktualisiert einen Tenant anhand der Stripe-Subscription.
 * Idempotent: Mehrfache Ausführung (Stripe-Retries) führt zu keinem Duplikat.
 */
export async function stelleTenantBereit(input: TenantProvisionierung): Promise<Tenant> {
  const budgets = PLAN_BUDGETS[input.planTier] ?? PLAN_BUDGETS.lite;
  const name = input.name ?? `Tenant ${input.stripeCustomerId}`;

  const [bestehend] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.stripeCustomerId, input.stripeCustomerId))
    .limit(1);

  let tenant: Tenant | undefined;

  if (bestehend) {
    // Plan-Upgrade/-Downgrade: Budget an neues Tier anpassen,
    // aber bereits verbrauchte Token übernehmen
    const [aktualisiert] = await db
      .update(tenantsTable)
      .set({
        name,
        stripeSubscriptionId: input.stripeSubscriptionId ?? bestehend.stripeSubscriptionId,
        planTier: input.planTier,
        monthlyTokenBudget: budgets.tokens,
        monthlyLeadBudget: budgets.leads,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(tenantsTable.id, bestehend.id))
      .returning();
    tenant = aktualisiert;
    logger.info(
      { tenantId: aktualisiert?.id, planTier: input.planTier },
      "🏢 Tenant aktualisiert (Plan-Zuweisung)"
    );
  } else {
    const [erstellt] = await db
      .insert(tenantsTable)
      .values({
        name,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId ?? null,
        planTier: input.planTier,
        monthlyTokenBudget: budgets.tokens,
        usedTokensThisMonth: 0,
        monthlyLeadBudget: budgets.leads,
        usedLeadsThisMonth: 0,
        status: "active",
        intern: false,
      })
      .returning();
    tenant = erstellt;
    logger.info(
      { tenantId: erstellt?.id, planTier: input.planTier, tokens: budgets.tokens, leads: budgets.leads },
      "🏢 Neuer Tenant provisioniert"
    );
  }

  if (!tenant) throw new Error("Tenant-Upsert fehlgeschlagen");
  return tenant;
}

// ─── Status-Sync (Zahlungsausfall / Kündigung → sofortige Sperre) ───────────────

/** Mappt Stripe-Subscription-Status → Tenant-Status */
export function mappeStripeStatus(stripeStatus: string): TenantStatus {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
  if (
    stripeStatus === "past_due" ||
    stripeStatus === "unpaid" ||
    stripeStatus === "incomplete" ||
    stripeStatus === "incomplete_expired"
  ) {
    return "past_due";
  }
  // canceled / expired / paused
  return "canceled";
}

/**
 * Sperrt oder entsperrt den Tenant zu einer Stripe-Subscription sofort.
 * Bei `canceled`/`past_due` blockiert die Cost-Guardrail alle Agenten-Executions.
 */
export async function setzeTenantStatusBySubscription(
  stripeSubscriptionId: string,
  tenantStatus: TenantStatus
): Promise<Tenant | undefined> {
  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);

  if (!tenant) {
    logger.warn(
      { stripeSubscriptionId, tenantStatus },
      "⚠️ Kein Tenant für Stripe-Subscription gefunden — Status-Sync übersprungen"
    );
    return undefined;
  }

  const [aktualisiert] = await db
    .update(tenantsTable)
    .set({ status: tenantStatus, updatedAt: new Date() })
    .where(eq(tenantsTable.id, tenant.id))
    .returning();

  logger.info(
    { tenantId: tenant.id, name: tenant.name, tenantStatus },
    tenantStatus === "active"
      ? "🏢 Tenant entsperrt — Agenten-Executions wieder erlaubt"
      : `🔒 Tenant gesperrt (${tenantStatus}) — Agenten-Executions blockiert`
  );
  return aktualisiert;
}

// ─── Monats-Reset bei erfolgreicher Rechnungszahlung ──────────────────────────

/**
 * Setzt die monatlichen Zähler (usedTokensThisMonth, usedLeadsThisMonth)
 * atomar auf 0 zurück — idempotent (Reset ist zustandslos).
 */
export async function setzeMonatsZaehlerZurueck(stripeCustomerId: string): Promise<boolean> {
  const [aktualisiert] = await db
    .update(tenantsTable)
    .set({ usedTokensThisMonth: 0, usedLeadsThisMonth: 0, updatedAt: new Date() })
    .where(eq(tenantsTable.stripeCustomerId, stripeCustomerId))
    .returning();

  if (aktualisiert) {
    logger.info(
      { tenantId: aktualisiert.id, name: aktualisiert.name },
      "🔄 Monats-Zähler zurückgesetzt (Rechnung bezahlt) — neues Budget aktiv"
    );
    return true;
  }
  return false;
}

// ─── Interner System-Tenant (Legacy-/Single-Tenant-Betrieb) ─────────────────────

/**
 * Stellt sicher, dass genau ein interner System-Tenant existiert.
 * Eigene Revenue-Agenten laufen ohne Budget-Stopp, aber MIT voller
 * Token-Kostenprotokollierung (Marge-Transparenz).
 */
export async function stelleSicherInternerTenant(): Promise<Tenant | undefined> {
  try {
    const [bestehend] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.intern, true))
      .limit(1);

    if (bestehend) return bestehend;

    const [erstellt] = await db
      .insert(tenantsTable)
      .values({
        name: INTERNER_TENANT_NAME,
        planTier: "elite",
        monthlyTokenBudget: PLAN_BUDGETS.elite.tokens,
        monthlyLeadBudget: PLAN_BUDGETS.elite.leads,
        status: "active",
        intern: true,
      })
      .returning();

    logger.info({ tenantId: erstellt?.id }, "🏢 Interner System-Tenant erstellt");
    return erstellt;
  } catch (err) {
    logger.warn({ err }, "⚠️ Interner Tenant konnte nicht erstellt werden (DB offline?)");
    return undefined;
  }
}

/** Holt einen Tenant per ID (z. B. aus X-Tenant-Id Header) */
export async function holeTenantById(id: number): Promise<Tenant | undefined> {
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
  return tenant;
}

/** Holt den Standard-Tenant: erster aktiver externer Tenant, sonst interner Tenant */
export async function holeDefaultTenant(): Promise<Tenant | undefined> {
  const [externer] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.intern, false))
    .orderBy(tenantsTable.id)
    .limit(1);
  if (externer) return externer;
  return stelleSicherInternerTenant();
}
