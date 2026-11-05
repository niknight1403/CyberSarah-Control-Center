/**
 * Erstattungskette im Stripe-TESTMODUS gegen eine echte Postgres-Datenbank.
 *
 * Es werden echte Test-Objekte bei Stripe erzeugt (Testkunde, Zahlung,
 * Erstattung) und durch unsere echten Funktionen gebucht:
 * grantCreditsDetailed fuer die Gutschrift, refundCreditsForCharge fuer die
 * Rueckbuchung. Geprueft werden volle Erstattung, Teilerstattung, wiederholte
 * Zustellung und die Kappung am vorhandenen Guthaben.
 *
 * Schutzgeländer: der Key muss von Stripe als livemode=false bestaetigt werden,
 * und die Datenbank muss die lokale credit_refund_ci sein. Ein Live-Lauf ist
 * damit ausgeschlossen.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import Stripe from "stripe";

const STRIPE_KEY = (process.env.STRIPE_SECRET_KEY ?? "").trim();
const DB_URL = process.env.CREDIT_REFUND_E2E_DATABASE_URL ?? "";

async function assertSafety(): Promise<void> {
  assert.ok(STRIPE_KEY, "STRIPE_SECRET_KEY fehlt (Testmodus).");
  // Stripe ist die Autoritaet, nicht das Praefix: ein Live-Key wird abgelehnt.
  const res = await fetch("https://api.stripe.com/v1/customers?limit=1", {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  if (!res.ok) throw new Error(`Safety gate: Key nicht pruefbar (HTTP ${res.status}).`);
  const body = (await res.json()) as { livemode?: boolean };
  if (body.livemode !== false) throw new Error("Safety gate: Key ist LIVE — Testlauf abgebrochen.");

  const target = new URL(DB_URL);
  const localDb =
    target.protocol === "postgresql:" &&
    ["127.0.0.1", "localhost"].includes(target.hostname) &&
    target.pathname === "/credit_refund_ci";
  if (!localDb) throw new Error("Safety gate: PostgreSQL-Test nur gegen lokale credit_refund_ci.");
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function main(): Promise<void> {
  await assertSafety();
  console.log("Safety: Stripe meldet livemode=false, Datenbank ist lokale credit_refund_ci.");

  const pool = new Pool({ connectionString: DB_URL, max: 2 });
  const ddl = await readFile("tests/fixtures/credit-ledger-test-schema.sql", "utf8");
  for (const stmt of ddl.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
    await pool.query(stmt);
  }
  await pool.query("TRUNCATE credit_ledger_entries RESTART IDENTITY");

  process.env.DATABASE_URL = DB_URL;
  const { grantCreditsDetailed, refundCreditsForCharge } = await import("../server/credit-ledger");
  const { findCreditPack } = await import("../lib/pricing-config");
  const tokensFor = (packId: string): number => {
    const pack = findCreditPack(packId);
    if (!pack) throw new Error(`Unbekanntes Paket: ${packId}`);
    return pack.tokens;
  };
  const stripe = new Stripe(STRIPE_KEY);

  const balanceOf = async (openId: string): Promise<number> => {
    const result = await pool.query("SELECT COALESCE(SUM(delta_tokens),0)::int AS b FROM credit_ledger_entries WHERE user_open_id=$1", [openId]);
    return num(result.rows[0]?.b);
  };
  const payAndGrant = async (input: {
    openId: string;
    packId: string;
    amountCents: number;
  }): Promise<{ paymentIntentId: string; chargeId: string; tokens: number }> => {
    const intent = await stripe.paymentIntents.create({
      amount: input.amountCents,
      currency: "eur",
      payment_method: "pm_card_visa",
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: `Erstattungs-E2E ${input.packId}`,
    });
    assert.equal(intent.status, "succeeded", `Zahlung ${intent.id} nicht erfolgreich: ${intent.status}`);
    const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    assert.ok(chargeId, "Zahlung ohne Charge.");

    const tokens = tokensFor(input.packId);
    const grant = await grantCreditsDetailed({
      openId: input.openId,
      tokens,
      reason: `Stripe-Testkauf ${input.packId}`,
      executionKey: `stripe_payment:e2e_${intent.id}`,
      paymentIntent: intent.id,
    });
    assert.equal(grant.booked, true, "Gutschrift wurde nicht gebucht.");
    return { paymentIntentId: intent.id, chargeId, tokens };
  };
  const refundCharge = async (chargeId: string): Promise<Stripe.Charge> => {
    return stripe.charges.retrieve(chargeId);
  };

  let failures = 0;
  const check = (label: string, condition: boolean, detail: string): void => {
    console.log(`${condition ? "OK  " : "FEHL"} ${label}: ${detail}`);
    if (!condition) failures += 1;
  };

  // 1) Voller Kauf, volle Erstattung
  const full = await payAndGrant({ openId: "e2e_full", packId: "credit_pack_medium", amountCents: 1999 });
  check("Gutschrift voller Kauf", (await balanceOf("e2e_full")) === full.tokens, `Saldo ${await balanceOf("e2e_full")} / ${full.tokens} Tokens`);

  await stripe.refunds.create({ payment_intent: full.paymentIntentId });
  const chargedFull = await refundCharge(full.chargeId);
  const fullResult = await refundCreditsForCharge({
    chargeId: full.chargeId,
    paymentIntent: full.paymentIntentId,
    paidCents: chargedFull.amount,
    refundedCents: chargedFull.amount_refunded,
  });
  const fullBalance = await balanceOf("e2e_full");
  check("Volle Erstattung gebucht", fullResult.booked, fullResult.reason);
  check("Saldo nach voller Erstattung 0", fullBalance === 0, `Saldo ${fullBalance}`);
  check(
    "Erstattete Menge entspricht der Gutschrift",
    fullResult.tokens === full.tokens,
    `${fullResult.tokens} / ${full.tokens} Tokens (Stripe erstattete ${chargedFull.amount_refunded} von ${chargedFull.amount} Cent)`,
  );

  // 2) Wiederholte Zustellung desselben Events
  const repeated = await refundCreditsForCharge({
    chargeId: full.chargeId,
    paymentIntent: full.paymentIntentId,
    paidCents: chargedFull.amount,
    refundedCents: chargedFull.amount_refunded,
  });
  const afterRepeat = await balanceOf("e2e_full");
  check("Wiederholung bucht nichts", !repeated.booked && repeated.duplicate, repeated.reason);
  check("Saldo bleibt 0", afterRepeat === 0, `Saldo ${afterRepeat}`);

  // 3) Teilerstattung
  const partial = await payAndGrant({ openId: "e2e_partial", packId: "credit_pack_large", amountCents: 2000 });
  await stripe.refunds.create({ payment_intent: partial.paymentIntentId, amount: 1000 });
  const chargedPartial = await refundCharge(partial.chargeId);
  const partialResult = await refundCreditsForCharge({
    chargeId: partial.chargeId,
    paymentIntent: partial.paymentIntentId,
    paidCents: chargedPartial.amount,
    refundedCents: chargedPartial.amount_refunded,
  });
  const expectedPartial = Math.floor(partial.tokens / 2);
  const partialBalance = await balanceOf("e2e_partial");
  check("Teilerstattung gebucht", partialResult.booked, partialResult.reason);
  check(
    "Teilerstattung anteilig und abgerundet",
    partialResult.tokens === expectedPartial && partialBalance === partial.tokens - expectedPartial,
    `${partialResult.tokens} Tokens entzogen, Saldo ${partialBalance} (erwartet ${expectedPartial})`,
  );

  // 4) Zweite Teilerstattung zieht nach, mehr als der Kauf geht nicht
  await stripe.refunds.create({ payment_intent: partial.paymentIntentId, amount: 1000 });
  const chargedRest = await refundCharge(partial.chargeId);
  const restResult = await refundCreditsForCharge({
    chargeId: partial.chargeId,
    paymentIntent: partial.paymentIntentId,
    paidCents: chargedRest.amount,
    refundedCents: chargedRest.amount_refunded,
  });
  const restBalance = await balanceOf("e2e_partial");
  check("Rest-Erstattung zieht nach", restResult.booked, restResult.reason);
  check("Saldo nach voller Erstattung 0 (Teilfall)", restBalance === 0, `Saldo ${restBalance}`);
  const totalRefunded = partialResult.tokens + restResult.tokens;
  check(
    "Nie mehr entzogen als gutgeschrieben",
    totalRefunded <= partial.tokens,
    `${totalRefunded} von ${partial.tokens} Tokens`,
  );

  // 5) Kappung, wenn das Guthaben schon verbraucht ist
  const spent = await payAndGrant({ openId: "e2e_spent", packId: "credit_pack_small", amountCents: 499 });
  await pool.query(
    "INSERT INTO credit_ledger_entries (user_open_id, delta_tokens, kind, reason, execution_key) VALUES ($1,$2,'reserve','Verbrauch im Test',$3)",
    ["e2e_spent", -(spent.tokens - 10_000), `e2e_reserve:${spent.paymentIntentId}`],
  );
  await stripe.refunds.create({ payment_intent: spent.paymentIntentId });
  const chargedSpent = await refundCharge(spent.chargeId);
  const cappedResult = await refundCreditsForCharge({
    chargeId: spent.chargeId,
    paymentIntent: spent.paymentIntentId,
    paidCents: chargedSpent.amount,
    refundedCents: chargedSpent.amount_refunded,
  });
  const cappedBalance = await balanceOf("e2e_spent");
  check("Kappung greift bei verbrauchtem Guthaben", cappedResult.cappedByBalance, cappedResult.reason);
  check("Kein Negativsaldo", cappedBalance >= 0, `Saldo ${cappedBalance}`);

  await pool.query("TRUNCATE credit_ledger_entries RESTART IDENTITY");
  await pool.end();

  if (failures > 0) {
    console.error(`ERGEBNIS: ${failures} Pruefung(en) fehlgeschlagen.`);
    process.exitCode = 1;
    return;
  }
  console.log("ERGEBNIS: OK — echter Stripe-Testkauf, echte Erstattung, Ledger stimmt in allen vier Faellen.");
}

main().catch((error: unknown) => {
  console.error("E2E abgebrochen:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
