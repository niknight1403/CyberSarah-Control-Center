/**
 * DB-Ops: user-set-password — setzt den Passwort-Hash eines bestehenden Kontos.
 *
 * Sicherheit: Es wird NIEMALS ein Klartext-Passwort uebergeben, sondern nur
 * ein lokal vorberechneter scrypt-Hash im exakten Server-Format
 *   scrypt$<salt-base64url>$<derived-base64url>   (N=16384, r=8, p=1, keyLen=64)
 * Damit stehen keine Passwortdaten im Workflow-Input, Log oder Repo.
 *
 * OP=user-set-password EMAIL=... HASH=...
 */

import { Client } from "pg";

const operation = process.env.OP ?? "";
const email = (process.env.EMAIL ?? "").trim().toLowerCase();
const hash = (process.env.HASH ?? "").trim();

if (operation !== "user-set-password" || !email || !hash) {
  console.error("Usage: OP=user-set-password EMAIL=... HASH=... node user-set-password.mjs");
  process.exit(1);
}
if (!/^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/.test(hash)) {
  console.error("HASH hat nicht das erwartete Format scrypt$salt$derived.");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const result = await client.query(
    "UPDATE users SET password_hash = $1 WHERE lower(email) = $2 RETURNING id, email, role",
    [hash, email]
  );
  if (result.rows.length === 0) {
    console.log(`USER-SET-PASSWORD: Kein Konto mit E-Mail ${email} gefunden — nichts geaendert.`);
    process.exit(1);
  }
  for (const row of result.rows) {
    console.log(`USER-SET-PASSWORD: Passwort-Hash aktualisiert fuer id=${row.id} | email=${row.email} | role=${row.role}`);
  }
} catch (error) {
  console.error("Update fehlgeschlagen:", error.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
