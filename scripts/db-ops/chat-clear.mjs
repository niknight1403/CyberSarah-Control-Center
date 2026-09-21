/**
 * DB-Ops — Chat-Verlauf leeren (preview | delete).
 * Liest DATABASE_URL aus der Umgebung; connectet mit TLS.
 * preview zaehlt Zeilen/Sessionen/Nutzer, delete loescht alle chatMessages.
 */
import pg from "pg";

const { Pool } = pg;
const url = process.env.DATABASE_URL;
const op = process.env.OP;

if (!url) {
  console.error("DATABASE_URL fehlt.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  if (op === "chat-clear-preview") {
    const { rows } = await pool.query(
      'SELECT count(*)::int AS messages, count(DISTINCT "sessionId")::int AS sessions, count(DISTINCT "userOpenId")::int AS users FROM "chatMessages"',
    );
    console.log(`PREVIEW: ${rows[0].messages} Nachrichten in ${rows[0].sessions} Sessionen von ${rows[0].users} Nutzer(n).`);
  } else if (op === "chat-clear-delete") {
    const { rows } = await pool.query('SELECT count(*)::int AS messages FROM "chatMessages"');
    const before = rows[0].messages;
    await pool.query('DELETE FROM "chatMessages"');
    console.log(`DELETE: ${before} Nachrichten geloescht. Tabelle chatMessages ist jetzt leer.`);
  } else {
    console.error(`Unbekannte Operation: ${op}`);
    process.exit(1);
  }
} finally {
  await pool.end();
}
