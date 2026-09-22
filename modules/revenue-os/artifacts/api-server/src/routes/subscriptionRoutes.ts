/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SUBSCRIPTION & ABO API (Sprint 6.1)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  subscriptionPlansTable, customerSubscriptionsTable,
  subscriptionInvoicesTable
} from "@workspace/db";
import { eq, desc, and, sql, gte } from "drizzle-orm";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// PLÄNE
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/subscriptions/plans", async (_req, res) => {
  const plans = await db.select().from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.aktiv, true))
    .orderBy(subscriptionPlansTable.reihenfolge);
  res.json({ plans, anzahl: plans.length });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/subscriptions", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
  const subs = await db.select().from(customerSubscriptionsTable).orderBy(desc(customerSubscriptionsTable.createdAt)).limit(limit);

  // Pläne Join
  const plans = await db.select().from(subscriptionPlansTable);
  const enriched = subs.map(s => ({
    ...s,
    plan: plans.find(p => p.id === s.planId) ?? null,
  }));

  res.json({ subscriptions: enriched, anzahl: enriched.length });
});

router.get("/subscriptions/stats", async (_req, res) => {
  const subs = await db.select().from(customerSubscriptionsTable);
  const plans = await db.select().from(subscriptionPlansTable).orderBy(subscriptionPlansTable.reihenfolge);

  const statusCounts: Record<string, number> = {};
  let monatlichMRR = 0, jaehrlichMRR = 0, monatlichSubs = 0, jaehrlichSubs = 0;

  for (const s of subs) {
    statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;
    if (s.status !== "aktiv") continue;
    const plan = plans.find(p => p.id === s.planId);
    if (!plan) continue;
    const preis = parseFloat(plan.preis);
    if (plan.intervall === "year") { jaehrlichMRR += preis / 12; jaehrlichSubs++; }
    else { monatlichMRR += preis; monatlichSubs++; }
  }

  const totalMRR = monatlichMRR + jaehrlichMRR;
  const invoiceCount = await db.select({ count: sql<number>`COUNT(*)` }).from(subscriptionInvoicesTable);
  const bezahltCount = await db.select({ count: sql<number>`COUNT(*)` }).from(subscriptionInvoicesTable).where(eq(subscriptionInvoicesTable.status, "bezahlt"));

  res.json({
    abosGesamt: subs.length, statusVerteilung: statusCounts,
    monatlichMRR: monatlichMRR.toFixed(2), jaehrlichMRR: jaehrlichMRR.toFixed(2),
    totalMRR: totalMRR.toFixed(2), totalARR: (totalMRR * 12).toFixed(2),
    monatlichSubs, jaehrlichSubs,
    rechnungen: Number(invoiceCount[0]?.count ?? 0),
    bezahlteRechnungen: Number(bezahltCount[0]?.count ?? 0),
    plans: plans.map(p => ({ id: p.id, name: p.name, preis: p.preis, intervall: p.intervall, populär: p.populär })),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKOUT-SESSION FÜR NEUES ABO
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/subscriptions/checkout", async (req, res) => {
  const { planId, email, successUrl, cancelUrl } = req.body as any;
  if (!planId || !email) { res.status(400).json({ error: "planId und email erforderlich" }); return; }

  const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, planId)).limit(1);
  if (!plan || !plan.stripePreisId) { res.status(400).json({ error: "Plan nicht gefunden oder nicht mit Stripe verbunden" }); return; }

  try {
    const { getStripeClient } = await import("../lib/stripeClient");
    const stripe = getStripeClient();
    if (!stripe) { res.status(500).json({ error: "Stripe nicht verfügbar" }); return; }

    // Kunde suchen oder erstellen
    let stripeCustomerId: string;
    const [existing] = await db.select().from(customerSubscriptionsTable)
      .where(eq(customerSubscriptionsTable.kundenEmail, email))
      .limit(1);

    if (existing?.stripeCustomerId) {
      stripeCustomerId = existing.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({ email, metadata: { quelle: "subscription_checkout" } });
      stripeCustomerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: plan.stripePreisId, quantity: 1 }],
      subscription_data: {
        trial_period_days: plan.trialTage > 0 ? plan.trialTage : undefined,
        metadata: { planId: String(plan.id), quelle: "subscription_agent" },
      },
      success_url: successUrl || "https://cybersarah.de/abo/bestaetigt?sid={CHECKOUT_SESSION_ID}",
      cancel_url: cancelUrl || "https://cybersarah.de/abo",
      metadata: { planId: String(plan.id), email },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: `Stripe-Fehler: ${(err as Error).message}` });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ABO VERWALTEN
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/subscriptions/:id/cancel", async (req, res) => {
  const id = parseInt(req.params.id);
  const { grund } = req.body as any;

  const [sub] = await db.select().from(customerSubscriptionsTable).where(eq(customerSubscriptionsTable.id, id)).limit(1);
  if (!sub) { res.status(404).json({ error: "Abo nicht gefunden" }); return; }

  await db.update(customerSubscriptionsTable)
    .set({ status: "gekuendigt", gekuendigtAm: new Date(), grundKündigung: grund ?? null, updatedAt: new Date() })
    .where(eq(customerSubscriptionsTable.id, id));

  // Stripe kündigen
  try {
    const { getStripeClient } = await import("../lib/stripeClient");
    const stripe = getStripeClient();
    if (stripe && sub.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    }
  } catch {}

  res.json({ erfolg: true });
});

// ─── Rechnungen ──────────────────────────────────────────────────────────────
router.get("/subscriptions/invoices", async (req, res) => {
  const subId = req.query.subscriptionId ? parseInt(req.query.subscriptionId as string) : undefined;
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);

  let query = db.select().from(subscriptionInvoicesTable).orderBy(desc(subscriptionInvoicesTable.createdAt));
  if (subId) query = query.where(eq(subscriptionInvoicesTable.subscriptionId, subId));

  const invoices = await query.limit(limit);
  res.json({ invoices, anzahl: invoices.length });
});

export default router;
