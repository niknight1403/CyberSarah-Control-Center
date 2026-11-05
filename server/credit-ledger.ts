/**
 * Atomare Guthaben-Prüfung und -Buchung.
 *
 * Warum eine eigene Buchungstabelle statt Read-Modify-Write auf dem KV-Konto:
 * Zwei parallele Agenten-Läufe konnten bisher denselben Restbetrag doppelt
 * ausgeben. Hier läuft jede Prüfung+Buchung in einer Transaktion unter einer
 * Advisory-Lock pro Nutzer, und der Kontostand ist die Summe der Buchungen.
 * Damit ist "prüfen und abbuchen" unteilbar.
 *
 * Buchungsarten:
 *  - "grant"     Aufladung (Kauf, Kulanz, Migration)
 *  - "reserve"   Vorab-Reservierung eines Laufs (negativ)
 *  - "refund"    Rückgabe nicht verbrauchter Reservierung (positiv)
 *  - "settle"    Nachbuchung, wenn der Lauf teurer war als reserviert (negativ)
 */
import { sql } from "drizzle-orm";
import { computeRefundDelta } from "../lib/entitlement-logic";
import { getDb } from "./db";
import { CREDIT_PACKS_CANONICAL } from "../lib/pricing-config";

export type LedgerKind = "grant" | "reserve" | "refund" | "settle" | "usage";

export interface ReservationResult {
  ok: boolean;
  /** Kontostand nach der Buchung; null, wenn nicht lesbar. */
  balanceTokens: number | null;
  /** Grund bei Ablehnung: "insufficient" | "unavailable". */
  reason: "insufficient" | "unavailable" | null;
}

export function creditPacksForCheckout() {
  return CREDIT_PACKS_CANONICAL.map((pack) => ({
    id: pack.id,
    label: pack.label,
    tokens: pack.tokens,
    priceEur: pack.priceEur,
  }));
}

/**
 * Einzige Wahrheit für das Guthaben: Summe aller Buchungen.
 * Stripe-Käufe, Play-Käufe und Verbrauch landen alle hier.
 */
export async function getUserTotalCredits(userOpenId: string): Promise<number | null> {
  return readCreditBalance(userOpenId);
}

/**
 * Verbrauch abbuchen (nach einem Lauf). Idempotent über den Schlüssel —
 * `kind: "usage"` unterscheidet sich bewusst von Reservierung und Abgleich.
 */
export async function debitCredits(input: {
  openId: string;
  tokens: number;
  reason: string;
  executionKey: string;
}): Promise<boolean> {
  const tokens = Math.max(0, Math.ceil(input.tokens));
  if (tokens === 0) return false;
  const db = await getDb();
  if (!db) return false;
  try {
    await db.execute(sql`
      INSERT INTO "credit_ledger_entries" ("user_open_id", "delta_tokens", "kind", "reason", "execution_key")
      VALUES (${input.openId}, -${tokens}, 'usage', ${input.reason}, ${input.executionKey})
      ON CONFLICT ("user_open_id", "execution_key", "kind") DO NOTHING;
    `);
    return true;
  } catch (error) {
    console.warn("[credit-ledger] Verbrauch nicht gebucht:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

/** Aktueller Kontostand (Summe aller Buchungen). */
export async function readCreditBalance(openId: string): Promise<number | null> {
  const db = await getDb();
  if (!db || !openId) return null;
  try {
    const result = await db.execute(
      sql`SELECT COALESCE(SUM("delta_tokens"), 0)::int AS balance FROM "credit_ledger_entries" WHERE "user_open_id" = ${openId}`,
    );
    const rows = resultRows(result);
    const balance = rows[0]?.balance;
    return typeof balance === "number" ? balance : Number(balance ?? 0);
  } catch {
    return null;
  }
}

/**
 * Reserviert Guthaben atomar. Reicht der Stand nicht, wird nichts gebucht und
 * `reason: "insufficient"` zurückgegeben (Aufrufer antwortet mit HTTP 402).
 */
export async function reserveCredits(input: {
  openId: string;
  tokens: number;
  executionKey: string;
  reason?: string;
}): Promise<ReservationResult> {
  const tokens = Math.max(0, Math.ceil(input.tokens));
  if (tokens === 0) return { ok: true, balanceTokens: await readCreditBalance(input.openId), reason: null };
  const db = await getDb();
  if (!db) return { ok: false, balanceTokens: null, reason: "unavailable" };

  try {
    const result = await db.execute(sql`
      WITH locked AS (
        SELECT pg_advisory_xact_lock(hashtext(${input.openId})) AS lock
      ), balance AS (
        SELECT COALESCE(SUM("delta_tokens"), 0)::int AS current
        FROM "credit_ledger_entries", locked
        WHERE "user_open_id" = ${input.openId}
      ), booked AS (
        INSERT INTO "credit_ledger_entries" ("user_open_id", "delta_tokens", "kind", "reason", "execution_key")
        SELECT ${input.openId}, -${tokens}, 'reserve', ${input.reason ?? "Agenten-Lauf"}, ${input.executionKey}
        FROM balance
        WHERE balance.current >= ${tokens}
        ON CONFLICT ("user_open_id", "execution_key", "kind") DO NOTHING
        RETURNING "delta_tokens"
      )
      SELECT
        (SELECT current FROM balance) AS before,
        (SELECT COUNT(*)::int FROM booked) AS booked;
    `);
    const row = resultRows(result)[0] ?? {};
    const booked = Number(row.booked ?? 0);
    const before = Number(row.before ?? 0);
    if (booked > 0) return { ok: true, balanceTokens: before - tokens, reason: null };
    // Nichts gebucht: entweder zu wenig Guthaben oder Schlüssel schon vorhanden
    // (Wiederholung) — im Wiederholungsfall gilt die Reservierung als erteilt.
    if (before >= tokens) return { ok: true, balanceTokens: before, reason: null };
    return { ok: false, balanceTokens: before, reason: "insufficient" };
  } catch (error) {
    console.warn("[credit-ledger] Reservierung fehlgeschlagen:", error instanceof Error ? error.message : String(error));
    return { ok: false, balanceTokens: null, reason: "unavailable" };
  }
}

/**
 * Gleicht nach dem Lauf ab: zu viel Reserviertes zurückbuchen oder Mehrverbrauch
 * nachziehen. Fehler hier dürfen den Lauf nicht scheitern lassen.
 */
export async function settleCredits(input: {
  openId: string;
  reservedTokens: number;
  actualTokens: number;
  executionKey: string;
}): Promise<number | null> {
  const reserved = Math.max(0, Math.ceil(input.reservedTokens));
  const actual = Math.max(0, Math.ceil(input.actualTokens));
  const delta = reserved - actual;
  if (delta === 0) return readCreditBalance(input.openId);
  const db = await getDb();
  if (!db) return null;
  try {
    await db.execute(sql`
      INSERT INTO "credit_ledger_entries" ("user_open_id", "delta_tokens", "kind", "reason", "execution_key")
      VALUES (
        ${input.openId},
        ${delta},
        ${delta > 0 ? "refund" : "settle"},
        ${delta > 0 ? "Reservierung nicht verbraucht" : "Mehrverbrauch nach Abrechnung"},
        ${input.executionKey}
      )
      ON CONFLICT ("user_open_id", "execution_key", "kind") DO NOTHING;
    `);
    return readCreditBalance(input.openId);
  } catch (error) {
    console.warn("[credit-ledger] Abgleich fehlgeschlagen:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** Aufladung buchen (z. B. nach Stripe-Checkout oder Play-Kauf). */
export interface GrantResult {
  /** Wahr, wenn diese Anfrage die Buchung tatsaechlich angelegt hat. */
  booked: boolean;
  /** Wahr, wenn derselbe Schluessel bereits gebucht war (Doppelzustellung). */
  duplicate: boolean;
}

/**
 * Gutschrift mit ehrlichem Ergebnis.
 *
 * `ON CONFLICT DO NOTHING` allein reicht nicht: ohne `RETURNING` sieht der
 * Aufrufer keinen Unterschied zwischen "gebucht" und "war schon da". Genau
 * diese Unterscheidung entscheidet aber, ob ein Stripe-Webhook als erledigt
 * gilt. Datenbankfehler werden geworfen, damit der Aufrufer erneut zustellen
 * laesst statt die Gutschrift stillschweigend zu verlieren.
 */
export async function grantCreditsDetailed(input: {
  openId: string;
  tokens: number;
  reason: string;
  executionKey: string;
  paymentIntent?: string | null;
}): Promise<GrantResult> {
  const tokens = Math.max(0, Math.ceil(input.tokens));
  if (tokens === 0) return { booked: false, duplicate: false };
  const db = await getDb();
  if (!db) throw new Error("Kontodatenbank nicht verfuegbar — Gutschrift nicht gebucht.");
  const result = await db.execute(sql`
    INSERT INTO "credit_ledger_entries" ("user_open_id", "delta_tokens", "kind", "reason", "execution_key", "payment_intent")
    VALUES (${input.openId}, ${tokens}, 'grant', ${input.reason}, ${input.executionKey}, ${input.paymentIntent ?? null})
    ON CONFLICT ("user_open_id", "execution_key", "kind") DO NOTHING
    RETURNING "id";
  `);
  const inserted = resultRows(result).length > 0;
  if (!inserted) {
    console.info(
      `[credit-ledger] Gutschrift ${input.executionKey} war bereits gebucht — keine Doppelbuchung.`,
    );
  }
  return { booked: inserted, duplicate: !inserted };
}

/** Kompatibilitaets-Wrapper: true nur bei tatsaechlicher Buchung. */
export async function grantCredits(input: {
  openId: string;
  tokens: number;
  reason: string;
  executionKey: string;
}): Promise<boolean> {
  return (await grantCreditsDetailed(input)).booked;
}

export interface RefundResult {
  booked: boolean;
  duplicate: boolean;
  /** Wahr, wenn die Erstattung den Rahmen des Kaufs uebersteigt. */
  cappedByBalance: boolean;
  tokens: number;
  reason: string;
}

export interface RefundDeps {
  grantedTokensByPaymentIntent?: (paymentIntent: string) => Promise<{ openId: string; tokens: number } | null>;
  refundedTokensByPaymentIntent?: (openId: string, paymentIntent: string) => Promise<number>;
  balanceOf?: (openId: string) => Promise<number | null>;
  bookNegative?: (input: {
    openId: string;
    tokens: number;
    reason: string;
    executionKey: string;
    paymentIntent: string;
  }) => Promise<GrantResult>;
}

/** Gutschrift zu einer Zahlung nachschlagen (Anker fuer Erstattungen). */
export async function findGrantByPaymentIntent(
  paymentIntent: string,
): Promise<{ openId: string; tokens: number } | null> {
  const db = await getDb();
  if (!db) throw new Error("Kontodatenbank nicht verfuegbar.");
  const result = await db.execute(sql`
    SELECT "user_open_id", SUM("delta_tokens")::int AS "tokens"
    FROM "credit_ledger_entries"
    WHERE "payment_intent" = ${paymentIntent} AND "kind" = 'grant'
    GROUP BY "user_open_id"
    LIMIT 1;
  `);
  const row = resultRows(result)[0];
  if (!row) return null;
  const tokens = Number(row.tokens ?? 0);
  if (!Number.isFinite(tokens) || tokens <= 0) return null;
  return { openId: String(row.user_open_id ?? ""), tokens };
}

/** Bereits entzogene Tokens zu einer Zahlung. */
export async function refundedTokensForPaymentIntent(openId: string, paymentIntent: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Kontodatenbank nicht verfuegbar.");
  const result = await db.execute(sql`
    SELECT COALESCE(-SUM("delta_tokens"), 0)::int AS "tokens"
    FROM "credit_ledger_entries"
    WHERE "user_open_id" = ${openId} AND "payment_intent" = ${paymentIntent} AND "kind" = 'refund';
  `);
  const tokens = Number(resultRows(result)[0]?.tokens ?? 0);
  return Number.isFinite(tokens) && tokens > 0 ? tokens : 0;
}

/** Gegenbuchung als Ledger-Eintrag (negativ, eigene Art). */
async function bookRefundEntry(input: {
  openId: string;
  tokens: number;
  reason: string;
  executionKey: string;
  paymentIntent: string;
}): Promise<GrantResult> {
  const tokens = Math.max(0, Math.floor(input.tokens));
  if (tokens === 0) return { booked: false, duplicate: false };
  const db = await getDb();
  if (!db) throw new Error("Kontodatenbank nicht verfuegbar — Erstattung nicht gebucht.");
  const result = await db.execute(sql`
    INSERT INTO "credit_ledger_entries" ("user_open_id", "delta_tokens", "kind", "reason", "execution_key", "payment_intent")
    VALUES (${input.openId}, ${-tokens}, 'refund', ${input.reason}, ${input.executionKey}, ${input.paymentIntent})
    ON CONFLICT ("user_open_id", "execution_key", "kind") DO NOTHING
    RETURNING "id";
  `);
  return { booked: resultRows(result).length > 0, duplicate: resultRows(result).length === 0 };
}

/**
 * Erstattung verbuchen.
 *
 * Die Zielmenge richtet sich nach dem kumuliert erstatteten Betrag, gebucht wird
 * nur die Differenz zu bereits entzogenen Tokens. Der Schluessel enthaelt den
 * kumulierten Erstattungsbetrag, damit wiederholte Zustellungen desselben
 * Events nichts doppeln, spaetere Teil-Erstattungen aber nachziehen.
 * Mehr als das vorhandene Guthaben wird nie entzogen: kein Negativsaldo.
 */
export async function refundCreditsForCharge(
  input: {
    chargeId: string;
    paymentIntent: string;
    paidCents: number;
    refundedCents: number;
  },
  deps: RefundDeps = {},
): Promise<RefundResult> {
  const findGrant = deps.grantedTokensByPaymentIntent ?? findGrantByPaymentIntent;
  const sumRefunded = deps.refundedTokensByPaymentIntent ?? refundedTokensForPaymentIntent;
  const balanceOf = deps.balanceOf ?? readCreditBalance;
  const bookNegative = deps.bookNegative ?? bookRefundEntry;

  const grant = await findGrant(input.paymentIntent);
  if (!grant) {
    return {
      booked: false,
      duplicate: false,
      cappedByBalance: false,
      tokens: 0,
      reason: "Keine Guthaben-Gutschrift zu dieser Zahlung — nichts zu erstatten.",
    };
  }
  const already = await sumRefunded(grant.openId, input.paymentIntent);
  const balance = await balanceOf(grant.openId);
  const plan = computeRefundDelta({
    grantedTokens: grant.tokens,
    paidCents: input.paidCents,
    refundedCents: input.refundedCents,
    alreadyRefundedTokens: already,
    availableBalance: balance,
  });
  if (plan.delta === 0) {
    return {
      booked: false,
      duplicate: true,
      cappedByBalance: plan.cappedByBalance,
      tokens: 0,
      reason: `Nichts zu erstatten (bereits ${plan.already} von ${plan.target} Tokens entzogen).`,
    };
  }
  const result = await bookNegative({
    openId: grant.openId,
    tokens: plan.delta,
    reason: `Stripe-Erstattung ${input.chargeId}`.slice(0, 120),
    executionKey: `stripe_refund:${input.chargeId}:${Math.max(0, Math.floor(input.refundedCents))}`.slice(0, 190),
    paymentIntent: input.paymentIntent,
  });
  return {
    booked: result.booked,
    duplicate: result.duplicate,
    cappedByBalance: plan.cappedByBalance,
    tokens: result.booked ? plan.delta : 0,
    reason: plan.cappedByBalance
      ? `${plan.delta} Tokens erstattet, Rest nicht gedeckt (Guthaben bereits verbraucht).`
      : `${plan.delta} Tokens erstattet.`,
  };
}

function resultRows(result: unknown): Array<Record<string, unknown>> {
  if (!result) return [];
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const maybe = result as { rows?: unknown };
  if (Array.isArray(maybe.rows)) return maybe.rows as Array<Record<string, unknown>>;
  return [];
}
