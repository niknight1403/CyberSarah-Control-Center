/**
 * DB-Ops: user-status — schreibgeschuetzte Benutzer-Diagnose.
 *
 * OP=user-status EMAIL=... : prueft, ob ein Konto existiert, und zeigt
 * Rolle, Login-Methode und letzten Login an. Keine Passwort-Hashes,
 * keine Secrets, keine Datenveraenderung.
 */

import { Client } from "pg";

const operation = process.env.OP ?? "";
const email = (process.env.EMAIL ?? "").trim().toLowerCase();

if (operation !== "user-status" || !email) {
  console.error("Usage: OP=user-status EMAIL=... node user-status.mjs");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const result = await client.query(
    "SELECT id, open_id, email, name, login_method, role, last_signed_in FROM users WHERE lower(email) = $1",
    [email]
  );
  if (result.rows.length === 0) {
    console.log(`USER-STATUS: Kein Konto mit E-Mail ${email} gefunden.`);
  } else {
    for (const row of result.rows) {
      console.log(
        `USER-STATUS: id=${row.id} | email=${row.email} | name=${row.name ?? "-"} | ` +
          `login_method=${row.login_method ?? "-"} | role=${row.role} | last_signed_in=${row.last_signed_in}`
      );
    }
  }
} catch (error) {
  console.error("Diagnose fehlgeschlagen:", error.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
