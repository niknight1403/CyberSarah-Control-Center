/**
 * Signiertes charge.refunded-Event durch den ECHTEN Webhook-Handler.
 *
 * Kein Stripe-Netzwerk, kein Live-Key: die Signatur wird lokal mit einem
 * Test-Webhook-Secret erzeugt, `processStripeWebhook` prueft sie wie im
 * Betrieb (HMAC ueber den Rohbody) und bucht anschliessend in Postgres.
 *
 * Ablauf: Gutschrift setzen -> Teilerstattung zustellen -> volle Erstattung
 * zustellen -> dasselbe Event erneut zustellen -> Ledger und
 * stripe_webhook_events pruefen.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import Stripe from "stripe";

const DB_URL = process.env.CREDIT_REFUND_E2E_DATABASE_URL ?? "";
const WEBHOOK_SECRET = "whsec_credit_refund_e2e";

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function main(): Promise<void> {
  const target = new URL(DB_URL);
  const localDb =
    target.protocol === "postgresql:" &&
    ["127.0.0.1", "localhost"].includes(target.hostname) &&
    target.pathname === "/credit_refund_ci";
  if (!localDb) throw new Error("Safety gate: Test nur gegen lokale credit_refund_ci.");

  const pool = new Pool({ connectionString: DB_URL, max: 2 });
  const ddl = await readFile("tests/fixtures/credit-ledger-test-schema.sql", "utf8");
  for (const stmt of ddl.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
    await pool.query(stmt);
  }
  await pool.query("TRUNCATE credit_ledger_entries RESTART IDENTITY");
  await pool.query("TRUNCATE stripe_webhook_events");

  process.env.DATABASE_URL = DB_URL;
  process.env.STRIPE_SECRET_KEY = "sk_test_signaturpruefung_lokal";
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.APP_BASE_URL = "https://example.invalid";
  process.env.STRIPE_MODE = "test";

  const { grantCreditsDetailed } = await import("../server/credit-ledger");
  const { processStripeWebhook } = await import("../server/billing");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const openId = "e2e_webhook";
  const paymentIntent = "pi_e2e_webhook";
  const chargeId = "ch_e2e_webhook";
  const paidCents = 1999;
  const granted = 250_000;

  const balance = async (): Promise<number> => {
    const result = await pool.query(
      "SELECT COALESCE(SUM(delta_tokens),0)::int AS b FROM credit_ledger_entries WHERE user_open_id=$1",
      [openId],
    );
    return num(result.rows[0]?.b);
  };

  const grant = await grantCreditsDetailed({
    openId,
    tokens: granted,
    reason: "Webhook-Test Gutschrift",
    executionKey: `stripe_payment:${paymentIntent}`,
    paymentIntent,
  });
  assert.equal(grant.booked, true, "Gutschrift fehlgeschlagen.");
  console.log(`Gutschrift: ${granted} Tokens, Saldo ${await balance()}`);

  const deliver = async (eventId: string, amountRefunded: number, created: number): Promise<void> => {
    const event = {
      id: eventId,
      object: "event",
      api_version: "2024-06-20",
      created,
      livemode: false,
      type: "charge.refunded",
      data: {
        object: {
          id: chargeId,
          object: "charge",
          amount: paidCents,
          amount_refunded: amountRefunded,
          currency: "eur",
          paid: true,
          refunded: amountRefunded >= paidCents,
          payment_intent: paymentIntent,
          metadata: {},
        },
      },
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
    };
    const payload = Buffer.from(JSON.stringify(event), "utf8");
    const signature = stripe.webhooks.generateTestHeaderString({ payload: payload.toString(), secret: WEBHOOK_SECRET });
    const result = await processStripeWebhook(payload, signature);
    console.log(`Event ${eventId} (${amountRefunded}/${paidCents} Cent): ${JSON.stringify(result)}`);
  };

  let failures = 0;
  const check = (label: string, condition: boolean, detail: string): void => {
    console.log(`${condition ? "OK  " : "FEHL"} ${label}: ${detail}`);
    if (!condition) failures += 1;
  };

  // 1) Teilerstattung: der Erstattungsbetrag in Cent zaehlt, nicht die Haelfte
  //    des Pakets. 999 von 1999 Cent sind 49,97 Prozent, also 124.937 Tokens
  //    (abgerundet). Erlaubt ist eine Abweichung von einem Token fuer die
  //    Rundung.
  const partialCents = Math.floor(paidCents / 2);
  await deliver("evt_e2e_partial", partialCents, 1_760_000_000);
  const afterPartial = await balance();
  const partialRefunded = granted - afterPartial;
  const partialExpected = (granted * partialCents) / paidCents;
  check(
    "Teilerstattung ueber Webhook",
    Math.abs(partialRefunded - partialExpected) <= 1,
    `${partialRefunded} Tokens entzogen (proportional ${partialExpected.toFixed(1)}), Saldo ${afterPartial}`,
  );

  // 2) Volle Erstattung: Rest wird nachgezogen
  await deliver("evt_e2e_full", paidCents, 1_760_000_100);
  const afterFull = await balance();
  check("Volle Erstattung ueber Webhook", afterFull === 0, `Saldo ${afterFull}`);

  // 3) Dasselbe Event erneut: darf nichts buchen
  await deliver("evt_e2e_full", paidCents, 1_760_000_100);
  const afterRepeat = await balance();
  check("Wiederholte Zustellung bucht nichts", afterRepeat === 0, `Saldo ${afterRepeat}`);

  // Zwei Events mit unterschiedlichem Erstattungsstand ergeben zwei Buchungen;
  // zusammen duerfen sie die Gutschrift genau aufbrauchen, nie ueberziehen.
  const refunds = await pool.query(
    "SELECT COUNT(*)::int AS n, COALESCE(-SUM(delta_tokens),0)::int AS tokens FROM credit_ledger_entries WHERE kind='refund'",
  );
  check(
    "Erstattungsbuchungen decken die Gutschrift genau",
    num(refunds.rows[0]?.tokens) === granted,
    `${num(refunds.rows[0]?.n)} Buchung(en), zusammen ${num(refunds.rows[0]?.tokens)} von ${granted} Tokens`,
  );

  const events = await pool.query(
    "SELECT event_id, status, attempts FROM stripe_webhook_events ORDER BY event_id",
  );
  const processed = events.rows.filter((row) => String(row.status) === "processed").length;
  check("Beide Events als verarbeitet vermerkt", processed === 2, `${processed} von ${events.rowCount} processed`);

  await pool.query("TRUNCATE credit_ledger_entries RESTART IDENTITY");
  await pool.query("TRUNCATE stripe_webhook_events");
  await pool.end();

  if (failures > 0) {
    console.error(`ERGEBNIS: ${failures} Pruefung(en) fehlgeschlagen.`);
    process.exitCode = 1;
    return;
  }
  console.log("ERGEBNIS: OK — signierte charge.refunded-Events buchen korrekt und idempotent.");
}

main().catch((error: unknown) => {
  console.error("Webhook-Test abgebrochen:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
