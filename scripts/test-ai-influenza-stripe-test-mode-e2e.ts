/**
 * End-to-End im Stripe-TESTMODUS gegen eine echte Postgres-Datenbank.
 *
 * Bewusst testMode: der Key muss ein Test-Key sein, sonst bricht das Skript
 * vor dem ersten API-Aufruf ab. Es wird kein Live-Objekt erzeugt und keine
 * echte Zahlung ausgeloest.
 *
 * Ablauf: Kunde -> Auftrag -> Stripe-Testkunde -> Subscription mit
 * pm_card_visa -> bezahlte Invoice -> unsere Sync-Funktionen -> Pruefung in
 * der Datenbank -> Aufraeumen.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import Stripe from "stripe";

// .trim(): Secrets koennen mit Zeilenumbruch gespeichert sein; ohne Trim
// scheitert die Praefixpruefung, obwohl der Key stimmt.
const STRIPE_KEY = (process.env.STRIPE_SECRET_KEY ?? "").trim();
const DB_URL = process.env.AI_INFLUENZA_INTEGRATION_DATABASE_URL ?? "";

function assertSafety() {
  if (!STRIPE_KEY.startsWith("sk_test_") && !STRIPE_KEY.startsWith("rk_test_"))
    throw new Error("Safety gate: nur Test-Keys (sk_test_/rk_test_).");
  const target = new URL(DB_URL);
  if (
    target.protocol !== "postgresql:" ||
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.pathname !== "/influenza_stripe_ci"
  )
    throw new Error("Safety gate: PostgreSQL-Test nur gegen lokale influenza_stripe_ci.");
}

async function main(): Promise<void> {
  assertSafety();
  console.log(`Key-Klasse: TEST (Praefix ${STRIPE_KEY.slice(0, 8)}…, ${STRIPE_KEY.length} Zeichen)`);
  const pool = new Pool({ connectionString: DB_URL, max: 2 });
  const ddl = await readFile("tests/fixtures/ai-influenza-test-schema.sql", "utf8");
  for (const stmt of ddl.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
    await pool.query(stmt);
  }

  process.env.DATABASE_URL = DB_URL;
  const schema = await import("../drizzle/schema");
  const service = await import("../server/ai-influenza-team-service");
  const sync = await import("../server/ai-influenza-stripe-sync");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { eq } = await import("drizzle-orm");
  const conn = drizzle(pool, { schema });

  // 1) Kunde + Auftrag im echten Datenmodell
  await conn
    .insert(schema.b2bNetworkNodes)
    .values({ nodeKey: "stripe-e2e-customer", kind: "customer", name: "Stripe E2E Testkunde", optedOut: false })
    .onConflictDoNothing();
  const order = await service.createAiInfluenzaOrder({
    customerNodeKey: "stripe-e2e-customer",
    packageId: "growth",
    mode: "assisted",
    createdByOpenId: "ci-stripe-e2e",
  });
  const jobId = order.job.id;
  const orderId = order.payload.orderId;
  console.log(`Auftrag angelegt: ${orderId} (Schritt ${order.payload.step})`);

  // 2) Bis payment-pending freigeben (Freigaben werden hier explizit erteilt)
  let step = order.payload.step;
  for (let i = 0; i < 20 && step !== "payment-pending"; i++) {
    const advanced = await service.advanceAiInfluenzaOrder({ jobId, approved: true, estimatedCostCents: 0 });
    step = advanced.order.step;
  }
  assert.equal(step, "payment-pending", "Auftrag muss vor der Zahlung bei payment-pending stehen");
  console.log("Auftrag steht bei payment-pending");

  // 3) Stripe-TESTOBJEKTE
  const stripe = new Stripe(STRIPE_KEY, { maxNetworkRetries: 2 });
  const customer = await stripe.customers.create({
    email: `e2e+${Date.now()}@cybersarah.test`,
    name: "Stripe E2E Testkunde",
    metadata: { businessUnit: "ai-influenza-team" },
  });
  const price = await stripe.prices.create({
    currency: "eur",
    unit_amount: 99900,
    recurring: { interval: "month" },
    product_data: { name: "AI Influenza Growth (Test)" },
  });
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
    metadata: { businessUnit: "ai-influenza-team", packageId: "growth", orderId },
  });
  const latest = subscription.latest_invoice;
  const invoiceId = typeof latest === "string" ? latest : latest?.id;
  assert.ok(invoiceId, "Subscription braucht eine Invoice");
  const intent = typeof latest === "object" && latest ? (latest as { payment_intent?: { id?: string } | string | null }).payment_intent : null;
  const intentId = typeof intent === "string" ? intent : intent?.id;
  assert.ok(intentId, "Subscription braucht ein PaymentIntent im Testmodus");
  await stripe.paymentIntents.confirm(intentId as string, { payment_method: "pm_card_visa" });

  const paidInvoice = await stripe.invoices.retrieve(invoiceId as string, { expand: ["parent.subscription_details"] });
  const activeSub = await stripe.subscriptions.retrieve(subscription.id, { expand: ["latest_invoice.parent.subscription_details"] });
  assert.equal(paidInvoice.status, "paid", "Test-Invoice muss bezahlt sein");
  assert.equal(activeSub.status, "active", "Test-Subscription muss aktiv sein");
  console.log(`Stripe-Testobjekte bezahlt: Invoice ${paidInvoice.id} ueber ${(paidInvoice.amount_paid / 100).toFixed(2)} EUR`);

  // 4) Unsere Verarbeitung mit den ECHTEN Stripe-Objekten
  const subSync = (await sync.syncAiInfluenzaSubscription(activeSub)) as { handled: boolean; orderUpdated?: boolean };
  assert.equal(subSync.handled, true);
  assert.equal(subSync.orderUpdated, true, "Auftrag muss durch das Abo aktualisiert werden");
  const invSync = (await sync.recordAiInfluenzaInvoice(paidInvoice)) as { handled: boolean; recognizedRevenueCents?: number };
  assert.equal(invSync.handled, true);
  assert.equal(invSync.recognizedRevenueCents, 99900);

  // 5) Datenbank pruefen
  const [row] = await conn
    .select()
    .from(schema.revenueJobs)
    .where(eq(schema.revenueJobs.dedupeKey, `ai-influenza-order:${orderId}`))
    .limit(1);
  const payload = row.payload as { step?: string; paymentStatus?: string };
  assert.equal(payload.step, "paid", "Auftrag muss nach verifiziertem Stripe-Event auf paid stehen");
  assert.equal(payload.paymentStatus, "paid");
  const tasks = await conn.select().from(schema.revenueJobs).where(eq(schema.revenueJobs.kind, "ai-influenza-task"));
  assert.ok(tasks.length >= 33, `Growth braucht mindestens 33 Delivery-Tasks, gefunden: ${tasks.length}`);
  const [attr] = await conn
    .select()
    .from(schema.revenueAttributionEvents)
    .where(eq(schema.revenueAttributionEvents.eventKey, `ai-influenza:stripe-invoice:${paidInvoice.id}`))
    .limit(1);
  assert.equal(attr.valueCents, 99900);
  assert.equal(attr.platform, "stripe");
  console.log(`DB-Beleg: Auftrag paid, ${tasks.length} Delivery-Tasks, Attribution ${(attr.valueCents / 100).toFixed(2)} EUR`);

  // 6) Aufraeumen (Testmodus)
  await stripe.subscriptions.cancel(subscription.id);
  await stripe.customers.del(customer.id);
  await pool.end();
  console.log("PASS: Stripe-Testmodus-E2E — Auftrag -> Abo bezahlt -> Auftrag paid -> Tasks queued -> Umsatz attribuiert.");
}

main().catch((error) => {
  console.error("FAIL:", error instanceof Error ? error.message : error);
  process.exit(1);
});
