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
}): Promise<GrantResult> {
  const tokens = Math.max(0, Math.ceil(input.tokens));
  if (tokens === 0) return { booked: false, duplicate: false };
  const db = await getDb();
  if (!db) throw new Error("Kontodatenbank nicht verfuegbar — Gutschrift nicht gebucht.");
  const result = await db.execute(sql`
    INSERT INTO "credit_ledger_entries" ("user_open_id", "delta_tokens", "kind", "reason", "execution_key")
    VALUES (${input.openId}, ${tokens}, 'grant', ${input.reason}, ${input.executionKey})
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

function resultRows(result: unknown): Array<Record<string, unknown>> {
  if (!result) return [];
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const maybe = result as { rows?: unknown };
  if (Array.isArray(maybe.rows)) return maybe.rows as Array<Record<string, unknown>>;
  return [];
}
