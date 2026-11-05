/**
 * Erstattungskette in der Produktionsdatenbank pruefen — ohne Spuren.
 *
 * Ablauf:
 *  1. Lesen: existiert credit_ledger_entries.payment_intent wirklich?
 *  2. Lesen: wie sehen die Buchungen aktuell aus (Arten, Zahlungsbezug)?
 *  3. In EINER Transaktion: synthetische Gutschrift buchen, dann die ECHTE
 *     Funktion refundCreditsForCharge gegen eine echte Erstattung laufen
 *     lassen, Ergebnis pruefen, ROLLBACK.
 *
 * Es wird nie committet: die Transaktion endet mit ROLLBACK, auch im Fehlerfall.
 * Der Kontostand der Produktion bleibt unveraendert.
 */
import pg from "pg";
import { splitSslMode, sslOptionsFor } from "../../lib/migration-journal-logic";
import { refundCreditsForCharge } from "../../server/credit-ledger";

type Row = Record<string, unknown>;

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL fehlt.");
    process.exit(2);
  }
  const parts = splitSslMode(url);
  const client = new pg.Client({
    connectionString: parts.connectionString,
    ssl: sslOptionsFor(parts),
    statement_timeout: 20_000,
  });
  await client.connect();

  const problems: string[] = [];
  try {
    // 1) Spalte
    const column = await client.query<Row>(
      `SELECT data_type, character_maximum_length
         FROM information_schema.columns
        WHERE table_name = 'credit_ledger_entries' AND column_name = 'payment_intent'`,
    );
    if (column.rowCount === 0) {
      problems.push("Spalte payment_intent fehlt in credit_ledger_entries.");
      console.log("Spalte payment_intent: FEHLT");
    } else {
      console.log(
        `Spalte payment_intent: vorhanden (${String(column.rows[0].data_type)}, ${String(
          column.rows[0].character_maximum_length,
        )} Zeichen)`,
      );
    }

    const index = await client.query<Row>(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'credit_ledger_entries' AND indexname = 'credit_ledger_payment_intent_idx'`,
    );
    console.log(`Index credit_ledger_payment_intent_idx: ${index.rowCount ? "vorhanden" : "FEHLT"}`);
    if (!index.rowCount) problems.push("Index credit_ledger_payment_intent_idx fehlt.");

    // 2) Bestand (nur lesen)
    const kinds = await client.query<Row>(
      `SELECT kind, COUNT(*)::int AS entries, COALESCE(SUM(delta_tokens), 0)::bigint AS tokens
         FROM credit_ledger_entries GROUP BY kind ORDER BY kind`,
    );
    console.log("Buchungsarten:");
    for (const row of kinds.rows) {
      console.log(`  ${String(row.kind)}: ${num(row.entries)} Buchungen, ${num(row.tokens)} Tokens`);
    }
    const anchored = await client.query<Row>(
      `SELECT COUNT(*)::int AS mit_bezug FROM credit_ledger_entries WHERE payment_intent IS NOT NULL`,
    );
    console.log(`Buchungen mit Zahlungsbezug: ${num(anchored.rows[0]?.mit_bezug)}`);

    // 3) Echte Erstattungsfunktion in einer Transaktion, danach ROLLBACK
    const openId = `refund_verify_${Date.now()}`;
    const paymentIntent = `pi_verify_${Date.now()}`;
    const chargeId = `ch_verify_${Date.now()}`;
    const granted = 250_000;
    const paidCents = 1_999;

    await client.query("BEGIN");
    let result: Awaited<ReturnType<typeof refundCreditsForCharge>> | null = null;
    let sumAfter = 0;
    try {
      await client.query(
        `INSERT INTO credit_ledger_entries (user_open_id, delta_tokens, kind, reason, execution_key, payment_intent)
         VALUES ($1, $2, 'grant', 'Verifikation Erstattung', $3, $4)`,
        [openId, granted, `verify_grant:${openId}`, paymentIntent],
      );

      result = await refundCreditsForCharge(
        { chargeId, paymentIntent, paidCents, refundedCents: paidCents },
        {
          grantedTokensByPaymentIntent: async (pi: string) => {
            const found = await client.query<Row>(
              `SELECT user_open_id, SUM(delta_tokens)::int AS tokens
                 FROM credit_ledger_entries WHERE payment_intent = $1 AND kind = 'grant'
                GROUP BY user_open_id LIMIT 1`,
              [pi],
            );
            const row = found.rows[0];
            if (!row) return null;
            return { openId: String(row.user_open_id), tokens: num(row.tokens) };
          },
          refundedTokensByPaymentIntent: async (oid: string, pi: string) => {
            const found = await client.query<Row>(
              `SELECT COALESCE(-SUM(delta_tokens), 0)::int AS tokens
                 FROM credit_ledger_entries
                WHERE user_open_id = $1 AND payment_intent = $2 AND kind = 'refund'`,
              [oid, pi],
            );
            return num(found.rows[0]?.tokens);
          },
          balanceOf: async (oid: string) => {
            const found = await client.query<Row>(
              `SELECT COALESCE(SUM(delta_tokens), 0)::int AS balance
                 FROM credit_ledger_entries WHERE user_open_id = $1`,
              [oid],
            );
            return num(found.rows[0]?.balance);
          },
          bookNegative: async (input: {
            openId: string;
            tokens: number;
            reason: string;
            executionKey: string;
            paymentIntent: string;
          }) => {
            const inserted = await client.query<Row>(
              `INSERT INTO credit_ledger_entries (user_open_id, delta_tokens, kind, reason, execution_key, payment_intent)
               VALUES ($1, $2, 'refund', $3, $4, $5)
               ON CONFLICT (user_open_id, execution_key, kind) DO NOTHING
               RETURNING id`,
              [input.openId, -input.tokens, input.reason, input.executionKey, input.paymentIntent],
            );
            return { booked: (inserted.rowCount ?? 0) > 0, duplicate: (inserted.rowCount ?? 0) === 0 };
          },
        },
      );

      const after = await client.query<Row>(
        `SELECT COALESCE(SUM(delta_tokens), 0)::int AS balance
           FROM credit_ledger_entries WHERE user_open_id = $1`,
        [openId],
      );
      sumAfter = num(after.rows[0]?.balance);
    } finally {
      // Immer zurueckrollen: die Produktion sieht keine Testbuchung.
      await client.query("ROLLBACK");
    }

    console.log(`Erstattungsfunktion: ${result?.booked ? "gebucht" : "nicht gebucht"} | Tokens: ${result?.tokens}`);
    console.log(`Begruendung: ${result?.reason}`);
    console.log(`Saldo nach Erstattung (in der Transaktion): ${sumAfter} (Gutschrift ${granted}, erwartet 0)`);

    if (!result?.booked || result.tokens !== granted) {
      problems.push(`Erstattung nicht wie erwartet: ${result?.tokens ?? 0} statt ${granted} Tokens.`);
    }
    if (sumAfter !== 0) problems.push(`Saldo nach voller Erstattung ist ${sumAfter} statt 0.`);

    // Wiederholte Zustellung: dieselbe Erstattung darf nicht doppelt buchen.
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO credit_ledger_entries (user_open_id, delta_tokens, kind, reason, execution_key, payment_intent)
         VALUES ($1, $2, 'grant', 'Verifikation Erstattung', $3, $4)`,
        [openId, granted, `verify_grant:${openId}`, paymentIntent],
      );
      const book = async (tokens: number) => {
        const inserted = await client.query<Row>(
          `INSERT INTO credit_ledger_entries (user_open_id, delta_tokens, kind, reason, execution_key, payment_intent)
           VALUES ($1, $2, 'refund', 'Verifikation Erstattung', $3, $4)
           ON CONFLICT (user_open_id, execution_key, kind) DO NOTHING
           RETURNING id`,
          [openId, -tokens, `stripe_refund:${chargeId}:${paidCents}`, paymentIntent],
        );
        return (inserted.rowCount ?? 0) > 0;
      };
      const first = await book(granted);
      const second = await book(granted);
      console.log(`Doppelzustellung: erster Lauf gebucht=${first}, zweiter Lauf gebucht=${second} (erwartet true/false)`);
      if (!first || second) problems.push("Doppelzustellung wurde nicht korrekt abgefangen.");
    } finally {
      await client.query("ROLLBACK");
    }

    const residue = await client.query<Row>(
      `SELECT COUNT(*)::int AS n FROM credit_ledger_entries WHERE user_open_id = $1`,
      [openId],
    );
    const n = num(residue.rows[0]?.n);
    console.log(`Rueckstaende in der Produktion: ${n} (erwartet 0)`);
    if (n !== 0) problems.push(`${n} Verifikationsbuchungen sind stehen geblieben.`);

    if (problems.length) {
      console.error(`ERGEBNIS: FEHLER\n- ${problems.join("\n- ")}`);
      process.exitCode = 1;
      return;
    }
    console.log("ERGEBNIS: OK — Schema, Erstattung und Doppelzustellung verhalten sich wie erwartet.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Verifikation abgebrochen:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
