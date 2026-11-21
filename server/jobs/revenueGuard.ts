import "dotenv/config";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

const HOUR_MS = 60 * 60 * 1000;
const LIVE = process.env.REVENUE_RECOVERY_LIVE === "1";
const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
const resendKey = process.env.RESEND_API_KEY?.trim();
const resendFrom = process.env.RESEND_FROM?.trim();

type StripeInvoice = Stripe.Invoice & {
  customer_email?: string | null;
  hosted_invoice_url?: string | null;
  due_date?: number | null;
  next_payment_attempt?: number | null;
};

function isDue(invoice: StripeInvoice, nowSeconds: number): boolean {
  if (invoice.status !== "open" || invoice.amount_remaining <= 0) return false;
  const due = invoice.due_date ?? invoice.next_payment_attempt ?? null;
  return due !== null && due <= nowSeconds;
}

async function sendRecoveryEmail(invoice: StripeInvoice): Promise<void> {
  const email = invoice.customer_email?.trim();
  const hostedUrl = invoice.hosted_invoice_url?.trim();
  if (!email || !hostedUrl || !resendKey || !resendFrom) {
    throw new Error("invoice_missing_email_or_payment_url_or_resend_config");
  }
  const currency = invoice.currency.toUpperCase();
  const amount = new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(invoice.amount_remaining / 100);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: resendFrom,
      to: [email],
      subject: "Erinnerung: Deine offene Rechnung",
      text: [
        "Guten Tag,",
        "",
        `für dein Konto ist noch ein Betrag von ${amount} offen.`,
        "Du kannst die Zahlung sicher über den folgenden Stripe-Link abschließen:",
        hostedUrl,
        "",
        "Falls du bereits bezahlt hast, kannst du diese Nachricht ignorieren.",
      ].join("\n"),
    }),
  });
  if (!response.ok) throw new Error(`resend_http_${response.status}`);
}

async function runOnce(): Promise<void> {
  if (!stripeKey) {
    console.info("[RevenueGuard] STRIPE_SECRET_KEY fehlt; Stripe-Prüfung übersprungen.");
    return;
  }
  const stripe = new Stripe(stripeKey);
  const invoices = await stripe.invoices.list({ status: "open", limit: 100 });
  const due = invoices.data.filter((invoice) => isDue(invoice as StripeInvoice, Math.floor(Date.now() / 1000))) as StripeInvoice[];
  console.info(`[RevenueGuard] offene überfällige Rechnungen: ${due.length}; mode=${LIVE ? "live" : "dry-run"}`);

  if (!LIVE) {
    for (const invoice of due) console.info("[RevenueGuard] dry-run candidate", { invoiceId: invoice.id, amountRemaining: invoice.amount_remaining, currency: invoice.currency });
    return;
  }
  if (!resendKey || !resendFrom) throw new Error("Live-Recovery requires RESEND_API_KEY and RESEND_FROM");
  const db = await getDb();
  if (!db) throw new Error("Live-Recovery requires the application database");

  for (const invoice of due) {
    const email = invoice.customer_email?.trim();
    const hostedUrl = invoice.hosted_invoice_url?.trim();
    if (!email || !hostedUrl) {
      console.warn("[RevenueGuard] candidate skipped: missing customer email or hosted invoice URL", invoice.id);
      continue;
    }
    const inserted = await db.execute(sql`INSERT INTO revenue_jobs (dedupe_key, kind, status, payload)
      VALUES (${`stripe-dunning:${invoice.id}`}, 'stripe_dunning_email', 'processing',
        ${JSON.stringify({ invoiceId: invoice.id, amountRemaining: invoice.amount_remaining, currency: invoice.currency })}::jsonb)
      ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`);
    const rows = (inserted as unknown as { rows?: Array<{ id: number }> }).rows ?? [];
    if (!rows.length) {
      console.info("[RevenueGuard] already handled; skip", invoice.id);
      continue;
    }
    const jobId = rows[0].id;
    try {
      await sendRecoveryEmail(invoice);
      await db.execute(sql`UPDATE revenue_jobs SET status = 'completed', result = ${JSON.stringify({ sent: true, provider: "resend" })}::jsonb, updated_at = now() WHERE id = ${jobId}`);
      console.info("[RevenueGuard] transactional reminder sent", invoice.id);
    } catch (error) {
      await db.execute(sql`UPDATE revenue_jobs SET status = 'failed', last_error = ${error instanceof Error ? error.message.slice(0, 500) : "unknown"}, updated_at = now() WHERE id = ${jobId}`);
      console.error("[RevenueGuard] email failed", invoice.id, error instanceof Error ? error.message : "unknown");
    }
  }
}

async function main() {
  console.info(`[RevenueGuard] started; mode=${LIVE ? "LIVE" : "DRY-RUN"}; interval=1h`);
  const tick = async () => {
    try { await runOnce(); }
    catch (error) { console.error("[RevenueGuard] cycle failed:", error instanceof Error ? error.message : "unknown"); }
  };
  await tick();
  setInterval(() => { void tick(); }, HOUR_MS);
}

void main().catch((error) => {
  console.error("[RevenueGuard] startup failed:", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});
